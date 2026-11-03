"""Trí nhớ dài hạn của DJ: ghi chú ngắn về gu/thói quen người dùng tự nói ra khi chat.

Vd: "Ghét nhạc remix TikTok", "Tối thứ 6 hay nghe nhạc quẩy". DJ thêm/xoá bằng công cụ remember/forget,
người dùng xem/sửa trong Cài đặt. Lưu ở %APPDATA%/NhacPlayer/dj_memory.json.
"""
import os
import threading
import time

import core

FILE = os.path.join(core.DATA_DIR, "dj_memory.json")
MAX_NOTES = 60
_lock = threading.Lock()


def notes():
    data = core.read_json(FILE)
    return [n for n in data if isinstance(n, dict) and n.get("text")] if isinstance(data, list) else []


def _save(items):
    os.makedirs(core.DATA_DIR, exist_ok=True)
    core.write_json(FILE, items)


def add(text):
    text = " ".join(str(text or "").split())[:200]
    if not text:
        raise ValueError("Ghi chú trống")
    with _lock:
        items = notes()
        if any(n["text"].lower() == text.lower() for n in items):
            return items
        next_id = max((n.get("id", 0) for n in items), default=0) + 1
        items.append({"id": next_id, "text": text, "at": int(time.time())})
        _save(items[-MAX_NOTES:])
        return notes()


def remove(note_id):
    with _lock:
        items = [n for n in notes() if n.get("id") != int(note_id)]
        _save(items)
        return items


def for_prompt():
    return [{"id": n["id"], "note": n["text"]} for n in notes()]
