"""Tự cập nhật yt-dlp (bộ tải YouTube/SoundCloud) mà không cần phát hành bản app mới.

YouTube đổi cách phát vài tuần một lần, yt-dlp đóng gói sẵn trong exe sẽ hỏng theo. Module này tải bản mới từ PyPI
(kiểm tra mã SHA-256) về %APPDATA%/NhacPlayer/ytdlp/<phiên bản>/ rồi cho Python nạp bản đó trước bản đóng gói sẵn.
Bản tải về mà nạp lỗi thì bị đánh dấu hỏng và app quay về bản đóng gói sẵn.

Chỉ chạy với bản exe; chạy từ mã nguồn thì cập nhật bằng pip.
"""
import hashlib
import io
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.request
import zipfile

import core
from core import log

ROOT = os.path.join(core.DATA_DIR, "ytdlp")
BAD_FILE = os.path.join(ROOT, "bad.json")
KEEP = 2  # số bản tải về giữ lại
CHECK_EVERY = 6 * 3600
RETRY_ON_FAIL_EVERY = 3600  # phát lỗi thì kiểm tra bản mới ngay, nhưng tối đa 1 lần/giờ

_lock = threading.RLock()
_active = None  # (phiên bản, thư mục) của bản tải về đang dùng; None = bản đóng gói sẵn
_last_check = 0.0
_last_fail_check = 0.0


def parse(version):
    """'2026.10.26' -> (2026, 10, 26); '2026.10.26.123' -> (2026, 10, 26, 123)."""
    return tuple(int(x) for x in re.findall(r"\d+", version or ""))


def bundled_version():
    if core.FROZEN:
        info = core.read_json(os.path.join(getattr(sys, "_MEIPASS", ""), "build_info.json")) or {}
        return info.get("yt_dlp", "")
    try:
        from importlib.metadata import version
        return version("yt-dlp")
    except Exception:
        return ""


def current_version():
    return _active[0] if _active else bundled_version()


def _bad():
    return set(core.read_json(BAD_FILE) or [])


def installed():
    """Các bản đã tải về đầy đủ và chưa bị đánh dấu hỏng, mới nhất trước: [(phiên bản, thư mục)]."""
    if not os.path.isdir(ROOT):
        return []
    bad = _bad()
    found = []
    for name in os.listdir(ROOT):
        path = os.path.join(ROOT, name)
        # chỉ nhận thư mục tên đúng dạng phiên bản (bỏ thư mục tạm "x.tmp" sót lại khi tắt app giữa lúc tải)
        if name not in bad and re.fullmatch(r"\d+(\.\d+)+", name) and os.path.isfile(os.path.join(path, "ok")):
            found.append((name, path))
    return sorted(found, key=lambda x: parse(x[0]), reverse=True)


def _unload():
    """Bỏ yt_dlp đã nạp để lần `import yt_dlp` sau lấy bản theo sys.path mới.
    Lượt tải đang chạy vẫn giữ bản cũ đến khi xong, không bị ảnh hưởng."""
    for name in [m for m in sys.modules if m in ("yt_dlp", "yt_dlp_ejs") or m.startswith(("yt_dlp.", "yt_dlp_ejs."))]:
        del sys.modules[name]


def activate():
    """Chọn bản tải về mới nhất nếu nó mới hơn bản đóng gói sẵn. Trả về phiên bản đang dùng."""
    global _active
    if not core.FROZEN:
        return current_version()
    best = next(iter(installed()), None)
    with _lock:
        want = best if best and parse(best[0]) > parse(bundled_version()) else None
        if want == _active:
            return current_version()
        if _active and _active[1] in sys.path:
            sys.path.remove(_active[1])
        if want:
            sys.path.insert(0, want[1])
        _active = want
        _unload()
    log.info("Dùng yt-dlp %s (%s)", current_version(), "bản tải về" if _active else "bản đóng gói sẵn")
    return current_version()


def import_ytdlp():
    """Nạp yt_dlp. Bản tải về nạp lỗi thì đánh dấu hỏng và quay về bản đóng gói sẵn."""
    try:
        first = "yt_dlp" not in sys.modules
        import yt_dlp
        if first:
            log.info("Nạp yt-dlp %s từ %s", yt_dlp.version.__version__, os.path.dirname(yt_dlp.__file__))
        return yt_dlp
    except Exception:
        if not _active:
            raise
        log.exception("yt-dlp %s tải về bị lỗi, quay về bản trước", _active[0])
        _mark_bad(_active[0])
        activate()
        import yt_dlp
        return yt_dlp


def _mark_bad(version):
    try:
        os.makedirs(ROOT, exist_ok=True)
        core.write_json(BAD_FILE, sorted(_bad() | {version}))
    except OSError:
        pass


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": f"NhacPlayer/{core.VERSION}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _pypi(name, version=None):
    path = f"{name}/{version}" if version else name
    return json.loads(_get(f"https://pypi.org/pypi/{path}/json").decode("utf-8"))


def _wheel(release):
    for f in release.get("urls") or []:
        if f.get("packagetype") == "bdist_wheel" and f.get("filename", "").endswith("py3-none-any.whl"):
            return f
    raise RuntimeError("PyPI không có bản wheel phù hợp")


def _extract_wheel(f, dest):
    body = _get(f["url"], timeout=60)
    if hashlib.sha256(body).hexdigest() != f["digests"]["sha256"]:
        raise RuntimeError("File tải về sai mã kiểm tra")
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        for name in z.namelist():
            if name.startswith(("/", "\\")) or ".." in re.split(r"[\\/]", name):
                raise RuntimeError("File wheel không hợp lệ")
        z.extractall(dest)


def ejs_requirement(requires_dist):
    """yt-dlp ghim đúng 1 phiên bản yt-dlp-ejs (bộ giải mã luồng YouTube) -> lấy phiên bản đó."""
    for req in requires_dist or []:
        m = re.match(r"yt-dlp-ejs\s*==\s*([\w.]+)", req)
        if m:
            return m.group(1)
    return None


def _prune():
    keep = {path for _, path in installed()[:KEEP]}
    if _active:
        keep.add(_active[1])
    for name in os.listdir(ROOT):
        path = os.path.join(ROOT, name)
        if os.path.isdir(path) and path not in keep:
            shutil.rmtree(path, ignore_errors=True)


def update(force=False):
    """Hỏi PyPI; có yt-dlp mới hơn bản đang dùng thì tải về và dùng luôn. Trả về trạng thái cho giao diện."""
    global _last_check
    if not core.FROZEN:
        return {"version": current_version(), "updated": False, "source": True}
    with _lock:
        if not force and time.time() - _last_check < CHECK_EVERY:
            return {"version": current_version(), "updated": False}
        _last_check = time.time()
        release = _pypi("yt-dlp")
        latest = release["info"]["version"]
        if parse(latest) <= parse(current_version()) or latest in _bad():
            return {"version": current_version(), "latest": latest, "updated": False}
        log.info("Tải yt-dlp %s (đang dùng %s)", latest, current_version())
        ejs = _pypi("yt-dlp-ejs", ejs_requirement(release["info"].get("requires_dist")))
        os.makedirs(ROOT, exist_ok=True)
        tmp = os.path.join(ROOT, latest + ".tmp")
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp)
        try:
            _extract_wheel(_wheel(release), tmp)
            _extract_wheel(_wheel(ejs), tmp)
            open(os.path.join(tmp, "ok"), "w").close()
            final = os.path.join(ROOT, latest)
            shutil.rmtree(final, ignore_errors=True)
            os.replace(tmp, final)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        activate()
        _prune()
        return {"version": current_version(), "latest": latest, "updated": True}


def update_quietly(force=False):
    try:
        return update(force)
    except Exception as exc:
        log.warning("Không cập nhật được yt-dlp: %s", exc)
        return {"version": current_version(), "updated": False, "error": str(exc)[:200]}


def on_failure():
    """Gọi khi YouTube/SoundCloud lỗi: có thể do yt-dlp đã cũ -> kiểm tra bản mới (chạy nền)."""
    global _last_fail_check
    if not core.FROZEN or time.time() - _last_fail_check < RETRY_ON_FAIL_EVERY:
        return
    _last_fail_check = time.time()
    threading.Thread(target=update_quietly, args=(True,), name="ytdlp-update", daemon=True).start()


def start_background(delay=30):
    """Kiểm tra bản mới một lúc sau khi mở app (không làm chậm lúc khởi động)."""
    def run():
        time.sleep(delay)
        update_quietly()
    threading.Thread(target=run, name="ytdlp-update", daemon=True).start()
