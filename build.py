"""Đóng gói app thành bộ cài NhacSetup-<phiên bản>.exe.

    python build.py             # PyInstaller -> build/dist/NhacPlayer, Inno Setup -> dist/NhacSetup-x.y.z.exe
    python build.py --install   # tạo xong cài luôn vào máy này (lặng lẽ, app tự mở lại)
    python build.py --release   # tạo xong đăng lên GitHub Releases (bạn bè sẽ nhận cập nhật)

Cần: pip install -r requirements-dev.txt  và Inno Setup 6 (winget install JRSoftware.InnoSetup).
Phiên bản lấy từ core.VERSION: tăng số này trước mỗi lần --release.
"""
import argparse
import importlib.util
import os
import shutil
import subprocess
import sys

import core

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
DIST = os.path.join(HERE, "dist")
APP_DIR = os.path.join(BUILD, "dist", core.APP)
ISS = os.path.join(HERE, "installer", "NhacPlayer.iss")
SETUP = os.path.join(DIST, f"NhacSetup-{core.VERSION}.exe")


def find_iscc():
    candidates = [shutil.which("ISCC")] + [
        os.path.join(base, "Inno Setup 6", "ISCC.exe")
        for base in (os.environ.get("LOCALAPPDATA", "") + r"\Programs", os.environ.get("ProgramFiles", ""),
                     os.environ.get("ProgramFiles(x86)", ""))]
    found = next((c for c in candidates if c and os.path.isfile(c)), None)
    if not found:
        sys.exit("Chưa có Inno Setup 6: winget install JRSoftware.InnoSetup")
    return found


def run_tests():
    print("Chạy test...")
    res = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-q"], cwd=HERE)
    if res.returncode:
        sys.exit("Test hỏng, dừng đóng gói.")


def pyinstaller():
    print("Đóng gói bằng PyInstaller (khoảng 1 phút)...")
    import PyInstaller.__main__
    extra = []
    for pkg, flag in (("yt_dlp", "--collect-submodules"), ("yt_dlp_ejs", "--collect-all")):
        try:
            if importlib.util.find_spec(pkg):
                extra += [flag, pkg]
        except (ImportError, ValueError):
            pass
    shutil.rmtree(APP_DIR, ignore_errors=True)
    PyInstaller.__main__.run([
        os.path.join(HERE, "player.py"),
        "--name", core.APP, "--windowed", "--noconfirm", "--log-level", "WARN",
        "--icon", os.path.join(HERE, "player.ico"),
        "--add-data", os.path.join(HERE, "web") + os.pathsep + "web",
        "--distpath", os.path.join(BUILD, "dist"),
        "--workpath", os.path.join(BUILD, "work"),
        "--specpath", BUILD,
    ] + extra)


def inno():
    print("Tạo bộ cài bằng Inno Setup...")
    os.makedirs(DIST, exist_ok=True)
    subprocess.run([find_iscc(), "/Q", f"/DAppVersion={core.VERSION}", f"/DSourceDir={APP_DIR}", ISS], check=True)
    print(f"Xong: {SETUP} ({os.path.getsize(SETUP) / 1e6:.0f} MB)")


def install():
    print("Cài vào máy này...")
    subprocess.run([SETUP, "/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"], check=True)


def release():
    tag = f"v{core.VERSION}"
    if subprocess.run(["gh", "release", "view", tag], capture_output=True, cwd=HERE).returncode == 0:
        sys.exit(f"Đã có bản {tag} trên GitHub: tăng VERSION trong core.py rồi chạy lại.")
    subprocess.run(["gh", "release", "create", tag, SETUP, "--title", f"Nhạc {core.VERSION}",
                    "--generate-notes"], check=True, cwd=HERE)
    print(f"Đã phát hành {tag}: app của mọi người sẽ báo có bản mới trong vòng vài giờ.")


def main():
    ap = argparse.ArgumentParser(description="Đóng gói bộ cài Nhạc")
    ap.add_argument("--install", action="store_true", help="cài luôn vào máy này")
    ap.add_argument("--release", action="store_true", help="đăng lên GitHub Releases")
    ap.add_argument("--skip-tests", action="store_true")
    args = ap.parse_args()
    if not args.skip_tests:
        run_tests()
    pyinstaller()
    inno()
    if args.install:
        install()
    if args.release:
        release()


if __name__ == "__main__":
    main()
