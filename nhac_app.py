"""App nhạc YouTube: tải audio chất lượng cao và sửa thông tin (tên bài, ca sĩ, ảnh bìa...).

Sửa thông tin hỗ trợ: .mp3, .m4a, .opus, .ogg, .flac
Chạy: nhấp đúp TaiNhac.bat  (hoặc  python nhac_app.py)
"""
import base64
import os
import queue
import re
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import mutagen
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3
from mutagen.mp4 import MP4, MP4Cover

import tai_audio

FORMATS = [
    ("goc", "Gốc  - Opus ~128-160kbps (.opus) - TỐT NHẤT, khuyên dùng"),
    ("mp3", "MP3  - 320kbps (.mp3) - đổi từ bản gốc, nghe được ở mọi nơi"),
    ("m4a", "M4A  - AAC 128kbps (.m4a) - không phải chuyển đổi, hợp iPhone"),
]
PP_NAMES = {
    "ExtractAudio": "Đang chuyển đổi âm thanh...",
    "Metadata": "Đang ghi thông tin bài...",
    "EmbedThumbnail": "Đang gắn ảnh bìa...",
}

AUDIO_EXTS = (".mp3", ".m4a", ".opus", ".ogg", ".flac")
FIELDS = [
    ("title", "Tên bài"),
    ("artist", "Ca sĩ"),
    ("album", "Album"),
    ("date", "Năm"),
    ("tracknumber", "Số thứ tự bài"),
    ("genre", "Thể loại"),
]


def has_cover(path):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".mp3":
            return bool(ID3(path).getall("APIC"))
        if ext == ".m4a":
            return "covr" in (MP4(path).tags or {})
        if ext == ".flac":
            return bool(FLAC(path).pictures)
        f = mutagen.File(path)
        return bool(f.tags and "metadata_block_picture" in f.tags)
    except Exception:
        return False


def set_cover(path, image_path):
    with open(image_path, "rb") as fh:
        data = fh.read()
    mime = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
    ext = os.path.splitext(path)[1].lower()

    if ext == ".mp3":
        tags = ID3(path)
        tags.delall("APIC")
        tags.add(APIC(encoding=3, mime=mime, type=3, desc="Cover", data=data))
        tags.save(path)
    elif ext == ".m4a":
        f = MP4(path)
        fmt = MP4Cover.FORMAT_PNG if mime == "image/png" else MP4Cover.FORMAT_JPEG
        f["covr"] = [MP4Cover(data, imageformat=fmt)]
        f.save()
    else:
        pic = Picture()
        pic.type = 3
        pic.mime = mime
        pic.data = data
        if ext == ".flac":
            f = FLAC(path)
            f.clear_pictures()
            f.add_picture(pic)
        else:  # .opus / .ogg dùng Vorbis comment
            f = mutagen.File(path)
            f["metadata_block_picture"] = [base64.b64encode(pic.write()).decode("ascii")]
        f.save()


def safe_filename(name):
    return re.sub(r'[\\/:*?"<>|]', "_", name).strip(" .")


class App(tk.Tk):
    def __init__(self, folder):
        super().__init__()
        self.title("Nhạc YouTube")
        self.geometry("920x640")
        self.minsize(760, 560)
        self.folder = folder
        self.files = []
        self.current = None
        self.new_cover = None
        self.events = queue.Queue()

        # ---- Phần tải nhạc ----
        dl = ttk.LabelFrame(self, text="Tải nhạc", padding=8)
        dl.pack(fill="x", padx=8, pady=(8, 0))
        ttk.Label(dl, text="Link:").grid(row=0, column=0, sticky="w")
        self.link_var = tk.StringVar()
        link_entry = ttk.Entry(dl, textvariable=self.link_var)
        link_entry.grid(row=0, column=1, sticky="ew", padx=6)
        link_entry.bind("<Button-3>", self.paste_link)
        link_entry.bind("<Return>", lambda _e: self.start_download())
        self.dl_btn = ttk.Button(dl, text="Tải", command=self.start_download)
        self.dl_btn.grid(row=0, column=2)
        dl.columnconfigure(1, weight=1)

        self.fmt_var = tk.StringVar(value="goc")
        for i, (val, text) in enumerate(FORMATS):
            ttk.Radiobutton(dl, text=text, value=val, variable=self.fmt_var).grid(
                row=i + 1, column=1, sticky="w", padx=6)
        ttk.Label(dl, foreground="gray",
                  text="YouTube chỉ có tối đa ~160kbps, MP3 320kbps không hay hơn bản gốc, "
                       "chỉ nặng file hơn. Chuột phải vào ô Link để dán.").grid(
            row=4, column=1, sticky="w", padx=6, pady=(2, 6))

        self.progress = ttk.Progressbar(dl, maximum=100)
        self.progress.grid(row=5, column=1, sticky="ew", padx=6)
        self.dl_status = ttk.Label(dl, text="")
        self.dl_status.grid(row=6, column=1, sticky="w", padx=6)

        # ---- Phần sửa thông tin ----
        top = ttk.Frame(self, padding=8)
        top.pack(fill="x")
        self.folder_lbl = ttk.Label(top, text="")
        self.folder_lbl.pack(side="left")
        ttk.Button(top, text="Chọn thư mục khác...", command=self.pick_folder).pack(side="right")
        ttk.Button(top, text="Làm mới", command=self.load_files).pack(side="right", padx=4)
        ttk.Button(top, text="Mở thư mục", command=lambda: os.startfile(self.folder)).pack(side="right")

        body = ttk.Frame(self, padding=(8, 0, 8, 8))
        body.pack(fill="both", expand=True)

        left = ttk.Frame(body)
        left.pack(side="left", fill="both", expand=True)
        self.listbox = tk.Listbox(left, activestyle="none", exportselection=False)
        sb = ttk.Scrollbar(left, command=self.listbox.yview)
        self.listbox.config(yscrollcommand=sb.set)
        self.listbox.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.listbox.bind("<<ListboxSelect>>", self.on_select)

        form = ttk.Frame(body, padding=(12, 0, 0, 0))
        form.pack(side="left", fill="y")
        self.vars = {}
        for row, (key, label) in enumerate(FIELDS):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", pady=3)
            var = tk.StringVar()
            ttk.Entry(form, textvariable=var, width=42).grid(row=row, column=1, pady=3)
            self.vars[key] = var

        row = len(FIELDS)
        ttk.Label(form, text="Ảnh bìa").grid(row=row, column=0, sticky="w", pady=3)
        cover_box = ttk.Frame(form)
        cover_box.grid(row=row, column=1, sticky="w")
        self.cover_lbl = ttk.Label(cover_box, text="")
        self.cover_lbl.pack(side="left")
        ttk.Button(cover_box, text="Đổi ảnh...", command=self.pick_cover).pack(side="left", padx=8)

        self.rename_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(form, text="Đổi tên file thành \"Ca sĩ - Tên bài\"",
                        variable=self.rename_var).grid(row=row + 1, column=1, sticky="w", pady=8)
        ttk.Button(form, text="Lưu", command=self.save).grid(row=row + 2, column=1, sticky="e")

        self.status = ttk.Label(self, text="", padding=(8, 0, 8, 6))
        self.status.pack(fill="x")

        tai_audio.cleanup_leftovers(self.folder)  # dọn đồ thừa từ lần trước bị tắt ngang
        self.load_files()
        self.after(100, self.poll_events)

    # ---------- Tải nhạc ----------
    def paste_link(self, _event=None):
        try:
            self.link_var.set(self.clipboard_get().strip())
        except tk.TclError:
            pass

    def start_download(self):
        link = self.link_var.get().strip()
        if not link:
            messagebox.showinfo("Chưa có link", "Dán link YouTube vào ô Link trước đã.")
            return
        self.dl_btn.config(state="disabled")
        self.progress["value"] = 0
        self.dl_status.config(text="Đang lấy thông tin video...")
        fmt = self.fmt_var.get()
        threading.Thread(target=self.download_worker, args=(link, fmt), daemon=True).start()

    def download_worker(self, link, fmt):
        """Chạy ở luồng riêng; mọi cập nhật giao diện đi qua self.events."""
        done_files, errors = [], []
        put = self.events.put

        def progress_hook(d):
            if d["status"] == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate")
                pct = d.get("downloaded_bytes", 0) * 100 / total if total else 0
                name = os.path.basename(d.get("filename", ""))
                put(("progress", pct, f"Đang tải {pct:.0f}%: {name}"))

        def pp_hook(d):
            if d["status"] == "started" and d["postprocessor"] in PP_NAMES:
                put(("progress", 100, PP_NAMES[d["postprocessor"]]))
            elif d["status"] == "finished" and d["info_dict"].get("filepath"):
                path = d["info_dict"]["filepath"]
                if path not in done_files:
                    done_files.append(path)

        class Logger:
            def debug(self, msg):
                pass

            def info(self, msg):
                pass

            def warning(self, msg):
                pass

            def error(self, msg):
                errors.append(msg)

        try:
            tai_audio.download([link], self.folder, mp3=fmt == "mp3", m4a=fmt == "m4a",
                               progress_hook=progress_hook, pp_hook=pp_hook, logger=Logger())
        except Exception as e:  # lỗi bất ngờ của yt-dlp cũng phải hiện ra cửa sổ
            errors.append(str(e))
        put(("done", done_files, errors))

    def poll_events(self):
        try:
            while True:
                ev = self.events.get_nowait()
                if ev[0] == "progress":
                    self.progress["value"] = ev[1]
                    self.dl_status.config(text=ev[2])
                elif ev[0] == "done":
                    self.download_done(ev[1], ev[2])
        except queue.Empty:
            pass
        self.after(100, self.poll_events)

    def download_done(self, files, errors):
        self.dl_btn.config(state="normal")
        names = {os.path.basename(f) for f in files if os.path.exists(f)}
        if names:
            self.link_var.set("")
            self.dl_status.config(text=f"Xong! Đã tải {len(names)} bài. Sửa thông tin ở bên dưới nếu cần.")
        else:
            self.progress["value"] = 0
            self.dl_status.config(text="Không tải được.")
        self.load_files(select=names)
        if errors:
            messagebox.showerror("Có lỗi khi tải", "\n".join(errors[:5]))

    # ---------- Sửa thông tin ----------
    def pick_folder(self):
        folder = filedialog.askdirectory(initialdir=self.folder)
        if folder:
            self.folder = folder
            self.load_files()

    def load_files(self, select=()):
        """Nạp lại danh sách; `select` là tên file cần chọn sẵn (vd. bài vừa tải)."""
        os.makedirs(self.folder, exist_ok=True)
        self.folder_lbl.config(text=f"Thư mục: {os.path.abspath(self.folder)}")
        self.files = sorted(f for f in os.listdir(self.folder) if f.lower().endswith(AUDIO_EXTS))
        self.listbox.delete(0, "end")
        for f in self.files:
            self.listbox.insert("end", f)
        self.current = None
        self.status.config(text=f"{len(self.files)} file nhạc")
        for i, f in enumerate(self.files):
            if f in select:
                self.listbox.selection_set(i)
                self.listbox.see(i)
                self.on_select()
                break

    def on_select(self, _event=None):
        sel = self.listbox.curselection()
        if not sel:
            return
        self.current = os.path.join(self.folder, self.files[sel[0]])
        self.new_cover = None
        try:
            f = mutagen.File(self.current, easy=True)
            tags = (f.tags or {}) if f else {}
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không đọc được file:\n{e}")
            return
        for key, var in self.vars.items():
            var.set(tags.get(key, [""])[0] if key in tags else "")
        self.cover_lbl.config(text="Có" if has_cover(self.current) else "Chưa có")

    def pick_cover(self):
        if not self.current:
            return
        img = filedialog.askopenfilename(filetypes=[("Ảnh", "*.jpg *.jpeg *.png")])
        if img:
            self.new_cover = img
            self.cover_lbl.config(text=os.path.basename(img))

    def save(self):
        if not self.current:
            messagebox.showinfo("Chưa chọn", "Chọn một file bên trái trước đã.")
            return
        try:
            f = mutagen.File(self.current, easy=True)
            if f.tags is None:
                f.add_tags()
            for key, var in self.vars.items():
                val = var.get().strip()
                if val:
                    f[key] = val
                elif key in f.tags:
                    del f[key]
            f.save()
            if self.new_cover:
                set_cover(self.current, self.new_cover)
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không lưu được:\n{e}")
            return

        msg = "Đã lưu."
        title, artist = self.vars["title"].get().strip(), self.vars["artist"].get().strip()
        if self.rename_var.get() and title:
            ext = os.path.splitext(self.current)[1]
            new_name = safe_filename(f"{artist} - {title}" if artist else title) + ext
            new_path = os.path.join(self.folder, new_name)
            if os.path.normcase(new_path) != os.path.normcase(self.current):
                if os.path.exists(new_path):
                    msg += f" Không đổi tên được vì đã có file \"{new_name}\"."
                else:
                    os.rename(self.current, new_path)
                    msg += f" Tên mới: {new_name}"

        self.load_files()
        self.status.config(text=msg)


if __name__ == "__main__":
    if sys.stdout is None:  # chạy bằng pythonw không có cửa sổ console
        sys.stdout = sys.stderr = open(os.devnull, "w", encoding="utf-8")
    here = os.path.dirname(os.path.abspath(__file__))
    App(os.path.join(here, "out")).mainloop()
