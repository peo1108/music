"""Tự cập nhật: hỏi GitHub Releases có bản mới không, tải bộ cài NhacSetup-x.y.z.exe rồi chạy lặng lẽ.

Bộ cài (Inno Setup) tự đóng app cũ, cài đè, rồi mở lại app.
"""
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

import core

API = f"https://api.github.com/repos/{core.REPO}/releases/latest"
CHECK_EVERY = 6 * 3600  # giây; GitHub cho 60 lượt hỏi/giờ khi không đăng nhập
ASSET = re.compile(r"^NhacSetup-.*\.exe$", re.I)

_lock = threading.Lock()
_cache = {"at": 0.0, "data": None}


def parse_version(tag):
    """'v1.2.3' -> (1, 2, 3). Chuỗi không có số -> ()."""
    nums = re.findall(r"\d+", tag or "")[:3]
    return tuple(int(n) for n in nums) + (0,) * (3 - len(nums)) if nums else ()


def is_newer(latest, current):
    a, b = parse_version(latest), parse_version(current)
    return bool(a) and a > b


def _get_json(url):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json", "User-Agent": f"NhacPlayer/{core.VERSION}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def summarize(release, current=core.VERSION, frozen=core.FROZEN):
    """Rút gọn dữ liệu release của GitHub thành thứ giao diện cần."""
    tag = release.get("tag_name") or ""
    asset = next((a for a in release.get("assets") or [] if ASSET.match(a.get("name") or "")), None)
    available = is_newer(tag, current) and asset is not None
    return {
        "current": current,
        "latest": tag.lstrip("vV"),
        "available": available,
        "canInstall": available and frozen,
        "notes": (release.get("body") or "")[:3000],
        "page": release.get("html_url") or f"https://github.com/{core.REPO}/releases",
        "asset": asset and {"url": asset.get("browser_download_url"), "name": asset.get("name"),
                            "size": asset.get("size") or 0},
    }


def check(force=False):
    with _lock:
        if not force and _cache["data"] and time.time() - _cache["at"] < CHECK_EVERY:
            return _cache["data"]
    try:
        data = summarize(_get_json(API))
    except urllib.error.HTTPError as exc:
        if exc.code != 404:  # 404 = repo chưa có bản phát hành nào
            core.log.warning("Kiểm tra cập nhật lỗi HTTP %s", exc.code)
            return {"current": core.VERSION, "available": False, "error": f"GitHub trả lỗi {exc.code}"}
        data = {"current": core.VERSION, "latest": "", "available": False, "canInstall": False}
    except (OSError, ValueError) as exc:
        core.log.info("Không kiểm tra được cập nhật: %s", exc)
        return {"current": core.VERSION, "available": False, "error": "Không có mạng"}
    with _lock:
        _cache.update(at=time.time(), data=data)
    return data


def download_and_run(info=None):
    """Tải bộ cài của bản mới vào %TEMP% rồi chạy lặng lẽ. Trả về đường dẫn bộ cài; lỗi thì raise."""
    info = info or check(force=True)
    if not info.get("canInstall"):
        raise RuntimeError("Không có bản cập nhật để cài")
    asset = info["asset"]
    target = os.path.join(tempfile.gettempdir(), asset["name"])
    tmp = target + ".part"
    req = urllib.request.Request(asset["url"], headers={"User-Agent": f"NhacPlayer/{core.VERSION}"})
    with urllib.request.urlopen(req, timeout=30) as r, open(tmp, "wb") as fh:
        while True:
            chunk = r.read(256 * 1024)
            if not chunk:
                break
            fh.write(chunk)
    size = os.path.getsize(tmp)
    if asset["size"] and size != asset["size"]:
        os.remove(tmp)
        raise RuntimeError("Tải bản cập nhật bị thiếu, thử lại sau")
    os.replace(tmp, target)
    core.log.info("Chạy bộ cài cập nhật %s (%s byte)", target, size)
    subprocess.Popen([target, "/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"])
    return target
