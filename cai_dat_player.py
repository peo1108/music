"""Đóng gói trình phát thành NhacPlayer.exe, cài vào máy và đăng ký mở file nhạc với Windows.

    python cai_dat_player.py          # cài / cập nhật
    python cai_dat_player.py --go     # gỡ cài đặt

Chỉ ghi vào HKEY_CURRENT_USER (không cần quyền admin).
"""
import ctypes
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import winreg

HERE = os.path.dirname(os.path.abspath(__file__))
APP = "NhacPlayer"
APP_NAME = "Nhạc"
PROGID = "NhacPlayer.Audio"
EXTS = [".mp3", ".m4a", ".opus", ".ogg", ".flac", ".wav"]
INSTALL_DIR = os.path.join(os.environ["LOCALAPPDATA"], "Programs", APP)
EXE = os.path.join(INSTALL_DIR, APP + ".exe")
DATA_DIR = os.path.join(os.environ["APPDATA"], APP)
SHORTCUT = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs", APP_NAME + ".lnk")
CLASSES = r"Software\Classes"


def set_value(path, name, value):
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_WRITE) as k:
        winreg.SetValueEx(k, name, 0, winreg.REG_SZ, value)


def delete_tree(path):
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_ALL_ACCESS) as k:
            while True:
                try:
                    delete_tree(path + "\\" + winreg.EnumKey(k, 0))
                except OSError:
                    break
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
    except FileNotFoundError:
        pass


def delete_value(path, name):
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_WRITE) as k:
            winreg.DeleteValue(k, name)
    except FileNotFoundError:
        pass


def notify_shell():
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)  # SHCNE_ASSOCCHANGED


def close_running():
    subprocess.run(["taskkill", "/f", "/im", APP + ".exe"], capture_output=True)


def remove_old_install():
    """App vừa bị đóng thì file còn khoá một lúc -> thử xoá lại đến khi được."""
    for _ in range(30):
        shutil.rmtree(INSTALL_DIR, ignore_errors=True)
        if not os.path.exists(INSTALL_DIR):
            return
        time.sleep(0.5)
    raise RuntimeError(f"Không xoá được bản cũ, hãy đóng app Nhạc rồi chạy lại: {INSTALL_DIR}")


def build():
    print("Đang đóng gói (mất khoảng 1 phút)...")
    work = tempfile.mkdtemp(prefix="nhacplayer_build_")
    try:
        import PyInstaller.__main__
        extra = []
        for pkg, flag in (("yt_dlp", "--collect-submodules"), ("yt_dlp_ejs", "--collect-all")):
            try:
                if importlib.util.find_spec(pkg):
                    extra += [flag, pkg]
            except (ImportError, ValueError):
                pass
        PyInstaller.__main__.run([
            os.path.join(HERE, "player.py"),
            "--name", APP, "--windowed", "--noconfirm", "--log-level", "WARN",
            "--icon", os.path.join(HERE, "player.ico"),
            "--add-data", os.path.join(HERE, "player.html") + os.pathsep + ".",
            "--add-data", os.path.join(HERE, "player.css") + os.pathsep + ".",
            "--add-data", os.path.join(HERE, "player.js") + os.pathsep + ".",
            "--distpath", os.path.join(work, "dist"),
            "--workpath", os.path.join(work, "build"),
            "--specpath", work,
        ] + extra)
        close_running()
        remove_old_install()
        shutil.copytree(os.path.join(work, "dist", APP), INSTALL_DIR)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def register():
    cmd = f'"{EXE}" "%1"'
    icon = f'"{EXE}",0'

    # Loại file "Tệp nhạc" mở bằng app
    set_value(rf"{CLASSES}\{PROGID}", "", "Tệp nhạc")
    set_value(rf"{CLASSES}\{PROGID}\DefaultIcon", "", icon)
    set_value(rf"{CLASSES}\{PROGID}\shell\open", "FriendlyAppName", APP_NAME)
    set_value(rf"{CLASSES}\{PROGID}\shell\open\command", "", cmd)

    # Hiện trong menu "Mở bằng" với tên Nhạc
    app_key = rf"{CLASSES}\Applications\{APP}.exe"
    set_value(app_key, "FriendlyAppName", APP_NAME)
    set_value(rf"{app_key}\shell\open\command", "", cmd)
    for ext in EXTS:
        set_value(rf"{app_key}\SupportedTypes", ext, "")
        set_value(rf"{CLASSES}\{ext}\OpenWithProgids", PROGID, "")

    # Hiện trong Cài đặt > Ứng dụng mặc định
    caps = rf"Software\{APP}\Capabilities"
    set_value(caps, "ApplicationName", APP_NAME)
    set_value(caps, "ApplicationDescription", "Trình phát nhạc")
    set_value(caps, "ApplicationIcon", icon)
    for ext in EXTS:
        set_value(rf"{caps}\FileAssociations", ext, PROGID)
    set_value(r"Software\RegisteredApplications", APP, caps)
    notify_shell()


def make_shortcut():
    # PowerShell 5 đọc sai chữ có dấu trên dòng lệnh -> tạo tên không dấu rồi đổi tên bằng Python
    tmp = os.path.join(os.path.dirname(SHORTCUT), APP + ".lnk")
    ps = (f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{tmp}');"
          f"$s.TargetPath='{EXE}';$s.IconLocation='{EXE},0';$s.Save()")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    os.replace(tmp, SHORTCUT)


def write_settings():
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "settings.json")
    try:
        with open(path, encoding="utf-8") as fh:
            settings = json.load(fh)
    except (OSError, ValueError):
        settings = {}
    settings["library"] = os.path.join(HERE, "out")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(settings, fh, ensure_ascii=False, indent=2)


def install():
    first_time = not os.path.exists(EXE)
    build()
    write_settings()
    register()
    make_shortcut()
    print(f"\nĐã cài vào {INSTALL_DIR}")
    if first_time:  # bản cập nhật thì không cần mở lại trang Cài đặt
        print("Bước cuối: trong cửa sổ Cài đặt vừa mở, bấm 'Đặt mặc định' (Set default) cho Nhạc.")
        os.startfile(f"ms-settings:defaultapps?registeredAppUser={APP}")


def uninstall():
    close_running()
    delete_tree(rf"{CLASSES}\{PROGID}")
    delete_tree(rf"{CLASSES}\Applications\{APP}.exe")
    for ext in EXTS:
        delete_value(rf"{CLASSES}\{ext}\OpenWithProgids", PROGID)
    delete_tree(rf"Software\{APP}")
    delete_value(r"Software\RegisteredApplications", APP)
    notify_shell()
    if os.path.exists(SHORTCUT):
        os.remove(SHORTCUT)
    shutil.rmtree(INSTALL_DIR, ignore_errors=True)
    print("Đã gỡ trình phát Nhạc. (Cài đặt cá nhân vẫn giữ ở", DATA_DIR + ")")


if __name__ == "__main__":
    uninstall() if "--go" in sys.argv else install()
