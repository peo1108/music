"""Test nhật ký nghe, hồ sơ gu, 👍/👎, trí nhớ DJ."""
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import djmemory  # noqa: E402
import habits  # noqa: E402

NOW = time.mktime((2026, 11, 4, 23, 30, 0, 0, 0, -1))  # 23:30 thứ Tư


def play(uri, title, artist, hour, days_ago=0, sec=200, dur=210, skip=False, src="yt", via="user"):
    t = time.mktime((2026, 11, 4 - days_ago, hour, 10, 0, 0, 0, -1))
    return {"t": int(t), "uri": uri, "title": title, "artist": artist, "src": src, "via": via,
            "sec": sec, "dur": dur, "skip": skip, "done": not skip and sec >= dur * 0.85}


class HabitsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        for p in (mock.patch.object(habits, "HISTORY_DIR", os.path.join(self.tmp.name, "history")),
                  mock.patch.object(habits, "FEEDBACK_FILE", os.path.join(self.tmp.name, "fb.json")),
                  mock.patch.object(habits.core, "DATA_DIR", self.tmp.name)):
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_log_skips_tiny_and_cleans(self):
        n = habits.log_plays([{"uri": "yt:a", "sec": 1}, {"uri": "yt:b", "sec": 40, "src": "evil", "via": "x"}, "rác"])
        self.assertEqual(n, 1)
        e = habits.load(1)[0]
        self.assertEqual((e["uri"], e["src"], e["via"]), ("yt:b", "local", "user"))

    def test_profile_and_stats(self):
        entries = []
        # Khuya hay nghe lofi Hoàng Uyên (nghe hết), 3 tuần nay
        for d in range(0, 20, 2):
            entries.append(play("yt:lofi1", "Cầu Ô Thước (Lofi)", "HOÀNG UYÊN MUSIC", 23, d))
        # Tuần này nghiện 1 bài SoundCloud
        for d in range(0, 6):
            entries.append(play("sc:hot", "Tìm Em - Coldz Remix", "Coldz", 21, d, src="sc", via="dj"))
        # Hay bỏ qua remix TikTok
        for d in range(0, 4):
            entries.append(play("yt:tiktok", "Nhạc Remix TikTok 2026", "Remix Channel", 22, d, sec=8, skip=True))
        # Buổi sáng nghe Sơn Tùng
        for d in range(0, 5):
            entries.append(play("yt:st", "Nơi Này Có Anh", "Sơn Tùng M-TP Official", 8, d))
        habits.log_plays(entries)

        p = habits.profile(NOW)
        self.assertEqual(p["nowSlot"], "khuya")
        self.assertIn("HOÀNG UYÊN", p["bySlot"]["khuya"]["artists"][0])
        self.assertEqual(p["bySlot"]["sáng"]["artists"], ["Sơn Tùng M-TP"])  # bỏ đuôi "Official"
        self.assertTrue(any("Coldz" in h for h in p["hotNow"]))
        self.assertTrue(any("Remix TikTok" in s for s in p["oftenSkipped"]))
        self.assertIn("Remix", " ".join(p["oftenSkippedArtists"]))
        self.assertIn("lofi", p["styles"])
        self.assertEqual(p["djSkipRate"], 0)

        st = habits.public_stats(30, NOW)
        self.assertEqual(st["plays"], len(entries))
        self.assertEqual(st["topTracks"][0]["uri"], "yt:lofi1")
        self.assertGreater(st["hours"][23], st["hours"][12])
        self.assertEqual(sum(st["sources"].values()), 100)
        self.assertGreaterEqual(st["streak"], 5)
        self.assertNotIn("_by_track", st)

    def test_feedback_toggle(self):
        habits.set_feedback("yt:x", -1, "Bài dở", "Ai đó")
        self.assertEqual(habits.feedback()["yt:x"]["v"], -1)
        self.assertIn("Bài dở — Ai đó", habits.profile(NOW)["disliked"])
        habits.set_feedback("yt:x", 0)
        self.assertNotIn("yt:x", habits.feedback())

    def test_prune_old_months(self):
        os.makedirs(habits.HISTORY_DIR)
        for name in ("2026-05.jsonl", "2026-08.jsonl", "2026-11.jsonl"):
            open(os.path.join(habits.HISTORY_DIR, name), "w").close()
        habits.prune(NOW)
        self.assertEqual(sorted(os.listdir(habits.HISTORY_DIR)), ["2026-08.jsonl", "2026-11.jsonl"])

    def test_clean_artist(self):
        self.assertEqual(habits.clean_artist("Sơn Tùng M-TP Official"), "Sơn Tùng M-TP")
        self.assertEqual(habits.clean_artist("HIEUTHUHAI - Topic"), "HIEUTHUHAI")
        self.assertEqual(habits.clean_artist("Music"), "Music")


class DjMemoryTest(unittest.TestCase):
    def test_add_dedupe_remove(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(djmemory, "FILE", os.path.join(d, "m.json")), \
                mock.patch.object(djmemory.core, "DATA_DIR", d):
            djmemory.add("Ghét nhạc remix TikTok")
            notes = djmemory.add("ghét nhạc remix tiktok")  # trùng (khác hoa thường) -> không thêm
            self.assertEqual(len(notes), 1)
            djmemory.add("Tối thứ 6 hay nghe nhạc quẩy")
            self.assertEqual([n["id"] for n in djmemory.notes()], [1, 2])
            self.assertEqual(djmemory.for_prompt()[1], {"id": 2, "note": "Tối thứ 6 hay nghe nhạc quẩy"})
            djmemory.remove(1)
            self.assertEqual([n["text"] for n in djmemory.notes()], ["Tối thứ 6 hay nghe nhạc quẩy"])
            with self.assertRaises(ValueError):
                djmemory.add("   ")


if __name__ == "__main__":
    unittest.main()
