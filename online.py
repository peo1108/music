"""Tìm và tải nhạc từ YouTube / SoundCloud cho trình phát.

Bài online được định danh bằng URI: "yt:<videoId>" hoặc "sc:<trackId>".
Lần phát đầu tiên tải audio về DATA_DIR/online, sau đó dùng lại file local
nên tua, dạng sóng và lời bài hát hoạt động như bài trong thư viện.
"""
import glob
import hashlib
import json
import os
import re
import shutil
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import core
import ytdlp_update

DATA_DIR = core.DATA_DIR
CACHE_DIR = os.path.join(DATA_DIR, "online")
STATE_FILE = os.path.join(DATA_DIR, "online.json")
AUDIO_EXTS = (".mp3", ".m4a", ".opus", ".ogg", ".flac", ".webm", ".mp4")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

_lock = threading.RLock()
_state = None
_covers = {}
_prep_locks = {}
_save_locks = {}
_streams = {}
_stream_locks = {}


class OnlineError(Exception):
    pass


def _ydl(opts):
    """Tạo YoutubeDL. Chỉ nạp yt_dlp khi cần thật (thư viện nặng ~50MB RAM), kèm đường dẫn ffmpeg/Deno.
    Nạp qua ytdlp_update để dùng bản yt-dlp tự cập nhật nếu có."""
    yt_dlp = ytdlp_update.import_ytdlp()
    return yt_dlp.YoutubeDL({**core.ytdl_options(), **opts})


LINK = re.compile(r"^https?://([\w-]+\.)*(youtube\.com|youtu\.be|soundcloud\.com)(/|$)", re.I)


def is_link(text):
    return bool(LINK.match((text or "").strip()))


def is_online(p):
    return isinstance(p, str) and (p.startswith("yt:") or p.startswith("sc:"))


def cache_key(uri):
    return hashlib.sha1(uri.encode("utf-8")).hexdigest()


def _load():
    global _state
    with _lock:
        if _state is None:
            try:
                with open(STATE_FILE, encoding="utf-8") as fh:
                    _state = json.load(fh)
            except (OSError, ValueError):
                _state = {}
        return _state


def _save():
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(_load(), fh, ensure_ascii=False)
        os.replace(tmp, STATE_FILE)
    except OSError:
        pass


def meta(uri):
    return _load().get(uri)


def _remember(tracks):
    with _lock:
        state = _load()
        for t in tracks:
            if not t:
                continue
            old = state.get(t["file"], {})
            item = {**old, **t}
            item.setdefault("added", int(time.time()))
            state[t["file"]] = item
        _save()


def _pick_thumb(thumbnails):
    thumbs = [t for t in thumbnails or [] if t.get("url")]
    if not thumbs:
        return ""
    small = [t for t in thumbs if (t.get("width") or 0) <= 640] or thumbs
    return max(small, key=lambda t: t.get("width") or 0)["url"]


def _track(src, e):
    if src == "yt":
        if e.get("ie_key") != "Youtube":
            return None
        vid = e.get("id") or ""
        if not YT_ID.match(vid):
            return None
        return {"file": "yt:" + vid, "title": e.get("title") or vid,
                "artist": e.get("uploader") or e.get("channel") or "",
                "album": "", "year": "", "duration": round(e.get("duration") or 0, 2),
                "cover": True, "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "web": f"https://www.youtube.com/watch?v={vid}"}
    if src == "sc":
        if e.get("ie_key") != "Soundcloud":
            return None
        tid = str(e.get("id") or "")
        web = e.get("webpage_url") or e.get("url") or ""
        if not tid or not web.startswith(("https://soundcloud.com/", "http://soundcloud.com/")):
            return None
        thumb = _pick_thumb(e.get("thumbnails"))
        return {"file": "sc:" + tid, "title": e.get("title") or tid,
                "artist": e.get("uploader") or "", "album": "", "year": "",
                "duration": round(e.get("duration") or 0, 2), "cover": bool(thumb),
                "thumb": thumb, "web": web}
    return None


def search(src, query):
    prefix = {"yt": "ytsearch", "sc": "scsearch"}.get(src)
    if not prefix or not (query or "").strip():
        return []
    opts = {"quiet": True, "no_warnings": True, "skip_download": True,
            "extract_flat": True, "noplaylist": True, "socket_timeout": 10}
    data = _ydl(opts).extract_info(
        f"{prefix}15:{query.strip()}", download=False)
    tracks = [t for t in (_track(src, e) for e in data.get("entries") or [] if e) if t]
    _remember(tracks)
    return tracks


# ---------------------------------------------------------------- dán link: playlist / bài lẻ
def _entry_track(e):
    """Mục của yt-dlp (dạng rút gọn trong playlist hoặc đầy đủ) -> bài của app, hoặc None."""
    key = e.get("ie_key") or e.get("extractor_key") or ""
    if key == "Youtube":
        return _track("yt", {**e, "ie_key": "Youtube"})
    if key == "Soundcloud":
        web = (e.get("webpage_url") or e.get("url") or "").split("?")[0]
        return _track("sc", {**e, "ie_key": "Soundcloud", "webpage_url": web})
    return None


def _sc_full(t):
    """Hỏi thêm tên/ca sĩ/thời lượng/ảnh của 1 bài SoundCloud (playlist rút gọn của SoundCloud chỉ có ID)."""
    try:
        opts = {"quiet": True, "no_warnings": True, "skip_download": True, "socket_timeout": 10}
        info = _ydl(opts).extract_info(t["web"], download=False, process=False)
        full = _track("sc", {**info, "ie_key": "Soundcloud", "webpage_url": info.get("webpage_url") or t["web"]})
        return full if full and full["file"] == t["file"] else t
    except Exception:
        return t


def _enrich(tracks, limit=200):
    """Bổ sung thông tin cho các bài SoundCloud còn thiếu, chạy song song 8 bài một lúc."""
    out, todo = [], []
    for t in tracks:
        old = meta(t["file"]) or {}
        if t["file"].startswith("sc:") and not t.get("duration"):
            if old.get("duration"):
                t = {**t, **old}  # đã biết từ trước
            elif len(todo) < limit:
                todo.append(t)
        out.append(t)
    if todo:
        with ThreadPoolExecutor(8) as pool:
            full = {t["file"]: t for t in pool.map(_sc_full, todo)}
        out = [full.get(t["file"], t) for t in out]
    return out


def open_link(url, limit=500):
    """Đọc link YouTube/SoundCloud. Trả về {kind, title, tracks, lists...}:
    kind = "track" (bài lẻ), "playlist" (playlist, Mix, set, album) hoặc "playlists" (trang kênh có nhiều playlist)."""
    url = (url or "").strip()
    if not is_link(url):
        raise OnlineError("Chỉ hỗ trợ link YouTube và SoundCloud")
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "extract_flat": "in_playlist",
            "playlistend": limit, "socket_timeout": 15}
    try:
        data = _ydl(opts).extract_info(url, download=False)
    except Exception as e:
        ytdlp_update.on_failure()
        raise OnlineError(_clean_error(e)) from e
    lists = []
    if data.get("entries") is None:
        t = _entry_track(data)
        tracks = [t] if t else []
        kind = "track"
    else:
        tracks, seen = [], set()
        for e in data["entries"]:
            if not e:
                continue
            t = _entry_track(e)
            if t and t["file"] not in seen:
                seen.add(t["file"])
                tracks.append(t)
            elif not t and e.get("url"):
                lists.append({"title": e.get("title") or e["url"], "url": e["url"]})
        kind = "playlist" if tracks or not lists else "playlists"
    tracks = _enrich(tracks)
    _remember(tracks)
    return {"kind": kind, "source": "sc" if "soundcloud.com" in url.lower() else "yt", "url": url,
            "title": data.get("title") or "", "uploader": data.get("uploader") or data.get("channel") or "",
            "tracks": tracks, "lists": lists if kind == "playlists" else []}


def related(uri, limit=25):
    """Bài liên quan để tự phát tiếp khi hết danh sách: YouTube Mix / SoundCloud Recommended."""
    if uri.startswith("yt:") and YT_ID.match(uri[3:]):
        vid = uri[3:]
        url = f"https://www.youtube.com/watch?v={vid}&list=RD{vid}"
    elif uri.startswith("sc:"):
        web = _web(uri, meta(uri))
        if not web:
            return []
        url = web.split("?")[0].rstrip("/") + "/recommended"
        limit = min(limit, 15)  # SoundCloud phải hỏi thêm từng bài -> lấy ít
    else:
        return []
    return [t for t in open_link(url, limit)["tracks"] if t["file"] != uri]


# ---------------------------------------------------------------- file nhạc trên máy của bài online
def saved_path(uri):
    """File mp3 đã lưu vào thư viện từ bài này (nếu còn)."""
    path = (meta(uri) or {}).get("saved")
    return path if path and os.path.isfile(path) else None


def local_file(uri):
    """File nghe được không cần mạng: bản đã lưu vào thư viện, hoặc bản đệm lúc phát."""
    return saved_path(uri) or cached(uri)


def cached(uri):
    base = os.path.join(CACHE_DIR, cache_key(uri))
    for path in glob.glob(base + ".*"):
        if (os.path.splitext(path)[1].lower() in AUDIO_EXTS and os.path.isfile(path)
                and os.path.getsize(path) > 0):
            return path
    return None


def _web(uri, info):
    if uri.startswith("yt:"):
        vid = uri[3:]
        return f"https://www.youtube.com/watch?v={vid}" if YT_ID.match(vid) else ""
    return (info or {}).get("web") or ""


def _clean_error(exc):
    text = str(exc).strip().splitlines()
    text = text[0] if text else "Không tải được bài này"
    text = re.sub(r"^ERROR:\s*", "", text)
    return text[:200]


def prepare(uri):
    path = cached(uri)
    if path:
        return path
    with _lock:
        lock = _prep_locks.setdefault(uri, threading.Lock())
    with lock:
        path = cached(uri)
        if path:
            return path
        info = meta(uri) or {}
        web = _web(uri, info)
        if not web:
            raise OnlineError("Không tìm thấy bài hát này")
        os.makedirs(CACHE_DIR, exist_ok=True)
        base = os.path.join(CACHE_DIR, cache_key(uri))
        opts = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
                "format": "bestaudio[protocol^=http]/bestaudio",
                "outtmpl": base + ".%(ext)s", "socket_timeout": 20, "retries": 2}
        try:
            data = _ydl(opts).extract_info(web, download=True)
        except Exception as e:
            for leftover in glob.glob(base + ".*"):
                if leftover.endswith(".part"):
                    try:
                        os.remove(leftover)
                    except OSError:
                        pass
            ytdlp_update.on_failure()
            raise OnlineError(_clean_error(e)) from e
        path = cached(uri)
        if not path:
            raise OnlineError("Không tải được bài này")
        _remember([{
            "file": uri,
            "title": data.get("title") or info.get("title") or uri,
            "artist": data.get("uploader") or info.get("artist") or "",
            "duration": round(data.get("duration") or info.get("duration") or 0, 2),
            "thumb": data.get("thumbnail") or info.get("thumb") or "",
            "cover": bool(data.get("thumbnail") or info.get("thumb")),
        }])
        return path


def _clean_base(base):
    for leftover in glob.glob(base + ".*"):
        try:
            os.remove(leftover)
        except OSError:
            pass


def save(uri, folder, progress=None):
    """Tải bài về thư mục thư viện thành mp3 (kèm tên bài, ca sĩ, ảnh bìa). Trả về đường dẫn file.

    progress(tỉ lệ 0..1 hoặc None): gọi trong lúc tải; nó raise exception thì lượt tải bị huỷ."""
    if not is_online(uri):
        raise OnlineError("Bài hát không hợp lệ")
    already = saved_path(uri)
    if already:
        return already
    info = meta(uri) or {}
    web = _web(uri, info)
    if not web:
        raise OnlineError("Không tìm thấy bài hát này")
    if not core.find_tool("ffmpeg"):
        raise OnlineError("Cần ffmpeg để lưu mp3: winget install Gyan.FFmpeg")
    os.makedirs(folder, exist_ok=True)

    def on_download(d):
        if not progress:
            return
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            progress(0.9 * min(1.0, (d.get("downloaded_bytes") or 0) / total) if total else None)
        elif d.get("status") == "finished":
            progress(0.9)

    def on_postprocess(d):
        if progress and d.get("status") == "started":
            progress(0.95)

    with _lock:
        lock = _save_locks.setdefault(uri, threading.Lock())
    with lock:
        base = os.path.join(folder, "ytdl_" + cache_key(uri))
        opts = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
                "format": "bestaudio/best", "outtmpl": base + ".%(ext)s",
                "windowsfilenames": True, "writethumbnail": True,
                "postprocessors": [
                    {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"},
                    {"key": "FFmpegMetadata"},
                    {"key": "EmbedThumbnail"},
                ],
                "progress_hooks": [on_download], "postprocessor_hooks": [on_postprocess],
                "socket_timeout": 20, "retries": 2}
        try:
            data = _ydl(opts).extract_info(web, download=True)
        except Exception as e:
            _clean_base(base)
            ytdlp_update.on_failure()
            raise OnlineError(_clean_error(e)) from e
        filepath = ((data or {}).get("requested_downloads") or [{}])[0].get("filepath") or ""
        candidates = []
        if filepath:
            candidates.append(os.path.splitext(filepath)[0] + ".mp3")
        candidates += glob.glob(base + ".mp3")
        source = next((p for p in candidates if p and os.path.exists(p)), "")
        if not source:
            _clean_base(base)
            raise OnlineError("Không lưu được bài này")
        title = data.get("title") or info.get("title") or "Nhạc"
        artist = data.get("uploader") or info.get("artist") or ""
        name = f"{artist} - {title}" if artist else title
        name = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", name)
        name = re.sub(r"\s+", " ", name).strip()[:140] or "Nhạc"
        target = os.path.join(folder, name + ".mp3")
        n = 2
        while os.path.exists(target):
            target = os.path.join(folder, f"{name} ({n}).mp3")
            n += 1
        try:
            os.replace(source, target)
        except OSError:
            shutil.move(source, target)
        _clean_base(base)
        _remember([{"file": uri, "saved": target}])  # nhớ để lần sau phát bản offline, khỏi tải lại
        return target


def _expiry(url):
    try:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        expire = int(query.get("expire", ["0"])[0])
    except (ValueError, TypeError):
        expire = 0
    until = expire - 60 if expire else time.time() + 1800
    return min(until, time.time() + 3600)


def resolve(uri):
    hit = _streams.get(uri)
    if hit and hit["expires"] > time.time():
        return dict(hit)
    with _lock:
        lock = _stream_locks.setdefault(uri, threading.Lock())
    with lock:
        hit = _streams.get(uri)
        if hit and hit["expires"] > time.time():
            return dict(hit)
        info = meta(uri) or {}
        web = _web(uri, info)
        if not web:
            raise OnlineError("Không tìm thấy bài hát này")
        opts = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
                "format": "bestaudio[protocol^=http]/bestaudio",
                "extractor_args": {"youtube": {"player_client": ["visionos"]}},
                "socket_timeout": 15}
        data = None
        headers = {}
        url = ""
        error = ""
        for _ in range(2):
            try:
                data = _ydl(opts).extract_info(web, download=False)
                url = data.get("url") or ""
                headers = dict(data.get("http_headers") or {})
                if not url:
                    error = "Không lấy được luồng phát"
                    continue
                probe = urllib.request.Request(url, headers={**headers, "Range": "bytes=0-1023"})
                with urllib.request.urlopen(probe, timeout=10) as resp:
                    resp.read(64)
                error = ""
                break
            except Exception as e:
                error = _clean_error(e)
        if not url or error:
            ytdlp_update.on_failure()
            raise OnlineError(error or "Không kết nối được luồng phát")
        result = {"kind": "http", "url": url, "headers": headers,
                  "ext": data.get("ext") or "", "expires": _expiry(url)}
        with _lock:
            _streams[uri] = result
        thumb = data.get("thumbnail") or info.get("thumb") or ""
        _remember([{
            "file": uri,
            "title": data.get("title") or info.get("title") or uri,
            "artist": data.get("uploader") or info.get("artist") or "",
            "duration": round(data.get("duration") or info.get("duration") or 0, 2),
            "thumb": thumb,
            "cover": bool(thumb),
        }])
        return dict(result)


def invalidate(uri):
    with _lock:
        _streams.pop(uri, None)


def stream_target(uri):
    path = local_file(uri)  # đã lưu vào thư viện / đã đệm -> phát từ máy, không cần mạng
    if path:
        return {"kind": "file", "path": path}
    if uri.startswith("yt:"):
        try:
            return resolve(uri)
        except OnlineError:
            pass
    return {"kind": "file", "path": prepare(uri)}


def cover(uri):
    info = meta(uri) or {}
    thumb = info.get("thumb") or ""
    if not thumb and uri.startswith("yt:"):
        thumb = f"https://i.ytimg.com/vi/{uri[3:]}/hqdefault.jpg"
    if not thumb:
        return None
    with _lock:
        hit = _covers.get(thumb)
    if hit:
        return hit
    try:
        req = urllib.request.Request(thumb, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = resp.read(2 * 1024 * 1024)
            mime = resp.headers.get_content_type() or "image/jpeg"
    except (OSError, ValueError):
        return None
    result = (mime, data)
    with _lock:
        if len(_covers) > 300:
            _covers.clear()
        _covers[thumb] = result
    return result