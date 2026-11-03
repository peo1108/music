"""Phần dùng chung cho cả app: phiên bản, thư mục dữ liệu, nhật ký lỗi, tìm công cụ ngoài (ffmpeg, Deno)."""
import logging
import logging.handlers
import os
import shutil
import subprocess
import sys
import threading

VERSION = "1.0.0"
REPO = "peo1108/music"  # nơi phát hành bản cập nhật (GitHub Releases)
APP = "NhacPlayer"

FROZEN = getattr(sys, "frozen", False)  # đang chạy bản exe đã đóng gói
DATA_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), APP)
LOG_DIR = os.path.join(DATA_DIR, "logs")
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
WINGET_LINKS = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Links")
# Công cụ ngoài -> gói winget để cài khi thiếu
TOOLS = {"ffmpeg": "Gyan.FFmpeg", "deno": "DenoLand.Deno"}

log = logging.getLogger("nhac")


# ---------------------------------------------------------------- nhật ký lỗi
def setup_logging():
    """Ghi log ra %APPDATA%/NhacPlayer/logs/nhac.log (xoay vòng, tối đa ~4MB)."""
    os.makedirs(LOG_DIR, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "nhac.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(threadName)s] %(name)s: %(message)s"))
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.WARNING)  # thư viện ngoài (pywebview...) chỉ ghi cảnh báo trở lên
    log.setLevel(logging.INFO)

    def excepthook(exc_type, exc, tb):
        log.critical("Lỗi không bắt được", exc_info=(exc_type, exc, tb))

    def thread_excepthook(args):
        if args.exc_type is SystemExit:
            return
        name = args.thread.name if args.thread else "?"
        log.error("Lỗi trong luồng %s", name, exc_info=(args.exc_type, args.exc_value, args.exc_traceback))

    sys.excepthook = excepthook
    threading.excepthook = thread_excepthook
    log.info("Nhạc %s khởi động (%s, Python %s)", VERSION, "exe" if FROZEN else "mã nguồn", sys.version.split()[0])


# ---------------------------------------------------------------- công cụ ngoài
def find_tool(name):
    """Tìm ffmpeg/ffprobe/deno: cạnh file exe -> PATH -> thư mục Links của winget.

    Tìm cả Links vì app mở từ Explorer có thể mang PATH cũ (trước khi cài bằng winget)."""
    exe = name + ".exe"
    candidates = [os.path.join(os.path.dirname(sys.executable), exe)] if FROZEN else []
    candidates += [shutil.which(name), os.path.join(WINGET_LINKS, exe)]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def missing_tools():
    return [name for name in TOOLS if not find_tool(name)]


def winget_available():
    return bool(shutil.which("winget")) or os.path.isfile(
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WindowsApps", "winget.exe"))


def install_tools(names=None):
    """Mở cửa sổ dòng lệnh cài các công cụ còn thiếu bằng winget (người dùng thấy tiến độ). Trả về True nếu đã mở."""
    ids = [TOOLS[n] for n in (names or missing_tools()) if n in TOOLS]
    if not ids or not winget_available():
        return False
    steps = " & ".join(
        f"winget install -e --id {i} --accept-package-agreements --accept-source-agreements" for i in ids)
    # Chữ trong cmd để không dấu: console cũ hay hiện sai tiếng Việt
    script = f"{steps} & echo. & echo Xong! Quay lai app Nhac. & pause"
    subprocess.Popen(["cmd", "/c", script], creationflags=subprocess.CREATE_NEW_CONSOLE)
    log.info("Mở trình cài công cụ: %s", ", ".join(ids))
    return True


def ytdl_options():
    """Tuỳ chọn yt-dlp chung: chỉ rõ đường dẫn ffmpeg và Deno (YouTube cần Deno để giải mã luồng)."""
    opts = {}
    ffmpeg = find_tool("ffmpeg")
    if ffmpeg:
        opts["ffmpeg_location"] = os.path.dirname(ffmpeg)  # thư mục chứa cả ffmpeg và ffprobe
    deno = find_tool("deno")
    if deno:
        opts["js_runtimes"] = {"deno": {"path": deno}}
    return opts
