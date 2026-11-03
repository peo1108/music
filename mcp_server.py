"""Máy chủ MCP (stdio) cho DJ: Claude Code gọi các công cụ này để điều khiển app Nhạc.

Claude Code tự chạy tiến trình này (NhacPlayer.exe --mcp, hoặc python mcp_server.py). Mỗi lệnh được chuyển
nguyên về app đang mở qua http://127.0.0.1:<NHAC_PORT>/api/agent/tool, kèm mã NHAC_AGENT_TOKEN mà app tạo
mỗi lần khởi động. Chỉ dùng thư viện chuẩn để khởi động nhanh.
"""
import json
import os
import sys
import urllib.error
import urllib.request

SERVER = {"name": "nhac", "version": "1.0"}


def _obj(props, required=()):
    return {"type": "object", "properties": props, "required": list(required), "additionalProperties": False}


URIS = {"type": "array", "items": {"type": "string"}, "description": "Mã bài (uri) lấy từ kết quả các công cụ khác"}
TOOLS = [
    {"name": "get_context",
     "description": "Bối cảnh nghe nhạc: giờ hiện tại, bài đang phát, hàng đợi sắp tới, gu nghe (ca sĩ/bài nghe nhiều, "
                    "yêu thích, nghe gần đây), các playlist, danh sách chặn. Gọi đầu tiên khi cần chọn nhạc.",
     "inputSchema": _obj({})},
    {"name": "search_library",
     "description": "Tìm bài trong thư viện nhạc trên máy theo tên bài/ca sĩ/album. Bỏ trống query để lấy cả thư viện.",
     "inputSchema": _obj({"query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}})},
    {"name": "search_online",
     "description": "Tìm bài trên YouTube (source=yt) hoặc SoundCloud (source=sc). Kết quả đã lọc ca sĩ bị chặn.",
     "inputSchema": _obj({"query": {"type": "string"}, "source": {"type": "string", "enum": ["yt", "sc"]},
                          "limit": {"type": "integer", "minimum": 1, "maximum": 15}}, ["query"])},
    {"name": "related_tracks",
     "description": "Bài cùng không khí với 1 bài (YouTube Mix / SoundCloud Recommended; bài trong máy thì tìm bản "
                    "YouTube rồi lấy Mix). Hợp để mở rộng playlist từ 1 bài làm hạt giống.",
     "inputSchema": _obj({"uri": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 30}}, ["uri"])},
    {"name": "get_lyrics",
     "description": "Lời bài hát (rút gọn) để kiểm tra bài có hợp tâm trạng không.",
     "inputSchema": _obj({"uri": {"type": "string"}}, ["uri"])},
    {"name": "play_tracks",
     "description": "Xếp và phát nhạc. mode: replace = thay hàng đợi và phát ngay từ bài đầu; after_current = giữ "
                    "bài đang phát, thay các bài phía sau; append = thêm vào cuối hàng đợi. Bài của ca sĩ bị chặn "
                    "tự bị loại.",
     "inputSchema": _obj({"uris": URIS, "mode": {"type": "string", "enum": ["replace", "after_current", "append"]},
                          "title": {"type": "string", "description": "Tên ngắn cho buổi nghe này"}}, ["uris"])},
    {"name": "control",
     "description": "Điều khiển trình phát: pause, resume, next, previous.",
     "inputSchema": _obj({"action": {"type": "string", "enum": ["pause", "resume", "next", "previous"]}}, ["action"])},
    {"name": "save_playlist",
     "description": "Lưu danh sách bài thành playlist trong app.",
     "inputSchema": _obj({"name": {"type": "string"}, "uris": URIS}, ["name", "uris"])},
    {"name": "play_playlist",
     "description": "Phát 1 playlist đã có trong app theo tên.",
     "inputSchema": _obj({"name": {"type": "string"}, "shuffle": {"type": "boolean"}}, ["name"])},
    {"name": "block_artist",
     "description": "Thêm ca sĩ/từ khoá vào danh sách Không bao giờ phát (khi người dùng nói ghét/không nghe ai).",
     "inputSchema": _obj({"name": {"type": "string"}}, ["name"])},
    {"name": "unblock_artist",
     "description": "Bỏ ca sĩ/từ khoá khỏi danh sách Không bao giờ phát.",
     "inputSchema": _obj({"name": {"type": "string"}}, ["name"])},
]


def call_app(name, args):
    """Chuyển lệnh về app. Trả về (kết quả, có_lỗi)."""
    port = os.environ.get("NHAC_PORT", "47816")
    body = json.dumps({"name": name, "args": args or {}}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/agent/tool", data=body, method="POST", headers={
        "Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}",
        "X-Nhac-Agent": os.environ.get("NHAC_AGENT_TOKEN", "")})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return f"App từ chối lệnh (HTTP {exc.code})", True
    except (OSError, ValueError) as exc:
        return f"Không kết nối được app Nhạc: {exc}", True
    if isinstance(data, dict) and data.get("error"):
        return data["error"], True
    return data.get("result") if isinstance(data, dict) else data, False


def handle(msg):
    """Xử lý 1 thông điệp JSON-RPC. Trả về phản hồi, hoặc None với thông báo (notification)."""
    method, mid = msg.get("method"), msg.get("id")
    if mid is None:
        return None  # notifications/initialized...
    if method == "initialize":
        version = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
        result = {"protocolVersion": version, "capabilities": {"tools": {}}, "serverInfo": SERVER}
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "tools/call":
        params = msg.get("params") or {}
        if params.get("name") not in {t["name"] for t in TOOLS}:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": "Không có công cụ này"}}
        out, is_error = call_app(params["name"], params.get("arguments") or {})
        text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)
        result = {"content": [{"type": "text", "text": text}], "isError": is_error}
    elif method == "ping":
        result = {}
    else:
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"Không hỗ trợ {method}"}}
    return {"jsonrpc": "2.0", "id": mid, "result": result}


def _streams():
    # App đóng gói dạng cửa sổ (không console) có thể có sys.stdin/stdout = None dù vẫn nhận ống dẫn từ Claude Code
    inp = sys.stdin.buffer if sys.stdin else os.fdopen(0, "rb")
    out = sys.stdout.buffer if sys.stdout else os.fdopen(1, "wb")
    return inp, out


def main():
    inp, out = _streams()
    for raw in inp:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw.decode("utf-8"))
        except ValueError:
            reply = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON hỏng"}}
        else:
            reply = handle(msg) if isinstance(msg, dict) else None
        if reply is not None:
            out.write(json.dumps(reply, ensure_ascii=False).encode("utf-8") + b"\n")
            out.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
