"""Hàng tải nhạc về thư viện: tải 2 bài cùng lúc, có tiến độ, huỷ, thử lại.

Bài còn trong hàng chờ khi tắt app được lưu vào downloads.json và tải tiếp ở lần mở sau.
"""
import itertools
import os
import threading

import core
import online
from core import log

STATE_FILE = os.path.join(core.DATA_DIR, "downloads.json")
WORKERS = 2
ACTIVE = ("queued", "running")

_cond = threading.Condition()
_jobs = []
_ids = itertools.count(1)
_folder = None  # hàm trả về thư mục thư viện hiện tại
_started = False
_done_count = 0  # tăng mỗi khi tải xong 1 bài -> giao diện biết để quét lại thư viện


class Cancelled(Exception):
    pass


def _persist():
    """Gọi khi đang giữ _cond."""
    try:
        core.write_json(STATE_FILE, [j["uri"] for j in _jobs if j["status"] in ACTIVE])
    except OSError:
        log.warning("Không ghi được downloads.json", exc_info=True)


def start(folder_fn):
    """Chạy các luồng tải và nạp lại hàng chờ từ lần trước."""
    global _folder, _started
    with _cond:
        _folder = folder_fn
        if _started:
            return
        _started = True
    pending = core.read_json(STATE_FILE)
    if isinstance(pending, list) and pending:
        add([u for u in pending if isinstance(u, str)])
    for i in range(WORKERS):
        threading.Thread(target=_worker, name=f"download-{i + 1}", daemon=True).start()


def add(uris):
    """Thêm bài vào hàng tải. Bỏ qua bài đang tải hoặc đã có trong thư viện. Trả về {added, skipped}."""
    added = skipped = 0
    with _cond:
        active = {j["uri"] for j in _jobs if j["status"] in ACTIVE}
        for uri in uris:
            if not online.is_online(uri) or uri in active:
                continue
            if online.saved_path(uri):
                skipped += 1
                continue
            # bỏ lượt cũ (lỗi/đã huỷ) của cùng bài rồi thêm lượt mới
            _jobs[:] = [j for j in _jobs if j["uri"] != uri]
            info = online.meta(uri) or {}
            _jobs.append({"id": next(_ids), "uri": uri, "title": info.get("title") or uri,
                          "artist": info.get("artist") or "", "status": "queued", "progress": 0.0,
                          "error": "", "file": "", "cancel": False})
            active.add(uri)
            added += 1
        if added:
            _persist()
            _cond.notify_all()
    return {"added": added, "skipped": skipped}


def cancel(job_id):
    with _cond:
        for j in _jobs:
            if j["id"] == job_id:
                if j["status"] == "queued":
                    j["status"] = "canceled"
                elif j["status"] == "running":
                    j["cancel"] = True  # luồng tải sẽ dừng ở lần báo tiến độ kế tiếp
        _persist()


def cancel_all():
    with _cond:
        for j in _jobs:
            if j["status"] == "queued":
                j["status"] = "canceled"
            elif j["status"] == "running":
                j["cancel"] = True
        _persist()


def retry(job_id):
    with _cond:
        for j in _jobs:
            if j["id"] == job_id and j["status"] in ("error", "canceled"):
                j.update(status="queued", progress=0.0, error="", cancel=False)
        _persist()
        _cond.notify_all()


def clear_finished():
    with _cond:
        _jobs[:] = [j for j in _jobs if j["status"] in ACTIVE]


def snapshot():
    with _cond:
        jobs = [{k: v for k, v in j.items() if k != "cancel"} for j in _jobs]
    return {"done": _done_count, "active": sum(j["status"] in ACTIVE for j in jobs), "jobs": jobs}


def _take():
    with _cond:
        while True:
            job = next((j for j in _jobs if j["status"] == "queued"), None)
            if job:
                job["status"] = "running"
                return job
            _cond.wait()


def _worker():
    global _done_count
    while True:
        job = _take()

        def progress(p, job=job):
            if job["cancel"]:
                raise Cancelled()
            if p is not None:
                job["progress"] = round(p, 3)

        info = online.meta(job["uri"]) or {}
        job.update(title=info.get("title") or job["title"], artist=info.get("artist") or job["artist"])
        try:
            path = online.save(job["uri"], _folder(), progress=progress)
            result = {"status": "done", "file": path, "progress": 1.0}
        except Exception as exc:
            if job["cancel"]:
                result = {"status": "canceled"}
            else:
                log.warning("Tải %s lỗi: %s", job["uri"], exc)
                result = {"status": "error", "error": str(exc)[:200] or "Không tải được"}
        with _cond:
            job.update(result)
            if result["status"] == "done":
                _done_count += 1
            _persist()
