"""Danh sách "Không bao giờ phát" của riêng máy này (ca sĩ / từ khoá).

Lọc ở mọi đường bài hát đi vào app: tìm kiếm online, dán link, tự phát tiếp, và mọi bài DJ định phát.
So khớp không phân biệt dấu/hoa thường/khoảng trắng: "HIEUTHUHAI" chặn được cả "Hiếu Thứ Hai", "hieuthuhai",
"ft. HIEUTHUHAI"; nhưng so theo từ nguyên vẹn để tên ngắn như "Đen" không chặn nhầm "Đến" hay "Golden".
"""
import os
import re
import threading
import unicodedata

import core

FILE = os.path.join(core.DATA_DIR, "blocklist.json")
_lock = threading.Lock()


def _tokens(text, keep_marks):
    text = unicodedata.normalize("NFC", str(text or "")).lower()
    if not keep_marks:
        text = unicodedata.normalize("NFD", text.replace("đ", "d"))
        text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return [t for t in re.split(r"[^\w]+", text) if t and t != "_"]


def _runs_join_to(tokens, target):
    """Có dãy từ liên tiếp nào ghép lại (bỏ khoảng trắng) đúng bằng target không."""
    for i in range(len(tokens)):
        joined = ""
        for t in tokens[i:]:
            joined += t
            if joined == target:
                return True
            if len(joined) >= len(target):
                break
    return False


def matches(name, *texts):
    """Tên bị chặn có xuất hiện trong các đoạn chữ (tên bài, ca sĩ, kênh...) không."""
    # Tên ngắn (< 5 chữ cái) so cả dấu để tránh chặn nhầm: "Đen" khác "đến"
    keep = len("".join(_tokens(name, False))) < 5
    target = "".join(_tokens(name, keep))
    if not target:
        return False
    return any(_runs_join_to(_tokens(t, keep), target) for t in texts if t)


def load():
    data = core.read_json(FILE)
    return [n for n in data if isinstance(n, str) and n.strip()] if isinstance(data, list) else []


def _save(names):
    os.makedirs(core.DATA_DIR, exist_ok=True)
    core.write_json(FILE, names)


def add(name):
    name = (name or "").strip()
    if not name:
        return load()
    with _lock:
        names = load()
        key = "".join(_tokens(name, False))
        if all("".join(_tokens(n, False)) != key for n in names):
            names.append(name)
            _save(names)
        return names


def remove(name):
    with _lock:
        key = "".join(_tokens(name, False))
        names = [n for n in load() if "".join(_tokens(n, False)) != key]
        _save(names)
        return names


def blocked_by(track, names=None):
    """Tên trong danh sách chặn mà bài này dính phải (None nếu không dính)."""
    if not track:
        return None
    texts = (track.get("title"), track.get("artist"), track.get("album"), track.get("uploader"))
    for name in load() if names is None else names:
        if matches(name, *texts):
            return name
    return None


def filter_tracks(tracks):
    names = load()
    if not names:
        return list(tracks)
    return [t for t in tracks if not blocked_by(t, names)]
