"""DJ: chat với Claude Code (chạy ngầm bằng gói Claude của người dùng) để chọn và mở nhạc.

Mỗi tin nhắn chạy `claude -p` một lần (tiếp tục cùng phiên bằng --resume), chỉ cho dùng các công cụ của app
qua MCP (mcp_server.py): không Bash, không đọc/sửa file. Không nạp cài đặt/hook cá nhân của Claude Code.
Ai muốn dùng API key riêng thì nhập trong Cài đặt -> chuyển vào ANTHROPIC_API_KEY cho tiến trình claude.
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import threading
import time

import core
from core import log

AGENT_DIR = os.path.join(core.DATA_DIR, "agent")
TIMEOUT = 300  # giây cho 1 lượt trả lời

SYSTEM_PROMPT = """Bạn là DJ của "Nhạc" - app nghe nhạc trên máy tính của người dùng. Người dùng chat với bạn bằng \
tiếng Việt đời thường, có thể chửi thề, xưng hô kiểu "thầy", "tao/mày", "anh/em". Hãy xưng hô theo đúng cách họ nói, \
giọng thân thiện, vui, ngắn gọn (1-3 câu), không giảng giải.

Việc của bạn: hiểu tâm trạng/hoàn cảnh và TỰ chọn, xếp, mở nhạc bằng các công cụ - đừng hỏi lại khi đã đủ để chọn. \
Chỉ hỏi khi yêu cầu thật sự mơ hồ.

Cách làm khi được nhờ mở nhạc:
1. Gọi get_context để biết giờ, bài đang phát, gu nghe và danh sách chặn.
2. Gom ứng viên: bài quen trong gu (search_library, bài nghe nhiều/yêu thích trong context) và bài mới đúng gu. \
Bài mới phải tìm ở CẢ HAI nguồn cho phong phú:
   - YouTube (search_online source=yt): bản chính thức, MV, lyric video.
   - SoundCloud (search_online source=sc): luôn tìm ít nhất 2 lần với câu tìm khác nhau. SoundCloud mạnh về remix, \
lofi, slowed/speed up, mashup, bản indie/underground Việt mà YouTube ít có.
   - related_tracks từ 1-2 bài làm hạt giống, nên có 1 hạt giống là bài SoundCloud (cho ra gợi ý của SoundCloud).
3. Chọn 15-30 bài, xếp theo "mạch cảm xúc": buồn mà muốn được an ủi thì đi từ buồn -> nhẹ -> ấm dần; muốn đắm chìm \
thì giữ một màu. Trộn khoảng 40% bài quen, 60% bài mới trừ khi người dùng muốn khác. Nhắm khoảng 1/3 playlist là \
bài SoundCloud nếu tìm được bài hợp (đừng nhét bài không hợp chỉ để đủ tỉ lệ). Người dùng chỉ định nguồn nào thì theo.
4. Gọi play_tracks (mode replace, đặt title ngắn kiểu "Tối thứ Ba buồn hiu"). Đang nghe mà người dùng muốn đổi \
hướng thì dùng mode after_current để không cắt ngang bài đang phát.
5. Trả lời 1-2 câu kiểu DJ dẫn chương trình, nói tên buổi nghe. Không liệt kê mã bài (uri), không dán danh sách dài.

Hiểu gu người dùng (trong get_context):
- habits: thói quen tự tính từ nhật ký nghe. Ưu tiên ca sĩ/kiểu nhạc hợp khung giờ hiện tại (nowSlot, bySlot), \
có thể chèn 1-2 bài "hotNow" (đang nghiện) hoặc "coreTracks" (bài ruột). Tránh bài trong oftenSkipped/disliked và \
hạn chế ca sĩ trong oftenSkippedArtists. djSkipRate cao nghĩa là bài bạn chọn trước đây hay bị bỏ qua: bám gu sát hơn.
- memory: ghi nhớ dài hạn. Luôn tôn trọng (vd "ghét remix TikTok" thì không chọn remix TikTok).
- Khi người dùng nói ra sở thích/thói quen lâu dài (thích/ghét/hay nghe gì lúc nào...), gọi remember với 1 câu ngắn; \
nói "quên cái đó đi"/"không đúng nữa" thì forget. Không ghi tâm trạng nhất thời ("hôm nay buồn"). Ghi xong không \
cần khoe dài, chỉ nhắc 1 câu kiểu "nhớ rồi nha".
- Có thể set_volume khi được nhờ chỉnh tiếng, sleep_timer khi người dùng sắp ngủ hoặc nhờ hẹn giờ tắt.

Quy tắc chọn bài:
- TUYỆT ĐỐI không chọn bài của ca sĩ trong danh sách chặn, kể cả bài họ hát cùng (feat/x), bài cover hay remix \
bài của họ. Người dùng nói ghét/không nghe một CA SĨ thì gọi block_artist; ghét một KIỂU nhạc (remix TikTok, EDM...) \
thì chỉ remember, không block. Đừng tự nhắc tới danh sách chặn khi người dùng không hỏi.
- Không lặp một bài (kể cả bản upload khác của cùng bài). Ưu tiên bản chính thức (Official MV/Audio/Lyric).
- Tránh video tổng hợp/mix dài hơn 10 phút trừ khi được yêu cầu.
- Chỉ dùng uri lấy từ kết quả công cụ, không tự bịa.
Câu hỏi không liên quan đến nhạc thì trả lời ngắn rồi lái về nhạc."""


# ---------------------------------------------------------------- tìm Claude Code
def find_claude():
    """Đường dẫn claude.exe thật (không chạy qua claude.cmd của npm: truyền tham số qua .cmd không an toàn)."""
    candidates = [os.path.join(os.path.expanduser("~"), ".local", "bin", "claude.exe")]
    which = shutil.which("claude")
    if which:
        base = os.path.dirname(which)
        candidates += [which if which.lower().endswith(".exe") else "",
                       os.path.join(base, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")]
    candidates.append(os.path.join(os.environ.get("APPDATA", ""), "npm", "node_modules", "@anthropic-ai",
                                   "claude-code", "bin", "claude.exe"))
    # Bản đi kèm extension VS Code (lấy bản mới nhất)
    ext = sorted(glob.glob(os.path.join(os.path.expanduser("~"), ".vscode", "extensions", "anthropic.claude-code-*",
                                        "resources", "native-binary", "claude.exe")), reverse=True)
    candidates += ext
    return next((c for c in candidates if c and os.path.isfile(c)), None)


def mcp_command():
    """Lệnh để Claude Code chạy máy chủ MCP của app."""
    if core.FROZEN:
        return sys.executable, ["--mcp"]
    return sys.executable, [os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_server.py")]


# ---------------------------------------------------------------- dịch luồng sự kiện của Claude Code
TOOL_LABELS = {
    "get_context": "Xem gu nghe của bạn",
    "search_library": "Tìm trong thư viện",
    "search_online": "Tìm trên {src}",
    "related_tracks": "Tìm bài cùng không khí",
    "get_lyrics": "Đọc lời bài hát",
    "play_tracks": "Xếp nhạc",
    "control": "Điều khiển trình phát",
    "save_playlist": "Lưu playlist",
    "play_playlist": "Mở playlist",
    "block_artist": "Chặn",
    "unblock_artist": "Bỏ chặn",
    "set_volume": "Chỉnh âm lượng",
    "sleep_timer": "Hẹn giờ tắt nhạc",
    "remember": "Ghi nhớ",
    "forget": "Xoá ghi nhớ",
}


def tool_label(name, args):
    short = name.split("__")[-1]
    label = TOOL_LABELS.get(short, short).format(src="SoundCloud" if (args or {}).get("source") == "sc" else "YouTube")
    a = args or {}
    detail = a.get("query") or a.get("name") or a.get("title") or a.get("note") or ""
    if not detail and short == "set_volume":
        detail = f'{a.get("percent")}%'
    if not detail and short == "sleep_timer":
        detail = "hết bài này" if a.get("end_of_track") else (f'{a.get("minutes")} phút' if a.get("minutes") else "huỷ")
    return f"{label}: {detail}" if detail else label


def usage_of(result):
    """Số token của 1 lượt trả lời, cộng mọi model (Claude Code còn ngầm dùng Haiku cho việc phụ)."""
    models = {}
    totals = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}
    for name, m in (result.get("modelUsage") or {}).items():
        part = {"input": m.get("inputTokens") or 0, "output": m.get("outputTokens") or 0,
                "cacheRead": m.get("cacheReadInputTokens") or 0, "cacheWrite": m.get("cacheCreationInputTokens") or 0}
        for k in totals:
            totals[k] += part[k]
        models[name.replace("claude-", "")] = sum(part.values())
    return {"type": "usage", **totals, "total": sum(totals.values()), "models": models,
            "costUsd": round(result.get("total_cost_usd") or 0, 4), "durationMs": result.get("duration_ms") or 0,
            "turns": result.get("num_turns") or 0}


def limits_of(event):
    """Hạn mức gói Claude: % đã dùng của cửa sổ 5 giờ / 7 ngày và lúc đặt lại."""
    info = event.get("rate_limit_info") or {}
    windows = {k: {"used": w.get("utilization"), "resetsAt": w.get("resetsAt"), "status": w.get("status")}
               for k, w in (info.get("unifiedWindows") or {}).items() if isinstance(w, dict)}
    return {"type": "limits", "status": info.get("status"), "windows": windows}


def translate(event):
    """1 dòng stream-json của Claude Code -> danh sách sự kiện cho khung chat."""
    t = event.get("type")
    out = []
    if t == "rate_limit_event":
        out.append(limits_of(event))
    elif t == "assistant":
        for block in (event.get("message") or {}).get("content") or []:
            if block.get("type") == "text" and block.get("text", "").strip():
                out.append({"type": "text", "text": block["text"].strip()})
            elif block.get("type") == "tool_use":
                out.append({"type": "tool", "text": tool_label(block.get("name", ""), block.get("input"))})
    elif t == "result":
        if event.get("is_error") or event.get("subtype") not in (None, "success"):
            msg = event.get("result") or event.get("subtype") or "Claude Code báo lỗi"
            out.append({"type": "error", "text": str(msg)[:500]})
        if event.get("modelUsage"):
            out.append(usage_of(event))
        out.append({"type": "done", "session": event.get("session_id")})
    return out


def friendly_error(text):
    low = (text or "").lower()
    if "login" in low or "log in" in low or "/login" in low or "authenticat" in low or "api key" in low:
        return "Claude Code chưa đăng nhập. Mở Claude Code, gõ /login rồi thử lại (hoặc nhập API key trong Cài đặt)."
    if "rate" in low and "limit" in low or "usage limit" in low:
        return "Gói Claude của bạn đã hết lượt dùng tạm thời. Đợi một lúc rồi thử lại nhé."
    return text


# ---------------------------------------------------------------- chạy 1 lượt chat
class Agent:
    def __init__(self, emit, port_fn, token):
        self.emit = emit          # hàm gửi sự kiện cho khung chat
        self.port_fn = port_fn    # cổng server của app (để máy chủ MCP gọi về)
        self.token = token
        self.session = None
        self.proc = None
        self.lock = threading.Lock()
        self.last_limits = None  # hạn mức gói Claude lần gần nhất (để mở lại khung chat vẫn thấy)
        self.paid = False        # đang dùng API key riêng (tốn tiền thật) thay vì gói Claude

    @property
    def busy(self):
        return self.proc is not None and self.proc.poll() is None

    def reset(self):
        self.cancel()
        self.session = None

    def cancel(self):
        proc = self.proc
        if proc and proc.poll() is None:
            proc.kill()

    def send(self, text, model="", api_key=""):
        """Bắt đầu 1 lượt trả lời ở luồng nền. Trả về None nếu chạy được, ngược lại là lý do."""
        claude = find_claude()
        if not claude:
            return "Chưa có Claude Code trên máy. Cài Claude Code và đăng nhập trước nhé."
        with self.lock:
            if self.busy:
                return "DJ đang trả lời, đợi chút hoặc bấm Dừng."
            os.makedirs(AGENT_DIR, exist_ok=True)
            mcp_path = os.path.join(AGENT_DIR, "mcp.json")
            prompt_path = os.path.join(AGENT_DIR, "system-prompt.txt")
            cmd, args = mcp_command()
            core.write_json(mcp_path, {"mcpServers": {"nhac": {"command": cmd, "args": args, "env": {
                "NHAC_PORT": str(self.port_fn()), "NHAC_AGENT_TOKEN": self.token}}}})
            with open(prompt_path, "w", encoding="utf-8") as fh:
                fh.write(SYSTEM_PROMPT)
            argv = [claude, "-p", "--output-format", "stream-json", "--verbose",
                    "--tools", "", "--strict-mcp-config", "--mcp-config", mcp_path,
                    "--allowedTools", "mcp__nhac", "--permission-prompts", "none",
                    "--setting-sources", "project", "--system-prompt-file", prompt_path]
            if model:
                argv += ["--model", model]
            if self.session:
                argv += ["--resume", self.session]
            env = dict(os.environ)
            self.paid = bool(api_key)
            if api_key:
                env["ANTHROPIC_API_KEY"] = api_key
            try:
                self.proc = subprocess.Popen(argv, cwd=AGENT_DIR, env=env, stdin=subprocess.PIPE,
                                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                             creationflags=core.NO_WINDOW)
            except OSError as exc:
                return f"Không chạy được Claude Code: {exc}"
            proc = self.proc
        threading.Thread(target=self._run, args=(proc, text), name="agent", daemon=True).start()
        return None

    def _run(self, proc, text):
        started = time.time()
        stderr = []
        threading.Thread(target=lambda: stderr.extend(proc.stderr.read().decode("utf-8", "replace").splitlines()),
                         daemon=True).start()
        timer = threading.Timer(TIMEOUT, proc.kill)
        timer.start()
        done = False
        try:
            # Tin nhắn đi qua stdin (không qua tham số dòng lệnh), kèm giờ hiện tại
            stamp = time.strftime("%H:%M, %A %d/%m/%Y")
            proc.stdin.write(f"[Bây giờ: {stamp}]\n{text}".encode("utf-8"))
            proc.stdin.close()
            for raw in proc.stdout:
                try:
                    event = json.loads(raw.decode("utf-8"))
                except ValueError:
                    continue
                for ev in translate(event):
                    if ev["type"] == "done":
                        # Chưa báo "xong" ngay: claude còn đóng máy chủ MCP vài giây, báo sớm thì tin nhắn
                        # kế tiếp gửi vào lúc tiến trình cũ chưa thoát sẽ bị từ chối
                        done = True
                        if ev.get("session"):
                            self.session = ev["session"]
                        continue
                    if ev["type"] == "error":
                        ev["text"] = friendly_error(ev["text"])
                    elif ev["type"] == "limits":
                        self.last_limits = ev
                    elif ev["type"] == "usage":
                        ev["paid"] = self.paid
                    self.emit(ev)
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        except OSError as exc:
            log.warning("DJ lỗi: %s", exc)
        finally:
            timer.cancel()
        if done:
            self.emit({"type": "done", "session": self.session})
        else:
            killed = proc.returncode is not None and proc.returncode != 0 and time.time() - started >= TIMEOUT
            reason = "DJ nghĩ lâu quá nên đã dừng." if killed else friendly_error(" ".join(stderr[-3:]) or "DJ đã dừng.")
            if proc.returncode not in (0, None) or stderr:
                log.warning("Claude Code thoát mã %s: %s", proc.returncode, " | ".join(stderr[-5:]))
            self.emit({"type": "error", "text": reason})
            self.emit({"type": "done", "session": self.session})
        log.info("DJ trả lời xong sau %.1fs", time.time() - started)
