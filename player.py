"""Trình phát nhạc Nhạc: cửa sổ app không viền (WebView2) + server nội bộ cho giao diện trong web/.

Chạy thử:  python player.py [file nhạc]
Đóng gói:  python build.py  (tạo bộ cài dist/NhacSetup-x.y.z.exe)
Mở thêm file khi app đang chạy thì file được chuyển sang cửa sổ đang mở (chỉ chạy 1 cửa sổ).
NhacPlayer.exe --mcp: chạy máy chủ MCP cho DJ (Claude Code gọi), không mở cửa sổ.
"""
import sys

if __name__ == "__main__" and "--mcp" in sys.argv[1:]:  # trước các import nặng để khởi động nhanh
    import mcp_server
    sys.exit(mcp_server.main())

import base64
import ctypes
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from array import array
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import mutagen
import webview
from mutagen.flac import FLAC, Picture
from mutagen.id3 import ID3
from mutagen.mp4 import MP4, MP4Cover

import agent
import blocklist
import core
import downloads
import online
import updater
import ytdlp_update
from core import DATA_DIR, NO_WINDOW, log, read_json, write_json

AGENT_TOKEN = secrets.token_hex(16)  # máy chủ MCP của DJ phải gửi kèm mã này mới gọi được /api/agent/tool

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET_DIR = getattr(sys, "_MEIPASS", HERE)
WEB_DIR = os.path.join(ASSET_DIR, "web")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
BACKUP_KEEP = 14  # số bản sao lưu state.json giữ lại (mỗi ngày 1 bản)
LYRICS_DIR = os.path.join(DATA_DIR, "lyrics")
PEAKS_DIR = os.path.join(DATA_DIR, "peaks")
PORT = 47816  # cố định để chỉ chạy 1 cửa sổ
AUDIO_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".webm": "audio/webm",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
}
STREAM_TYPES = {**AUDIO_TYPES, ".aac": "audio/aac"}
WEB_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}
DEFAULT_SIZE = (1180, 760)  # các cỡ này tính theo px giao diện
MIN_SIZE = (900, 600)
SWP_NOZORDER, SWP_NOACTIVATE = 0x4, 0x10
VK_LBUTTON, VK_RBUTTON, SM_SWAPBUTTON = 0x01, 0x02, 23

window = None
css_scale = 1.0  # tỉ lệ điểm ảnh thật / px giao diện (devicePixelRatio của trang)
window_sized = False
state_lock = threading.Lock()
settings_lock = threading.Lock()


# ---------------------------------------------------------------- cài đặt & thư viện nhạc
def load_settings():
    data = read_json(SETTINGS_FILE)
    return data if isinstance(data, dict) else {}


def update_settings(**changes):
    with settings_lock:
        settings = load_settings()
        settings.update(changes)
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            write_json(SETTINGS_FILE, settings)
        except OSError:
            log.warning("Không ghi được settings.json", exc_info=True)


def default_library():
    """Bản cài: thư mục Nhạc của người dùng (Music\\Nhac). Chạy từ mã nguồn: out/ cạnh file script."""
    if core.FROZEN:
        return os.path.join(os.path.expanduser("~"), "Music", "Nhac")
    return os.path.join(HERE, "out")


def library_dir():
    lib = load_settings().get("library")
    if lib and os.path.isdir(lib):
        return lib
    return default_library()


def get_cover(path):
    """Trả về (mime, bytes) của ảnh bìa, hoặc None."""
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".mp3":
            pics = ID3(path).getall("APIC")
            return (pics[0].mime, pics[0].data) if pics else None
        if ext == ".m4a":
            covr = (MP4(path).tags or {}).get("covr")
            if not covr:
                return None
            mime = "image/png" if covr[0].imageformat == MP4Cover.FORMAT_PNG else "image/jpeg"
            return mime, bytes(covr[0])
        if ext == ".flac":
            pics = FLAC(path).pictures
            return (pics[0].mime, pics[0].data) if pics else None
        f = mutagen.File(path)
        blocks = (f.tags or {}).get("metadata_block_picture") if f else None
        if blocks:
            pic = Picture(base64.b64decode(blocks[0]))
            return pic.mime, pic.data
    except Exception:
        pass
    return None


def _read_track(path):
    info = {"file": path, "title": os.path.splitext(os.path.basename(path))[0], "artist": "",
            "album": "", "year": "", "duration": 0, "cover": False, "added": 0}
    try:
        info["added"] = int(os.path.getmtime(path))
        f = mutagen.File(path, easy=True)
        if f is not None:
            tags = f.tags or {}
            for key in ("title", "artist", "album"):
                if tags.get(key):
                    info[key] = tags[key][0]
            if tags.get("date"):
                info["year"] = str(tags["date"][0])[:4]
            info["duration"] = round(getattr(f.info, "length", 0) or 0, 2)
    except Exception:
        pass
    info["cover"] = get_cover(path) is not None
    return info


_track_cache = {}  # đường dẫn -> ((cỡ, thời điểm sửa), thông tin bài)


def read_track(path):
    """Đọc tag của bài, nhớ lại theo cỡ + thời điểm sửa file: quét lại thư viện chỉ đọc file mới/đã đổi."""
    try:
        st = os.stat(path)
        key = (st.st_size, st.st_mtime_ns)
    except OSError:
        key = None
    hit = _track_cache.get(path)
    if key and hit and hit[0] == key:
        return dict(hit[1])
    info = _read_track(path)
    if key:
        _track_cache[path] = (key, info)
    return dict(info)


def norm_folder(folder):
    """'C:' là thư mục hiện hành của ổ C, không phải gốc ổ -> đổi thành 'C:\\'."""
    if re.fullmatch(r"[A-Za-z]:", folder or ""):
        return folder + "\\"
    return folder


def list_folder(folder):
    lib = library_dir()
    folder = norm_folder(folder) or lib
    is_lib = os.path.normcase(os.path.abspath(folder)) == os.path.normcase(os.path.abspath(lib))
    if is_lib:
        os.makedirs(folder, exist_ok=True)
    tracks = []
    if os.path.isdir(folder):
        for n in os.listdir(folder):
            path = os.path.join(folder, n)
            if os.path.splitext(n)[1].lower() in AUDIO_TYPES and os.path.isfile(path):
                tracks.append(read_track(path))
    tracks.sort(key=lambda t: t["title"].lower())
    return {
        "dir": folder,
        "name": os.path.basename(folder.rstrip("\\/")) or folder,
        "isLibrary": is_lib,
        "tracks": tracks,
    }


def audio_path(p):
    """Chỉ phục vụ file nhạc thật (đúng đuôi, tồn tại), không cho đọc file khác qua server."""
    if p and os.path.isabs(p) and os.path.splitext(p)[1].lower() in AUDIO_TYPES and os.path.isfile(p):
        return p
    return None


def track_info(p):
    if online.is_online(p):
        return online.meta(p)
    path = audio_path(p)
    return read_track(path) if path else None


def file_key(path):
    st = os.stat(path)
    return hashlib.sha1(f"{path}|{st.st_size}|{int(st.st_mtime)}".encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- dữ liệu người dùng (state.json)
def backup_state():
    """Trước lần ghi đầu tiên mỗi ngày, chép state.json sang backups/ (giữ BACKUP_KEEP bản gần nhất)."""
    if not os.path.exists(STATE_FILE):
        return
    target = os.path.join(BACKUP_DIR, time.strftime("state-%Y%m%d.json"))
    if os.path.exists(target):
        return
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        shutil.copy2(STATE_FILE, target)
        olds = sorted(n for n in os.listdir(BACKUP_DIR) if n.startswith("state-") and n.endswith(".json"))
        for name in olds[:-BACKUP_KEEP]:
            os.remove(os.path.join(BACKUP_DIR, name))
    except OSError:
        log.warning("Không sao lưu được state.json", exc_info=True)


def write_state(body):
    json.loads(body)  # chỉ lưu khi là JSON hợp lệ
    with state_lock:
        backup_state()
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "wb") as fh:
            fh.write(body)
        os.replace(tmp, STATE_FILE)


# ---------------------------------------------------------------- lời bài hát (LRCLIB)
JUNK = re.compile(
    r"[\(\[【](?=[^\)\]】]*(official|mv|m/v|lyric|audio|video|visuali[sz]er|remaster|hd|4k|"
    r"live|karaoke|vietsub|engsub|prod|music))[^\)\]】]*[\)\]】]", re.I)


def clean_title(title, artist):
    """Tên bài kiểu YouTube 'Ca sĩ - Bài (Official MV) | ...' -> (bài, ca sĩ)."""
    t = JUNK.sub("", title)
    t = re.split(r"\s[|｜]\s", t)[0]
    if " - " in t:
        a, b = t.split(" - ", 1)
        # kênh "Ca sĩ Official" vẫn tính là cùng ca sĩ với "Ca sĩ - Bài"
        if not artist or artist.lower() in a.lower() or a.lower() in artist.lower():
            artist, t = a, b
    t = re.sub(r"\s+(ft\.?|feat\.?)\s.*$", "", t, flags=re.I)
    return t.strip(" -–"), (artist or "").strip()


def lrclib(endpoint, params):
    url = f"https://lrclib.net/api/{endpoint}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": f"NhacPlayer/{core.VERSION}"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError:
        # 404 = không có; 5xx = LRCLIB lỗi với riêng câu tìm này -> coi như không có, thử cách tìm khác
        return None


def find_lyrics(path):
    return find_lyrics_for(read_track(path), file_key(path) + ".json")


def find_lyrics_for(info, cache_name):
    os.makedirs(LYRICS_DIR, exist_ok=True)
    cache = os.path.join(LYRICS_DIR, cache_name)
    data = read_json(cache)  # file hỏng -> None -> tìm lại và ghi đè
    # Lần trước không tìm thấy thì sau 3 ngày thử lại
    if isinstance(data, dict) and (data.get("synced") or data.get("plain") or time.time() - data.get("at", 0) < 3 * 86400):
        return data

    title, artist = clean_title(info["title"], info["artist"])
    dur = info["duration"]
    try:
        results = []
        queries = [{"track_name": title, "artist_name": artist}] if artist else []
        queries += [{"q": f"{title} {artist}".strip()}, {"track_name": title}]
        for params in queries:
            results = lrclib("search", params) or []
            if results:
                break
    except (OSError, ValueError):
        return {"error": "offline"}

    def score(r):
        close = abs((r.get("duration") or 0) - dur) <= 4 if dur else True
        return (bool(r.get("syncedLyrics")) and close, close, bool(r.get("syncedLyrics")), bool(r.get("plainLyrics")))

    best = max(results, key=score) if results else None
    if best and dur and abs((best.get("duration") or 0) - dur) > 20:
        best = None  # lệch thời lượng quá nhiều -> nhiều khả năng là bài khác
    data = {"at": time.time(), "synced": "", "plain": ""}
    if best:
        data.update(synced=best.get("syncedLyrics") or "", plain=best.get("plainLyrics") or "",
                    source=f'{best.get("artistName", "")} - {best.get("trackName", "")}')
    write_json(cache, data)
    return data


# ---------------------------------------------------------------- dạng sóng
def compute_peaks(path, buckets=800):
    os.makedirs(PEAKS_DIR, exist_ok=True)
    cache = os.path.join(PEAKS_DIR, file_key(path) + ".json")
    cached = read_json(cache)
    if isinstance(cached, list) and cached:
        return cached
    ffmpeg = core.find_tool("ffmpeg")
    if not ffmpeg:
        return None
    try:
        proc = subprocess.run(
            [ffmpeg, "-v", "error", "-i", path, "-ac", "1", "-ar", "800", "-f", "s16le", "-"],
            capture_output=True, creationflags=NO_WINDOW, timeout=120,
        )
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg quá 120 giây khi vẽ dạng sóng: %s", path)
        return None
    samples = array("h")
    samples.frombytes(proc.stdout[: len(proc.stdout) // 2 * 2])
    if not samples:
        return None
    step = max(1, len(samples) // buckets)
    peaks = []
    for i in range(0, step * buckets, step):
        chunk = samples[i:i + step]
        if not chunk:
            break
        peaks.append(max(max(chunk), -min(chunk)))
    top = max(peaks) or 1
    peaks = [round(p / top, 3) for p in peaks]
    write_json(cache, peaks)
    return peaks


# ---------------------------------------------------------------- tự phát tiếp & hàng tải
def radio_for(p):
    """Bài liên quan để phát tiếp sau bài p. Bài trong máy thì tìm bản trên YouTube rồi lấy Mix của nó."""
    if online.is_online(p):
        return online.related(p)
    path = audio_path(p)
    if not path:
        return []
    info = read_track(path)
    title, artist = clean_title(info["title"], info["artist"])
    found = online.search("yt", f"{title} {artist}".strip())
    if not found:
        return []
    seed = found[0]["file"]
    return [t for t in online.related(seed) if t["file"] != seed]


def downloads_action(body):
    action = body.get("action") if isinstance(body, dict) else None
    if action == "add":
        return {"ok": True, **downloads.add([u for u in body.get("uris") or [] if isinstance(u, str)])}
    if action == "cancel":
        downloads.cancel(int(body.get("id") or 0))
    elif action == "cancelAll":
        downloads.cancel_all()
    elif action == "retry":
        downloads.retry(int(body.get("id") or 0))
    elif action == "clear":
        downloads.clear_finished()
    else:
        raise ValueError("action")
    return {"ok": True}


# ---------------------------------------------------------------- công cụ của DJ (mcp_server.py chuyển về đây)
def fold(text):
    """Chữ thường, bỏ dấu: so khớp tìm kiếm tiếng Việt."""
    text = unicodedata.normalize("NFD", str(text or "").lower().replace("đ", "d"))
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def compact(t):
    """Bài hát -> dạng gọn cho DJ đọc (ít token)."""
    d = int(t.get("duration") or 0)
    return {"uri": t["file"], "title": t.get("title") or "", "artist": t.get("artist") or "",
            "length": f"{d // 60}:{d % 60:02d}" if d else "", "source": t["file"][:2] if online.is_online(t["file"]) else "may"}


def tracks_for(uris):
    """Mã bài -> thông tin đầy đủ, bỏ bài không tồn tại và bài của ca sĩ bị chặn. Trả về (bài, số bị chặn)."""
    names = blocklist.load()
    out, blocked, seen = [], 0, set()
    for uri in uris or []:
        if not isinstance(uri, str) or uri in seen:
            continue
        seen.add(uri)
        info = track_info(uri)
        if not info:
            continue
        if blocklist.blocked_by(info, names):
            blocked += 1
            continue
        out.append(info)
    return out, blocked


def run_js(name, args):
    """Chạy công cụ phía giao diện (hàng đợi, trạng thái nghe nằm trong trang)."""
    if not window:
        raise RuntimeError("Cửa sổ app chưa sẵn sàng")
    return window.evaluate_js(f"agentTool({json.dumps(name)}, {json.dumps(args, ensure_ascii=False)})")


def agent_tool(name, args):
    try:
        return {"result": _agent_tool(name, args)}
    except Exception as exc:
        log.warning("Công cụ DJ %s lỗi: %s", name, exc)
        return {"error": str(exc)[:300] or "Lỗi"}


def _agent_tool(name, args):
    limit = max(1, min(int(args.get("limit") or 12), 100))
    if name == "get_context":
        ctx = run_js("get_context", {}) or {}
        ctx["blocked"] = blocklist.load()
        return ctx
    if name == "search_library":
        q = fold(args.get("query"))
        lib = list_folder("")["tracks"]
        hits = [t for t in lib if q in fold(f'{t["title"]} {t["artist"]} {t["album"]}')] if q else lib
        return [compact(t) for t in blocklist.filter_tracks(hits)[:limit]]
    if name == "search_online":
        found = online.search("sc" if args.get("source") == "sc" else "yt", args.get("query") or "")
        return [compact(t) for t in blocklist.filter_tracks(found)[:limit]]
    if name == "related_tracks":
        return [compact(t) for t in blocklist.filter_tracks(radio_for(args.get("uri") or ""))[:limit]]
    if name == "get_lyrics":
        p = args.get("uri") or ""
        info = online.meta(p) if online.is_online(p) else None
        data = find_lyrics_for(info, online.cache_key(p) + ".json") if info else (find_lyrics(audio_path(p)) if audio_path(p) else {})
        text = data.get("plain") or re.sub(r"\[[^\]]*\]", "", data.get("synced") or "")
        return re.sub(r"\n\s*\n+", "\n", text).strip()[:1500] or "Không tìm thấy lời bài này."
    if name in ("play_tracks", "save_playlist"):
        tracks, blocked = tracks_for(args.get("uris"))
        if not tracks:
            return {"ok": False, "message": "Không có bài nào phát được" + (f" ({blocked} bài bị chặn)" if blocked else "")}
        res = run_js(name, {**args, "tracks": tracks}) or {}
        if blocked:
            res["blocked"] = blocked
        return res
    if name in ("control", "play_playlist"):
        return run_js(name, args)
    if name == "block_artist":
        names = blocklist.add(args.get("name"))
        run_js("blocklist_changed", {"names": names})
        return {"ok": True, "blocked": names}
    if name == "unblock_artist":
        names = blocklist.remove(args.get("name") or "")
        run_js("blocklist_changed", {"names": names})
        return {"ok": True, "blocked": names}
    raise ValueError(f"Không có công cụ {name}")


# ---------------------------------------------------------------- server
def parse_range(header, size):
    """Header Range -> (start, end, status). 206: đoạn hợp lệ; 416: vượt cuối file;
    200: không có hoặc không hiểu được Range -> gửi cả file (đúng chuẩn HTTP, thay vì làm chết request)."""
    whole = (0, size - 1, 200)
    if not header or not header.startswith("bytes="):
        return whole
    a, _, b = header[6:].split(",")[0].strip().partition("-")
    a, b = a.strip(), b.strip()
    try:
        if a:
            start = int(a)
            end = int(b) if b else size - 1
        elif b:  # bytes=-N: N byte cuối
            start, end = max(0, size - int(b)), size - 1
        else:
            return whole
    except ValueError:
        return whole
    end = min(end, size - 1)
    if start > end:
        return start, end, 416
    return start, end, 206


def check_request(method, path, headers, port):
    """Chặn trang web lạ đang mở trong trình duyệt gọi vào server của app. Trả về None nếu cho phép.

    - Host phải là 127.0.0.1/localhost đúng cổng: chặn kiểu tấn công DNS rebinding.
    - POST phải có Origin là chính app (trình duyệt luôn gửi Origin với POST, kể cả sendBeacon).
    - GET /api/ phải có header X-Nhac: trang khác không gửi được header tự đặt nếu server không cho phép CORS.
    /audio, /stream, /cover dùng trong thẻ <audio>/<img> nên không gửi được header, chỉ kiểm Host.
    """
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
    if (headers.get("Host") or "").lower() not in hosts:
        return "host"
    if method == "POST":
        if headers.get("Origin") not in {f"http://{h}" for h in hosts}:
            return "origin"
    elif path.startswith("/api/") and headers.get("X-Nhac") != "1":
        return "header"
    return None


def web_file(url_path):
    """'/js/app.js' -> (đường dẫn thật trong web/, kiểu nội dung). Không cho thoát ra ngoài web/."""
    rel = "index.html" if url_path in ("", "/") else urllib.parse.unquote(url_path).lstrip("/")
    root = os.path.normpath(WEB_DIR)
    full = os.path.normpath(os.path.join(root, rel))
    ctype = WEB_TYPES.get(os.path.splitext(full)[1].lower())
    if not full.startswith(root + os.sep) or not ctype or not os.path.isfile(full):
        return None
    return full, ctype


class Handler(BaseHTTPRequestHandler):
    responded = False

    def log_message(self, *args):
        pass

    def send_response(self, code, message=None):
        self.responded = True
        super().send_response(code, message)

    def send_bytes(self, data, ctype, status=200, cache=False):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, obj):
        self.send_bytes(json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def not_found(self):
        self.send_bytes(b"", "text/plain", status=404)

    def handle_safely(self, method, route):
        url = urllib.parse.urlparse(self.path)
        why = check_request(method, url.path, self.headers, self.server.server_address[1])
        if why:
            log.warning("Từ chối %s %s (%s)", method, url.path, why)
            self.send_bytes(b"", "text/plain", status=403)
            return
        try:
            route(url)
        except ConnectionError:
            pass  # trình phát huỷ request giữa chừng (tua, chuyển bài) là chuyện bình thường
        except Exception:
            log.exception("Lỗi khi xử lý %s %s", method, url.path)
            if not self.responded:
                try:
                    self.send_bytes(b"", "text/plain", status=500)
                except OSError:
                    pass

    def do_GET(self):
        self.handle_safely("GET", self.route_get)

    def do_POST(self):
        self.handle_safely("POST", self.route_post)

    def route_get(self, url):
        q = urllib.parse.parse_qs(url.query)
        p = q.get("p", [""])[0]
        if not url.path.startswith(("/api/", "/cover", "/stream", "/audio")):
            found = web_file(url.path)
            if not found:
                return self.not_found()
            with open(found[0], "rb") as fh:
                return self.send_bytes(fh.read(), found[1])
        if url.path == "/api/tracks":
            self.send_json(list_folder(q.get("dir", [""])[0]))
        elif url.path == "/api/state":
            with state_lock:
                try:
                    with open(STATE_FILE, "rb") as fh:
                        self.send_bytes(fh.read(), "application/json; charset=utf-8")
                except FileNotFoundError:
                    self.send_json({})
        elif url.path == "/api/lyrics":
            info = online.meta(p) if online.is_online(p) else None
            if info:
                self.send_json(find_lyrics_for(info, online.cache_key(p) + ".json"))
            else:
                path = audio_path(p)
                self.send_json(find_lyrics(path) if path else {})
        elif url.path == "/api/peaks":
            path = online.local_file(p) if online.is_online(p) else audio_path(p)
            peaks = compute_peaks(path) if path else None
            if peaks:
                self.send_json(peaks)
            else:
                self.not_found()
        elif url.path == "/api/search":
            src = q.get("src", ["yt"])[0]
            text = q.get("q", [""])[0]
            try:
                self.send_json(blocklist.filter_tracks(online.search(src, text)))
            except Exception as exc:
                log.warning("Tìm %s lỗi: %s", src, exc)
                ytdlp_update.on_failure()
                self.send_json({"error": str(exc)[:400]})
        elif url.path == "/api/link":
            try:
                data = online.open_link(q.get("u", [""])[0])
                data["tracks"] = blocklist.filter_tracks(data["tracks"])
                self.send_json({"ok": True, **data})
            except Exception as exc:
                log.warning("Không đọc được link: %s", exc)
                self.send_json({"ok": False, "error": str(exc)[:300]})
        elif url.path == "/api/radio":
            try:
                self.send_json({"ok": True, "tracks": blocklist.filter_tracks(radio_for(p))})
            except Exception as exc:
                log.warning("Không lấy được bài liên quan cho %s: %s", p, exc)
                self.send_json({"ok": False, "error": str(exc)[:300]})
        elif url.path == "/api/downloads":
            self.send_json(downloads.snapshot())
        elif url.path == "/api/prepare":
            try:
                if not online.is_online(p):
                    raise online.OnlineError("Bài hát không hợp lệ")
                target = online.stream_target(p)
                reply = {"ok": True, "stream": target["kind"] == "http", "info": online.meta(p)}
                if target["kind"] == "file":
                    reply["file"] = target["path"]
                self.send_json(reply)
            except Exception as exc:
                log.warning("Không chuẩn bị được %s: %s", p, exc)
                self.send_json({"ok": False, "error": str(exc)[:400]})
        elif url.path == "/api/ping":
            self.send_bytes(b"nhacplayer", "text/plain")
        elif url.path == "/api/open":
            open_in_window(p)  # lần mở thứ 2 (nhấp đúp file khác) gửi file sang cửa sổ đang chạy
            self.send_bytes(b"ok", "text/plain")
        elif url.path == "/cover":
            if online.is_online(p):
                cover = online.cover(p)
            else:
                path = audio_path(p)
                cover = get_cover(path) if path else None
            if cover:
                self.send_bytes(cover[1], cover[0], cache=True)
            else:
                self.not_found()
        elif url.path == "/stream":
            if online.is_online(p):
                self.send_stream(p)
            else:
                path = audio_path(p)
                self.send_audio(path) if path else self.not_found()
        elif url.path == "/audio":
            path = audio_path(p)
            self.send_audio(path) if path else self.not_found()
        else:
            self.not_found()

    def route_post(self, url):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            if url.path == "/api/state":
                write_state(body)
                self.send_json({"ok": True})
            elif url.path == "/api/meta":
                items = [track_info(x) for x in json.loads(body)]
                self.send_json([x for x in items if x])
            elif url.path == "/api/downloads":
                self.send_json(downloads_action(json.loads(body)))
            elif url.path == "/api/agent/tool":
                if not secrets.compare_digest(self.headers.get("X-Nhac-Agent") or "", AGENT_TOKEN):
                    log.warning("Từ chối lệnh DJ sai mã")
                    return self.send_bytes(b"", "text/plain", status=403)
                req = json.loads(body)
                self.send_json(agent_tool(req.get("name"), req.get("args") or {}))
            else:
                self.not_found()
        except ValueError:
            self.send_bytes(b"", "text/plain", status=400)

    def send_stream(self, p):
        """Phát trực tiếp luồng YouTube (proxy Range); SoundCloud dùng file đã tải."""
        for attempt in range(2):
            try:
                target = online.stream_target(p)
            except Exception as exc:
                log.warning("Không lấy được luồng %s: %s", p, exc)
                target = None
            if not target:
                self.send_bytes(b"", "text/plain", status=502)
                return
            if target["kind"] == "file":
                self.send_audio(target["path"])
                return
            headers = dict(target.get("headers") or {})
            rng = self.headers.get("Range")
            if rng:
                headers["Range"] = rng
            try:
                upstream = urllib.request.urlopen(
                    urllib.request.Request(target["url"], headers=headers), timeout=20)
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403, 410) and attempt == 0:
                    online.invalidate(p)
                    continue
                self.send_bytes(b"", "text/plain",
                                status=502 if exc.code >= 500 else exc.code)
                return
            except (OSError, ValueError):
                if attempt == 0:
                    online.invalidate(p)
                    continue
                self.send_bytes(b"", "text/plain", status=502)
                return
            try:
                self.send_response(upstream.status)
                for name in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"):
                    value = upstream.headers.get(name)
                    if value:
                        self.send_header(name, value)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                while True:
                    chunk = upstream.read(256 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            finally:
                upstream.close()
            return

    def send_audio(self, path):
        """Gửi file nhạc, hỗ trợ Range để tua được."""
        size = os.path.getsize(path)
        start, end, status = parse_range(self.headers.get("Range"), size)
        if status == 416:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        self.send_response(status)
        ext = os.path.splitext(path)[1].lower()
        self.send_header("Content-Type", STREAM_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(path, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = fh.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


# ---------------------------------------------------------------- cửa sổ
def on_ui(fn):
    """Chạy fn trên luồng giao diện WinForms."""
    from System import Action
    window.native.Invoke(Action(fn))


def set_min_size(w, h):
    """Đặt cỡ tối thiểu theo px giao diện."""
    from System.Drawing import Size
    on_ui(lambda: setattr(window.native, "MinimumSize", Size(int(w * css_scale), int(h * css_scale))))


def window_rect():
    r = wintypes.RECT()
    ctypes.windll.user32.GetWindowRect(window.native.Handle.ToInt32(), ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def place_window(x, y, w, h):
    """Đặt vị trí/kích thước theo điểm ảnh thật của cửa sổ."""
    ctypes.windll.user32.SetWindowPos(
        window.native.Handle.ToInt32(), None, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE)


def cursor_pos():
    p = wintypes.POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


def mouse_held():
    user32 = ctypes.windll.user32
    key = VK_RBUTTON if user32.GetSystemMetrics(SM_SWAPBUTTON) else VK_LBUTTON
    return bool(user32.GetAsyncKeyState(key) & 0x8000)


def resize_loop(edge, get_cursor=cursor_pos, held=mouse_held):
    """Kéo mép cửa sổ: theo dõi chuột đến khi nhả nút, đổi kích thước trực tiếp bằng điểm ảnh thật."""
    left, top, right, bottom = window_rect()
    min_w, min_h = window.native.MinimumSize.Width, window.native.MinimumSize.Height
    start_x, start_y = get_cursor()
    last = None
    while held():
        x, y = get_cursor()
        dx, dy = x - start_x, y - start_y
        l, t, r, b = left, top, right, bottom
        if "e" in edge:
            r = left + max(min_w, right - left + dx)
        if "w" in edge:
            l = right - max(min_w, right - left - dx)
        if "s" in edge:
            b = top + max(min_h, bottom - top + dy)
        if "n" in edge:
            t = bottom - max(min_h, bottom - top - dy)
        if (l, t, r, b) != last:
            place_window(l, t, r - l, b - t)
            last = (l, t, r, b)
        time.sleep(1 / 120)


def size_for_screen(css_w, css_h):
    """Đổi px giao diện ra điểm ảnh thật, không vượt quá vùng làm việc của màn hình."""
    from System.Windows.Forms import Screen
    area = Screen.FromControl(window.native).WorkingArea
    w = min(int(css_w * css_scale), int(area.Width * 0.96))
    h = min(int(css_h * css_scale), int(area.Height * 0.96))
    return area, w, h


def save_window_size():
    """Nhớ cỡ cửa sổ (theo px giao diện) cho lần mở sau."""
    from System.Windows.Forms import FormWindowState
    form = window.native
    if form.WindowState != FormWindowState.Normal:
        return
    update_settings(window=[round(form.Size.Width / css_scale), round(form.Size.Height / css_scale)])


def fit_maximize_to_work_area():
    """Cửa sổ không viền khi phóng to sẽ che cả taskbar -> giới hạn bằng vùng làm việc của màn hình."""
    from System.Windows.Forms import Screen

    def do():
        form = window.native
        form.MaximumSize = Screen.FromControl(form).WorkingArea.Size
    on_ui(do)


def open_in_window(p):
    """Đưa file sang cửa sổ đang mở và kéo cửa sổ lên trước.
    Trang đang nạp lại (vd. lúc vừa mở app) thì để dành, nạp xong on_loaded sẽ mở."""
    global pending_open
    if not window:
        return
    try:
        if audio_path(p):
            window.evaluate_js(f"openFile({json.dumps(p)})")
        window.restore()
        window.on_top = True  # kéo cửa sổ lên trước
        window.on_top = False
    except Exception:
        log.warning("Không chuyển được file sang cửa sổ đang mở, để dành đến khi trang nạp xong", exc_info=True)
        if audio_path(p):
            pending_open = p


class Api:
    """Hàm gọi được từ giao diện qua window.pywebview.api (chỉ trang của app gọi được, trang web khác thì không)."""

    def ready(self, dpr):
        """Trang báo tỉ lệ co giãn thật: lần đầu thì đặt cỡ cửa sổ cho đúng px giao diện rồi căn giữa."""
        global css_scale, window_sized
        css_scale = float(dpr) or 1.0
        if window_sized:
            return
        window_sized = True
        set_min_size(*MIN_SIZE)
        saved = load_settings().get("window") or DEFAULT_SIZE
        area, w, h = size_for_screen(max(saved[0], MIN_SIZE[0]), max(saved[1], MIN_SIZE[1]))
        place_window(area.X + (area.Width - w) // 2, area.Y + (area.Height - h) // 2, w, h)

    def begin_resize(self, edge):
        threading.Thread(target=resize_loop, args=(edge,), daemon=True).start()

    def minimize(self):
        window.minimize()

    def toggle_maximize(self):
        from System.Windows.Forms import FormWindowState
        if window.native.WindowState == FormWindowState.Maximized:
            window.restore()
        else:
            fit_maximize_to_work_area()
            window.maximize()

    def close(self):
        window.destroy()

    def pick_folder(self):
        kind = getattr(webview, "FileDialog", None)
        kind = kind.FOLDER if kind else webview.FOLDER_DIALOG
        res = window.create_file_dialog(kind)
        return res[0] if res else None

    def save_text(self, name, content):
        try:
            dialog = getattr(webview, "FileDialog", None)
            kind = dialog.SAVE if dialog else webview.SAVE_DIALOG
            res = window.create_file_dialog(kind, save_filename=name,
                                            file_types=("M3U (*.m3u)", "All files (*.*)"))
            if not res:
                return False
            path = res[0] if isinstance(res, (list, tuple)) else res
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(content)
            return True
        except Exception:
            log.warning("Không lưu được file %s", name, exc_info=True)
            return False

    def reveal(self, path):
        path = audio_path(path)
        if path:
            subprocess.Popen(["explorer", "/select,", path])

    # ---- mục Ứng dụng trong bảng Âm thanh
    def app_info(self):
        return {"version": core.VERSION, "library": library_dir(), "frozen": core.FROZEN,
                "ytdlp": ytdlp_update.current_version(), "dataDir": DATA_DIR,
                "tools": {name: bool(core.find_tool(name)) for name in core.TOOLS},
                "winget": core.winget_available()}

    def update_ytdlp(self):
        return ytdlp_update.update_quietly(force=True)

    def open_library(self):
        path = library_dir()
        os.makedirs(path, exist_ok=True)
        os.startfile(path)

    def open_data(self):
        os.startfile(DATA_DIR)

    def choose_library(self):
        path = self.pick_folder()
        if not path:
            return None
        update_settings(library=path)
        log.info("Đổi thư mục thư viện: %s", path)
        return path

    def check_update(self, force=False):
        return updater.check(bool(force))

    def install_update(self):
        try:
            updater.download_and_run()
        except Exception as exc:
            log.warning("Cập nhật thất bại", exc_info=True)
            return {"ok": False, "error": f"Không cập nhật được: {str(exc)[:160]}"}
        threading.Timer(1.0, window.destroy).start()  # nhường chỗ cho bộ cài ghi đè file
        return {"ok": True}

    def deps(self):
        return {"missing": core.missing_tools(), "winget": core.winget_available()}

    def install_deps(self):
        return core.install_tools()

    def open_logs(self):
        os.makedirs(core.LOG_DIR, exist_ok=True)
        os.startfile(core.LOG_DIR)

    def log_js(self, msg):
        log.error("JS: %s", str(msg)[:4000])

    # ---- DJ (chat với Claude Code)
    def agent_info(self):
        s = load_settings()
        return {"claude": agent.find_claude() or "", "model": s.get("agentModel", ""),
                "hasKey": bool(s.get("agentApiKey")), "busy": bool(dj and dj.busy)}

    def agent_send(self, text):
        s = load_settings()
        err = dj.send(str(text or "").strip()[:4000], model=s.get("agentModel", ""), api_key=s.get("agentApiKey", ""))
        return {"ok": err is None, "error": err}

    def agent_cancel(self):
        dj.cancel()

    def agent_new(self):
        dj.reset()

    def agent_settings(self, model=None, api_key=None):
        if model is not None and model in ("", "opus", "sonnet", "haiku"):
            update_settings(agentModel=model)
        if api_key is not None:
            update_settings(agentApiKey=str(api_key).strip())
        return self.agent_info()

    # ---- danh sách Không bao giờ phát
    def blocklist_get(self):
        return blocklist.load()

    def blocklist_add(self, name):
        return blocklist.add(name)

    def blocklist_remove(self, name):
        return blocklist.remove(name)


dj = None  # agent.Agent, tạo trong main()


def dj_emit(event):
    """Gửi sự kiện của DJ (chữ, đang dùng công cụ, xong, lỗi) cho khung chat."""
    try:
        window.evaluate_js(f"agentEvent({json.dumps(event, ensure_ascii=False)})")
    except Exception:
        log.warning("Không gửi được sự kiện DJ cho giao diện", exc_info=True)


def on_shown():
    hwnd = window.native.Handle.ToInt32()
    rounded = ctypes.c_int(2)  # DWMWCP_ROUND: bo góc kiểu Windows 11
    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(rounded), 4)
    fit_maximize_to_work_area()


app_region_ready = False
pending_open = None  # file mở từ Explorer, gửi cho trang sau khi trang nạp xong hẳn


def on_loaded():
    """Lần nạp đầu: bật CSS app-region của WebView2 (kéo cửa sổ kiểu gốc, có Snap) rồi nạp lại trang.
    Lần nạp sau: trang đã sẵn sàng thì mới giao file cần phát."""
    global app_region_ready, pending_open
    if not app_region_ready:
        app_region_ready = True
        reloaded = []

        def do():
            core_wv = window.native.webview.CoreWebView2
            if not core_wv.Settings.IsNonClientRegionSupportEnabled:
                core_wv.Settings.IsNonClientRegionSupportEnabled = True
                core_wv.Reload()
                reloaded.append(True)
        try:
            on_ui(do)
        except Exception:
            log.warning("Không bật được app-region của WebView2", exc_info=True)
        if reloaded:
            return
    if pending_open:
        path, pending_open = pending_open, None
        window.evaluate_js(f"openFile({json.dumps(path)})")


def on_state(maxed):
    def notify():
        try:
            window.evaluate_js(f"setWinState({'true' if maxed else 'false'})")
        except Exception:
            pass
    threading.Thread(target=notify, daemon=True).start()


def forward_to_running(path):
    """Nếu đã có cửa sổ đang chạy thì gửi file sang đó. Trả về True nếu đã gửi."""
    base = f"http://127.0.0.1:{PORT}/api/"
    headers = {"X-Nhac": "1"}
    try:
        with urllib.request.urlopen(urllib.request.Request(base + "ping", headers=headers), timeout=1) as r:
            if r.read() != b"nhacplayer":
                return False
        query = "?p=" + urllib.parse.quote(path) if path else ""
        urllib.request.urlopen(urllib.request.Request(base + "open" + query, headers=headers), timeout=5).close()
        return True
    except OSError:
        return False


def make_server():
    try:
        return ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:  # cổng bị chương trình khác chiếm -> dùng cổng ngẫu nhiên
        log.warning("Cổng %s đang bận, dùng cổng ngẫu nhiên", PORT)
        return ThreadingHTTPServer(("127.0.0.1", 0), Handler)


def main():
    global window, pending_open, dj
    if sys.stdout is None:  # chạy không có console (pythonw / exe)
        sys.stdout = sys.stderr = open(os.devnull, "w", encoding="utf-8")
    os.makedirs(DATA_DIR, exist_ok=True)
    core.setup_logging()
    path = next((os.path.abspath(a) for a in sys.argv[1:] if audio_path(os.path.abspath(a))), None)

    if forward_to_running(path):
        return

    ytdlp_update.activate()  # trước khi bất cứ thứ gì nạp yt_dlp
    downloads.start(library_dir)
    ytdlp_update.start_background()

    server = make_server()
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name="server", daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    pending_open = path
    dj = agent.Agent(dj_emit, lambda: server.server_address[1], AGENT_TOKEN)

    # Cho phép tự phát nhạc khi mở file từ Explorer (chưa có cú bấm nào trong cửa sổ)
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
        "--disable-features=ElasticOverscroll --autoplay-policy=no-user-gesture-required")
    webview.settings["DRAG_REGION_SELECTOR"] = ".pywebview-drag-off"  # kéo cửa sổ bằng app-region

    window = webview.create_window(
        "Nhạc", url, js_api=Api(), width=DEFAULT_SIZE[0], height=DEFAULT_SIZE[1], min_size=MIN_SIZE,
        background_color="#07080c", frameless=True, easy_drag=False, shadow=True,
    )
    window.events.shown += on_shown
    window.events.loaded += on_loaded
    window.events.closing += save_window_size
    window.events.maximized += lambda: on_state(True)
    window.events.restored += lambda: on_state(False)
    webview.start(private_mode=False, storage_path=os.path.join(DATA_DIR, "webview"))
    server.shutdown()
    log.info("Đóng app")


if __name__ == "__main__":
    main()
