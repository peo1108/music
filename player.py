"""Trình phát nhạc Nhạc: cửa sổ app không viền (WebView2) + server nội bộ cho giao diện player.html.

Chạy thử:  python player.py [file nhạc]
Bản cài:   CaiDatPlayer.bat đóng gói thành NhacPlayer.exe và đăng ký với Windows.
Mở thêm file khi app đang chạy thì file được chuyển sang cửa sổ đang mở (chỉ chạy 1 cửa sổ).
"""
import base64
import ctypes
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from array import array
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import mutagen
import online
import webview
from mutagen.flac import FLAC, Picture
from mutagen.id3 import ID3
from mutagen.mp4 import MP4, MP4Cover

ASSET_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "NhacPlayer")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
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
STREAM_TYPES = {**AUDIO_TYPES, ".webm": "audio/webm", ".mp4": "audio/mp4", ".aac": "audio/aac"}
STATIC = {
    "/": ("player.html", "text/html; charset=utf-8"),
    "/player.css": ("player.css", "text/css; charset=utf-8"),
    "/player.js": ("player.js", "application/javascript; charset=utf-8"),
}
DEFAULT_SIZE = (1180, 760)  # các cỡ này tính theo px giao diện
MIN_SIZE = (900, 600)
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
SWP_NOZORDER, SWP_NOACTIVATE = 0x4, 0x10
VK_LBUTTON, VK_RBUTTON, SM_SWAPBUTTON = 0x01, 0x02, 23

window = None
css_scale = 1.0  # tỉ lệ điểm ảnh thật / px giao diện (devicePixelRatio của trang)
window_sized = False
state_lock = threading.Lock()


# ---------------------------------------------------------------- thư viện nhạc
def load_settings():
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def library_dir():
    """Thư mục thư viện: lấy từ settings.json, mặc định là out/ cạnh file script."""
    lib = load_settings().get("library")
    if lib and os.path.isdir(lib):
        return lib
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")


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


def read_track(path):
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


def list_folder(folder):
    lib = library_dir()
    folder = folder or lib
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
        "isLibrary": os.path.normcase(os.path.abspath(folder)) == os.path.normcase(os.path.abspath(lib)),
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
        if not artist or artist.lower() in a.lower():
            artist, t = a, b
    t = re.sub(r"\s+(ft\.?|feat\.?)\s.*$", "", t, flags=re.I)
    return t.strip(" -–"), (artist or "").strip()


def lrclib(endpoint, params):
    url = f"https://lrclib.net/api/{endpoint}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "NhacPlayer/1.0"})
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
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as fh:
            data = json.load(fh)
        # Lần trước không tìm thấy thì sau 3 ngày thử lại
        if data.get("synced") or data.get("plain") or time.time() - data.get("at", 0) < 3 * 86400:
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
    with open(cache, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    return data


# ---------------------------------------------------------------- dạng sóng
def find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    links = os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Microsoft\WinGet\Links\ffmpeg.exe")
    return links if os.path.isfile(links) else None


def compute_peaks(path, buckets=800):
    os.makedirs(PEAKS_DIR, exist_ok=True)
    cache = os.path.join(PEAKS_DIR, file_key(path) + ".json")
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as fh:
            return json.load(fh)
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return None
    proc = subprocess.run(
        [ffmpeg, "-v", "error", "-i", path, "-ac", "1", "-ar", "800", "-f", "s16le", "-"],
        capture_output=True, creationflags=NO_WINDOW, timeout=120,
    )
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
    with open(cache, "w", encoding="utf-8") as fh:
        json.dump(peaks, fh)
    return peaks


# ---------------------------------------------------------------- server
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_bytes(self, data, ctype, status=200, cache=False):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, obj):
        self.send_bytes(json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        p = q.get("p", [""])[0]
        try:
            if url.path in STATIC:
                name, ctype = STATIC[url.path]
                with open(os.path.join(ASSET_DIR, name), "rb") as fh:
                    self.send_bytes(fh.read(), ctype)
            elif url.path == "/api/tracks":
                self.send_json(list_folder(q.get("dir", [""])[0]))
            elif url.path == "/api/state":
                with state_lock:
                    try:
                        with open(STATE_FILE, "rb") as fh:
                            self.send_bytes(fh.read(), "application/json; charset=utf-8")
                    except OSError:
                        self.send_json({})
            elif url.path == "/api/lyrics":
                info = online.meta(p) if online.is_online(p) else None
                if info:
                    self.send_json(find_lyrics_for(info, online.cache_key(p) + ".json"))
                else:
                    path = audio_path(p)
                    self.send_json(find_lyrics(path) if path else {})
            elif url.path == "/api/peaks":
                path = online.cached(p) if online.is_online(p) else audio_path(p)
                peaks = compute_peaks(path) if path else None
                if peaks:
                    self.send_json(peaks)
                else:
                    self.send_bytes(b"", "text/plain", status=404)
            elif url.path == "/api/search":
                src = q.get("src", ["yt"])[0]
                text = q.get("q", [""])[0]
                try:
                    self.send_json(online.search(src, text))
                except Exception as exc:
                    self.send_json({"error": str(exc)[:400]})
            elif url.path == "/api/prepare":
                try:
                    if not online.is_online(p):
                        raise online.OnlineError("Bài hát không hợp lệ")
                    target = online.stream_target(p)
                    reply = {"ok": True, "stream": target["kind"] == "http",
                             "info": online.meta(p)}
                    if target["kind"] == "file":
                        reply["file"] = target["path"]
                    self.send_json(reply)
                except Exception as exc:
                    self.send_json({"ok": False, "error": str(exc)[:400]})
            elif url.path == "/api/save":
                try:
                    if not online.is_online(p):
                        raise online.OnlineError("Bài hát không hợp lệ")
                    folder = library_dir()
                    os.makedirs(folder, exist_ok=True)
                    path = online.save(p, folder)
                    self.send_json({"ok": True, "file": path})
                except Exception as exc:
                    self.send_json({"ok": False, "error": str(exc)[:400]})
            elif url.path == "/api/ping":
                self.send_bytes(b"nhacplayer", "text/plain")
            elif url.path == "/api/open":
                # Lần mở thứ 2 (nhấp đúp file khác) gửi file sang cửa sổ đang chạy
                if window:
                    if audio_path(p):
                        window.evaluate_js(f"openFile({json.dumps(p)})")
                    window.restore()
                    window.on_top = True  # kéo cửa sổ lên trước
                    window.on_top = False
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
                    self.send_bytes(b"", "text/plain", status=404)
            elif url.path == "/stream":
                if online.is_online(p):
                    self.send_stream(p)
                else:
                    path = audio_path(p)
                    if path:
                        self.send_audio(path)
                    else:
                        self.send_bytes(b"", "text/plain", status=404)
            elif url.path == "/audio":
                path = audio_path(p)
                if path:
                    self.send_audio(path)
                else:
                    self.send_bytes(b"", "text/plain", status=404)
            else:
                self.send_bytes(b"", "text/plain", status=404)
        except (ConnectionError, OSError):
            pass  # trình phát huỷ request giữa chừng (tua, chuyển bài) là chuyện bình thường

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            if url.path == "/api/state":
                json.loads(body)  # chỉ lưu khi là JSON hợp lệ
                with state_lock:
                    tmp = STATE_FILE + ".tmp"
                    with open(tmp, "wb") as fh:
                        fh.write(body)
                    os.replace(tmp, STATE_FILE)
                self.send_json({"ok": True})
            elif url.path == "/api/meta":
                items = [track_info(x) for x in json.loads(body)]
                self.send_json([x for x in items if x])
            else:
                self.send_bytes(b"", "text/plain", status=404)
        except (ValueError, ConnectionError, OSError):
            self.send_bytes(b"", "text/plain", status=400)

    def send_stream(self, p):
        """Phát trực tiếp luồng YouTube (proxy Range); SoundCloud dùng file đã tải."""
        for attempt in range(2):
            try:
                target = online.stream_target(p)
            except Exception:
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
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        status = 200
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].split(",")[0].partition("-")
            if a:
                start = int(a)
                end = int(b) if b else size - 1
            elif b:  # bytes=-N: N byte cuối
                start = max(0, size - int(b))
            end = min(end, size - 1)
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            status = 206
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
    settings = load_settings()
    settings["window"] = [round(form.Size.Width / css_scale), round(form.Size.Height / css_scale)]
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as fh:
            json.dump(settings, fh, ensure_ascii=False, indent=2)
    except OSError:
        pass


def fit_maximize_to_work_area():
    """Cửa sổ không viền khi phóng to sẽ che cả taskbar -> giới hạn bằng vùng làm việc của màn hình."""
    from System.Windows.Forms import Screen

    def do():
        form = window.native
        form.MaximumSize = Screen.FromControl(form).WorkingArea.Size
    on_ui(do)


class Api:
    """Hàm gọi được từ giao diện qua window.pywebview.api."""

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
            return False

    def reveal(self, path):
        if online.is_online(path):
            try:
                path = online.prepare(path)
            except Exception:
                return
        if path and os.path.isfile(path):
            subprocess.Popen(["explorer", "/select,", path])


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
            core = window.native.webview.CoreWebView2
            if not core.Settings.IsNonClientRegionSupportEnabled:
                core.Settings.IsNonClientRegionSupportEnabled = True
                core.Reload()
                reloaded.append(True)
        try:
            on_ui(do)
        except Exception:
            pass
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
    try:
        with urllib.request.urlopen(base + "ping", timeout=1) as r:
            if r.read() != b"nhacplayer":
                return False
        query = "?p=" + urllib.parse.quote(path) if path else ""
        urllib.request.urlopen(base + "open" + query, timeout=3).close()
        return True
    except OSError:
        return False


def make_server():
    try:
        return ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:  # cổng bị chương trình khác chiếm -> dùng cổng ngẫu nhiên
        return ThreadingHTTPServer(("127.0.0.1", 0), Handler)


def main():
    global window, pending_open
    if sys.stdout is None:  # chạy không có console (pythonw / exe)
        sys.stdout = sys.stderr = open(os.devnull, "w", encoding="utf-8")
    os.makedirs(DATA_DIR, exist_ok=True)
    path = next((os.path.abspath(a) for a in sys.argv[1:] if audio_path(os.path.abspath(a))), None)

    if forward_to_running(path):
        return

    server = make_server()
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    pending_open = path

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


if __name__ == "__main__":
    main()
