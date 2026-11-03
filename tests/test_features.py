"""Test cho dán link, hàng tải, tự cập nhật yt-dlp. Chạy:  python -m unittest discover -s tests"""
import os
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import downloads  # noqa: E402
import online  # noqa: E402
import ytdlp_update  # noqa: E402


class LinkTest(unittest.TestCase):
    def test_is_link(self):
        for url in ("https://www.youtube.com/playlist?list=PL1", "https://youtu.be/abc", "https://music.youtube.com/watch?v=x",
                    "https://soundcloud.com/a/sets/b", "https://on.soundcloud.com/xyz", "http://m.youtube.com/watch?v=1"):
            self.assertTrue(online.is_link(url), url)
        for url in ("youtube.com/x", "https://example.com/youtube.com", "https://notyoutube.com/x", "Sơn Tùng"):
            self.assertFalse(online.is_link(url), url)

    def test_entry_track(self):
        yt = online._entry_track({"ie_key": "Youtube", "id": "SlQR9iu09bQ", "title": "Bài", "uploader": "Kênh", "duration": 235})
        self.assertEqual((yt["file"], yt["artist"], yt["duration"]), ("yt:SlQR9iu09bQ", "Kênh", 235))
        sc = online._entry_track({"ie_key": "Soundcloud", "id": 123, "url": "https://soundcloud.com/a/b?in=x"})
        self.assertEqual((sc["file"], sc["web"]), ("sc:123", "https://soundcloud.com/a/b"))
        self.assertIsNone(online._entry_track({"ie_key": "YoutubeTab", "url": "https://www.youtube.com/playlist?list=1"}))


class YtdlpUpdateTest(unittest.TestCase):
    def test_parse_and_ejs(self):
        self.assertGreater(ytdlp_update.parse("2026.11.2"), ytdlp_update.parse("2026.10.26"))
        self.assertGreater(ytdlp_update.parse("2026.10.26.1"), ytdlp_update.parse("2026.10.26"))
        self.assertEqual(ytdlp_update.ejs_requirement(['brotli; extra == "default"', 'yt-dlp-ejs==0.9.1; extra == "default"']), "0.9.1")
        self.assertIsNone(ytdlp_update.ejs_requirement(["requests"]))

    def test_installed_skips_incomplete_and_bad(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(ytdlp_update, "ROOT", d), \
                mock.patch.object(ytdlp_update, "BAD_FILE", os.path.join(d, "bad.json")):
            for name, ok in (("2026.11.1", True), ("2026.12.5", True), ("2027.1.1", False), ("2026.12.5.tmp", True)):
                os.makedirs(os.path.join(d, name))
                if ok:
                    open(os.path.join(d, name, "ok"), "w").close()
            self.assertEqual([v for v, _ in ytdlp_update.installed()], ["2026.12.5", "2026.11.1"])
            ytdlp_update._mark_bad("2026.12.5")
            self.assertEqual([v for v, _ in ytdlp_update.installed()], ["2026.11.1"])

    def test_activate_prefers_newer_download_only_when_frozen(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(ytdlp_update, "ROOT", d), \
                mock.patch.object(ytdlp_update, "BAD_FILE", os.path.join(d, "bad.json")), \
                mock.patch.object(ytdlp_update, "bundled_version", return_value="2026.10.26"), \
                mock.patch.object(ytdlp_update, "_unload"), mock.patch.object(ytdlp_update, "_active", None):
            path = os.path.join(d, "2026.12.5")
            os.makedirs(path)
            open(os.path.join(path, "ok"), "w").close()
            with mock.patch.object(ytdlp_update.core, "FROZEN", False):
                self.assertEqual(ytdlp_update.activate(), "2026.10.26")
            with mock.patch.object(ytdlp_update.core, "FROZEN", True):
                try:
                    self.assertEqual(ytdlp_update.activate(), "2026.12.5")
                    self.assertEqual(sys.path[0], path)
                finally:
                    if path in sys.path:
                        sys.path.remove(path)


class DownloadsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        patches = [mock.patch.object(downloads, "STATE_FILE", os.path.join(self.tmp.name, "dl.json")),
                   mock.patch.object(downloads, "_jobs", []), mock.patch.object(downloads, "_started", False),
                   mock.patch.object(downloads.online, "meta", return_value={"title": "Bài", "artist": "Ca sĩ"})]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def wait_for(self, cond, timeout=5):
        end = time.time() + timeout
        while time.time() < end:
            if cond():
                return True
            time.sleep(0.02)
        return False

    def test_add_skips_saved_duplicates_and_local(self):
        with mock.patch.object(downloads.online, "saved_path", side_effect=lambda u: "x.mp3" if u == "yt:saved00000" else None):
            r = downloads.add(["yt:aaaaaaaaaaa", "yt:aaaaaaaaaaa", "yt:saved00000", r"C:\nhac\a.mp3"])
        self.assertEqual(r, {"added": 1, "skipped": 1})
        self.assertEqual(downloads.snapshot()["active"], 1)

    def test_worker_downloads_cancels_and_retries(self):
        gate = threading.Event()

        def fake_save(uri, folder, progress=None):
            if uri == "yt:slowslowslo":
                while True:  # tải "mãi" đến khi bị huỷ
                    progress(0.5)
                    time.sleep(0.01)
            if uri == "yt:failfailfai" and not gate.is_set():
                raise RuntimeError("Video không khả dụng")
            progress(0.9)
            return os.path.join(folder, uri[3:] + ".mp3")

        with mock.patch.object(downloads.online, "saved_path", return_value=None), \
                mock.patch.object(downloads.online, "save", side_effect=fake_save):
            downloads.start(lambda: self.tmp.name)
            downloads.add(["yt:okokokokoko", "yt:failfailfai", "yt:slowslowslo"])
            jobs = lambda: {j["uri"]: j for j in downloads.snapshot()["jobs"]}  # noqa: E731
            self.assertTrue(self.wait_for(lambda: jobs()["yt:okokokokoko"]["status"] == "done"))
            self.assertTrue(self.wait_for(lambda: jobs()["yt:failfailfai"]["status"] == "error"))
            self.assertEqual(jobs()["yt:failfailfai"]["error"], "Video không khả dụng")
            self.assertTrue(self.wait_for(lambda: jobs()["yt:slowslowslo"]["status"] == "running"))
            downloads.cancel(jobs()["yt:slowslowslo"]["id"])
            self.assertTrue(self.wait_for(lambda: jobs()["yt:slowslowslo"]["status"] == "canceled"))
            gate.set()
            downloads.retry(jobs()["yt:failfailfai"]["id"])
            self.assertTrue(self.wait_for(lambda: jobs()["yt:failfailfai"]["status"] == "done"))
            downloads.clear_finished()
            self.assertEqual(downloads.snapshot()["jobs"], [])


if __name__ == "__main__":
    unittest.main()
