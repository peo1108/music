"""Tải âm thanh chất lượng cao nhất từ YouTube.

Muốn dùng giao diện thì nhấp đúp TaiNhac.bat. Dùng bằng lệnh:
    python tai_audio.py <link> [link ...]          # giữ nguyên định dạng gốc (tốt nhất, không mất chất lượng)
    python tai_audio.py --mp3 <link>               # đổi sang mp3 (cần ffmpeg)
    python tai_audio.py --m4a <link>               # ưu tiên m4a/AAC (hợp iPhone, không cần ffmpeg)
    python tai_audio.py -o D:\\Nhac <link>          # chọn thư mục lưu

Hỗ trợ cả link playlist.
"""
import argparse
import os
import re
import shutil
import sys

import yt_dlp

FINAL_EXTS = (".mp3", ".m4a", ".opus", ".ogg", ".flac")
LEFTOVER_EXTS = (".webm", ".webp", ".jpg", ".jpeg", ".png")


def cleanup_leftovers(folder):
    """Xoá file tạm còn sót khi tải bị ngắt: .part/.ytdl, và bản gốc/ảnh bìa của bài đã có file cuối."""
    if not os.path.isdir(folder):
        return []
    names = os.listdir(folder)
    finished = {os.path.splitext(n)[0] for n in names if n.lower().endswith(FINAL_EXTS)}
    removed = []
    for n in names:
        low = n.lower()
        base = re.sub(r"(\.part|\.ytdl)+$", "", n, flags=re.I)
        stem = re.sub(r"\.f\d+$", "", os.path.splitext(base)[0])  # bỏ đuôi định dạng kiểu .f251
        if low.endswith((".part", ".ytdl")) or (low.endswith(LEFTOVER_EXTS) and stem in finished):
            try:
                os.remove(os.path.join(folder, n))
                removed.append(n)
            except OSError:
                pass
    return removed


def download(urls, out, mp3=False, m4a=False, progress_hook=None, pp_hook=None, logger=None):
    """Tải audio về thư mục `out`. Các hook/logger (tuỳ chọn) để giao diện theo dõi tiến độ."""
    has_ffmpeg = shutil.which("ffmpeg") is not None
    if mp3 and not has_ffmpeg:
        raise RuntimeError("Cần cài ffmpeg để đổi sang mp3:  winget install Gyan.FFmpeg")

    opts = {
        # bestaudio = luồng âm thanh có bitrate cao nhất (thường là Opus ~160kbps)
        "format": "bestaudio[ext=m4a]/bestaudio" if m4a else "bestaudio/best",
        "outtmpl": f"{out}/%(title)s.%(ext)s",
        "windowsfilenames": True,
        # Link dạng watch?v=...&list=... (Mix, đang nghe trong playlist) chỉ tải đúng 1 bài.
        # Muốn tải cả playlist thì dán link dạng youtube.com/playlist?list=...
        "noplaylist": True,
        "ignoreerrors": True,
        "postprocessors": [],
    }

    if mp3:
        opts["postprocessors"].append(
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"}
        )
    elif has_ffmpeg:
        # Chỉ đổi vỏ (webm -> opus, không nén lại) để gắn được ảnh bìa và thông tin bài
        opts["postprocessors"].append({"key": "FFmpegExtractAudio", "preferredcodec": "best"})
    if has_ffmpeg:
        # Gắn tên bài, ca sĩ và ảnh bìa vào file
        opts["writethumbnail"] = True
        opts["postprocessors"] += [
            {"key": "FFmpegMetadata"},
            {"key": "EmbedThumbnail"},
        ]

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]
    if pp_hook:
        opts["postprocessor_hooks"] = [pp_hook]
    if logger:
        opts["logger"] = logger

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download(urls)
    finally:
        cleanup_leftovers(out)


def main():
    p = argparse.ArgumentParser(description="Tải audio chất lượng cao từ YouTube")
    p.add_argument("urls", nargs="+", help="Link video hoặc playlist")
    p.add_argument("-o", "--out", default="out", help="Thư mục lưu (mặc định: out)")
    fmt = p.add_mutually_exclusive_group()
    fmt.add_argument("--mp3", action="store_true", help="Chuyển sang mp3 320kbps (cần ffmpeg)")
    fmt.add_argument("--m4a", action="store_true", help="Ưu tiên luồng m4a/AAC gốc")
    args = p.parse_args()

    try:
        download(args.urls, args.out, args.mp3, args.m4a)
    except RuntimeError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
