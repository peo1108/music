"""Thói quen nghe nhạc: nhật ký từng lượt nghe, 👍/👎, và hồ sơ gu tự tính (không tốn token).

Nhật ký: %APPDATA%/NhacPlayer/history/YYYY-MM.jsonl, mỗi dòng 1 lượt nghe:
    {"t": giây epoch lúc bắt đầu, "uri", "title", "artist", "src": yt|sc|local, "via": user|dj|radio,
     "sec": số giây thật sự nghe, "dur": độ dài bài, "skip": bỏ qua sớm, "done": nghe gần hết}
Giữ khoảng 4 tháng gần nhất. Dùng cho: DJ (tóm tắt gu gửi kèm mỗi lần chat), trang "Nhìn lại", gợi ý trang chủ.
"""
import glob
import json
import os
import re
import threading
import time
import unicodedata
from collections import Counter, defaultdict

import core

HISTORY_DIR = os.path.join(core.DATA_DIR, "history")
FEEDBACK_FILE = os.path.join(core.DATA_DIR, "feedback.json")
KEEP_MONTHS = 4
_lock = threading.Lock()

# Khung giờ trong ngày (giờ bắt đầu, giờ kết thúc)
SLOTS = [("khuya", 0, 5), ("sáng", 5, 11), ("chiều", 11, 17), ("tối", 17, 22), ("khuya", 22, 24)]
# Kiểu nhạc nhận ra từ tên bài
STYLES = {
    "lofi": ("lofi", "lo-fi", "lo fi"),
    "remix": ("remix", "vinahouse", "edm", "bass boosted", "mashup"),
    "slowed/speed up": ("slowed", "reverb", "speed up", "sped up", "nightcore"),
    "rap": ("rap", "hip hop", "hiphop", "trap", "drill"),
    "acoustic/cover": ("acoustic", "cover", "piano", "guitar", "unplugged"),
    "ballad": ("ballad",),
    "live": ("live", "concert", "sân khấu"),
}


# ---------------------------------------------------------------- tiện ích chữ
def fold(text):
    text = unicodedata.normalize("NFD", str(text or "").lower().replace("đ", "d"))
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


ARTIST_JUNK = re.compile(r"\s*(-\s*topic|official|vevo|music|channel|entertainment|records?)\s*$", re.I)


def clean_artist(name):
    """'Sơn Tùng M-TP Official' -> 'Sơn Tùng M-TP' (tên kênh YouTube hay thêm đuôi)."""
    name = str(name or "").strip()
    for _ in range(3):
        stripped = ARTIST_JUNK.sub("", name).strip(" -|")
        if stripped == name or not stripped:
            break
        name = stripped
    return name


def is_vietnamese(text):
    t = unicodedata.normalize("NFC", str(text or "")).lower()
    return t != fold(t) or bool(re.search(r"\b(anh|em|yeu|nguoi|tinh|mua|dem)\b", t))


def style_of(title):
    t = fold(title)
    return [name for name, words in STYLES.items() if any(re.search(rf"\b{re.escape(w)}\b", t) for w in words)]


def slot_of(hour):
    return next(name for name, a, b in SLOTS if a <= hour < b)


# ---------------------------------------------------------------- ghi nhật ký
def _month_file(ts):
    return os.path.join(HISTORY_DIR, time.strftime("%Y-%m", time.localtime(ts)) + ".jsonl")


def log_plays(entries):
    """Ghi các lượt nghe từ giao diện. Bỏ lượt nghe dưới 2 giây (bấm nhầm)."""
    clean = []
    for e in entries if isinstance(entries, list) else [entries]:
        if not isinstance(e, dict) or not isinstance(e.get("uri"), str):
            continue
        sec = float(e.get("sec") or 0)
        if sec < 2:
            continue
        clean.append({"t": int(e.get("t") or time.time()), "uri": e["uri"][:600],
                      "title": str(e.get("title") or "")[:200], "artist": str(e.get("artist") or "")[:120],
                      "src": e.get("src") if e.get("src") in ("yt", "sc", "local") else "local",
                      "via": e.get("via") if e.get("via") in ("user", "dj", "radio") else "user",
                      "sec": round(sec, 1), "dur": round(float(e.get("dur") or 0), 1),
                      "skip": bool(e.get("skip")), "done": bool(e.get("done"))})
    if not clean:
        return 0
    with _lock:
        os.makedirs(HISTORY_DIR, exist_ok=True)
        for e in clean:
            with open(_month_file(e["t"]), "a", encoding="utf-8") as fh:
                fh.write(json.dumps(e, ensure_ascii=False) + "\n")
    return len(clean)


def prune(now=None):
    """Xoá nhật ký cũ hơn KEEP_MONTHS tháng."""
    now = now or time.time()
    lt = time.localtime(now)
    keep_from = (lt.tm_year * 12 + lt.tm_mon - 1) - (KEEP_MONTHS - 1)
    for path in glob.glob(os.path.join(HISTORY_DIR, "*.jsonl")):
        m = re.match(r"(\d{4})-(\d{2})\.jsonl$", os.path.basename(path))
        if m and int(m.group(1)) * 12 + int(m.group(2)) - 1 < keep_from:
            try:
                os.remove(path)
            except OSError:
                pass


def load(days=90, now=None):
    now = now or time.time()
    since = now - days * 86400
    out = []
    for path in sorted(glob.glob(os.path.join(HISTORY_DIR, "*.jsonl"))):
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    try:
                        e = json.loads(line)
                    except ValueError:
                        continue  # dòng ghi dở khi tắt máy
                    if isinstance(e, dict) and e.get("t", 0) >= since:
                        out.append(e)
        except OSError:
            continue
    return out


# ---------------------------------------------------------------- 👍 / 👎
def feedback():
    data = core.read_json(FEEDBACK_FILE)
    return data if isinstance(data, dict) else {}


def set_feedback(uri, value, title="", artist=""):
    """value: 1 = hợp gu, -1 = không hợp, 0 = bỏ đánh giá."""
    with _lock:
        data = feedback()
        if value in (1, -1):
            data[uri] = {"v": value, "at": int(time.time()), "title": str(title)[:200], "artist": str(artist)[:120]}
        else:
            data.pop(uri, None)
        os.makedirs(core.DATA_DIR, exist_ok=True)
        core.write_json(FEEDBACK_FILE, data)
        return data


# ---------------------------------------------------------------- tính thói quen
def _label(e):
    artist = clean_artist(e.get("artist"))
    return f'{e.get("title") or e["uri"]}' + (f" — {artist}" if artist else "")


def stats(days=30, now=None, entries=None):
    """Số liệu cho trang "Nhìn lại" và gợi ý trang chủ."""
    now = now or time.time()
    entries = load(days, now) if entries is None else entries
    minutes = sum(e.get("sec", 0) for e in entries) / 60
    by_track = defaultdict(lambda: {"plays": 0, "sec": 0.0, "skips": 0, "done": 0})
    meta = {}
    artists = defaultdict(lambda: {"plays": 0, "sec": 0.0, "skips": 0})
    hours, weekdays, days_seen = [0.0] * 24, [0.0] * 7, defaultdict(float)
    sources, styles, slot_artists, slot_tracks = Counter(), Counter(), defaultdict(Counter), defaultdict(Counter)
    vi_sec = 0.0
    for e in entries:
        lt = time.localtime(e["t"])
        sec = e.get("sec", 0)
        tr = by_track[e["uri"]]
        tr["plays"] += 1
        tr["sec"] += sec
        tr["skips"] += 1 if e.get("skip") else 0
        tr["done"] += 1 if e.get("done") else 0
        meta[e["uri"]] = e
        name = clean_artist(e.get("artist"))
        if name:
            a = artists[name]
            a["plays"] += 1
            a["sec"] += sec
            a["skips"] += 1 if e.get("skip") else 0
        hours[lt.tm_hour] += sec / 60
        weekdays[lt.tm_wday] += sec / 60
        days_seen[time.strftime("%Y-%m-%d", lt)] += sec / 60
        sources[e.get("src", "local")] += sec
        for s in style_of(e.get("title")):
            styles[s] += sec
        if is_vietnamese(f'{e.get("title")} {e.get("artist")}'):
            vi_sec += sec
        if not e.get("skip"):
            slot = slot_of(lt.tm_hour)
            if name:
                slot_artists[slot][name] += sec
            slot_tracks[slot][e["uri"]] += sec

    def track_row(uri, v):
        e = meta[uri]
        return {"uri": uri, "title": e.get("title") or uri, "artist": clean_artist(e.get("artist")),
                "plays": v["plays"], "minutes": round(v["sec"] / 60, 1)}

    top_tracks = sorted(by_track.items(), key=lambda kv: (-kv[1]["sec"], -kv[1]["plays"]))
    total_sec = sum(sources.values()) or 1
    # Chuỗi ngày nghe liên tiếp tính tới hôm nay (hoặc hôm qua)
    streak, day = 0, now
    if time.strftime("%Y-%m-%d", time.localtime(day)) not in days_seen:
        day -= 86400
    while time.strftime("%Y-%m-%d", time.localtime(day)) in days_seen:
        streak += 1
        day -= 86400
    busiest = max(days_seen.items(), key=lambda kv: kv[1]) if days_seen else None
    # Ca sĩ lần đầu nghe trong khoảng này (so với cả nhật ký 4 tháng)
    older = {clean_artist(e.get("artist")) for e in load(120, now) if e["t"] < now - days * 86400}
    new_artists = [n for n, v in sorted(artists.items(), key=lambda kv: -kv[1]["sec"]) if n not in older]
    return {
        "days": days, "plays": len(entries), "minutes": round(minutes), "tracks": len(by_track),
        "skips": sum(1 for e in entries if e.get("skip")),
        "topTracks": [track_row(u, v) for u, v in top_tracks[:10]],
        "topArtists": [{"name": n, "plays": v["plays"], "minutes": round(v["sec"] / 60, 1)}
                       for n, v in sorted(artists.items(), key=lambda kv: -kv[1]["sec"])[:10]],
        "hours": [round(h, 1) for h in hours], "weekdays": [round(w, 1) for w in weekdays],
        "sources": {k: round(v * 100 / total_sec) for k, v in sources.items()},
        "styles": [s for s, _ in styles.most_common(4)],
        "vietnamese": round(vi_sec * 100 / total_sec),
        "streak": streak, "activeDays": len(days_seen),
        "busiestDay": {"date": busiest[0], "minutes": round(busiest[1])} if busiest else None,
        "newArtists": new_artists[:8], "newArtistCount": len(new_artists),
        "slotTracks": {slot: [u for u, _ in c.most_common(12)] for slot, c in slot_tracks.items()},
        "slotArtists": {slot: [n for n, _ in c.most_common(5)] for slot, c in slot_artists.items()},
        "_by_track": by_track, "_artists": artists, "_meta": meta,
    }


def hot_tracks(now=None, entries=None):
    """Bài "đang nghiện": nghe nhiều trong 7 ngày qua so với trước đó."""
    now = now or time.time()
    entries = load(60, now) if entries is None else entries
    recent, before, meta = Counter(), Counter(), {}
    for e in entries:
        if e.get("skip"):
            continue
        meta[e["uri"]] = e
        (recent if e["t"] >= now - 7 * 86400 else before)[e["uri"]] += 1
    score = {u: n - before[u] / 7.5 for u, n in recent.items() if n >= 2}  # trước đó tính trung bình theo tuần
    ranked = sorted(score.items(), key=lambda kv: -kv[1])
    return [{"uri": u, "title": meta[u].get("title") or u, "artist": clean_artist(meta[u].get("artist")), "plays": recent[u]}
            for u, s in ranked if s > 0][:10]


def profile(now=None):
    """Tóm tắt gu gọn (vài trăm token) gửi kèm cho DJ mỗi lần chat."""
    now = now or time.time()
    entries = load(90, now)
    fb = feedback()
    liked = [f'{v.get("title")} — {clean_artist(v.get("artist"))}' for v in fb.values() if v.get("v") == 1][-10:]
    disliked = [f'{v.get("title")} — {clean_artist(v.get("artist"))}' for v in fb.values() if v.get("v") == -1][-15:]
    if not entries:
        return {"note": "Chưa có nhật ký nghe (mới cài hoặc mới bật tính năng này).", "liked": liked, "disliked": disliked}
    st = stats(90, now, entries)
    by_track, artists, meta = st["_by_track"], st["_artists"], st["_meta"]
    core_tracks = sorted((u for u, v in by_track.items() if v["done"] >= 3), key=lambda u: -by_track[u]["done"])
    skipped_tracks = sorted((u for u, v in by_track.items() if v["skips"] >= 2 and v["skips"] >= v["plays"] * 0.6),
                            key=lambda u: -by_track[u]["skips"])
    skipped_artists = [n for n, v in artists.items() if v["plays"] >= 3 and v["skips"] >= v["plays"] * 0.6]
    via = Counter(e.get("via", "user") for e in entries)
    dj_entries = [e for e in entries if e.get("via") == "dj"]
    return {
        "basedOn": f'{len(entries)} lượt nghe, {round(st["minutes"] / 60, 1)} giờ trong 90 ngày',
        "nowSlot": slot_of(time.localtime(now).tm_hour),
        "bySlot": {slot: {"artists": st["slotArtists"].get(slot, [])} for slot in ("sáng", "chiều", "tối", "khuya")
                   if st["slotArtists"].get(slot)},
        "styles": st["styles"],
        "sources": st["sources"],
        "vietnamesePct": st["vietnamese"],
        "hotNow": [f'{h["title"]} — {h["artist"]}' for h in hot_tracks(now, entries)[:6]],
        "coreTracks": [_label(meta[u]) for u in core_tracks[:8]],
        "oftenSkipped": [_label(meta[u]) for u in skipped_tracks[:8]],
        "oftenSkippedArtists": skipped_artists[:8],
        "djSkipRate": round(100 * sum(1 for e in dj_entries if e.get("skip")) / len(dj_entries)) if dj_entries else None,
        "liked": liked, "disliked": disliked,
        "whoPicks": {k: round(v * 100 / len(entries)) for k, v in via.items()},
    }


def public_stats(days, now=None):
    st = stats(days, now)
    st["hot"] = hot_tracks(now)
    return {k: v for k, v in st.items() if not k.startswith("_")}
