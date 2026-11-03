"""Kiểm tra các phần logic thuần của app. Chạy:  python -m unittest discover -s tests"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import player  # noqa: E402
import updater  # noqa: E402

PORT = 47816
OK_HEADERS = {"Host": f"127.0.0.1:{PORT}", "X-Nhac": "1"}


class CheckRequestTest(unittest.TestCase):
    def check(self, method, path, headers):
        return player.check_request(method, path, headers, PORT)

    def test_app_requests_allowed(self):
        self.assertIsNone(self.check("GET", "/api/state", OK_HEADERS))
        self.assertIsNone(self.check("GET", "/audio", {"Host": f"127.0.0.1:{PORT}"}))
        self.assertIsNone(self.check("GET", "/js/app.js", {"Host": f"localhost:{PORT}"}))
        self.assertIsNone(self.check("POST", "/api/state", {"Host": f"127.0.0.1:{PORT}",
                                                            "Origin": f"http://127.0.0.1:{PORT}"}))

    def test_cross_site_post_rejected(self):
        # trang lạ: fetch(..., {method:'POST', mode:'no-cors'}) mang Origin của trang đó
        self.assertEqual(self.check("POST", "/api/state", {"Host": f"127.0.0.1:{PORT}",
                                                           "Origin": "https://evil.example"}), "origin")
        self.assertEqual(self.check("POST", "/api/state", {"Host": f"127.0.0.1:{PORT}"}), "origin")

    def test_api_get_needs_header(self):
        self.assertEqual(self.check("GET", "/api/save", {"Host": f"127.0.0.1:{PORT}"}), "header")

    def test_dns_rebinding_rejected(self):
        self.assertEqual(self.check("GET", "/api/state", {**OK_HEADERS, "Host": "evil.example"}), "host")
        self.assertEqual(self.check("GET", "/api/state", {**OK_HEADERS, "Host": "127.0.0.1:9999"}), "host")


class ParseRangeTest(unittest.TestCase):
    def test_no_range(self):
        self.assertEqual(player.parse_range(None, 100), (0, 99, 200))

    def test_normal_ranges(self):
        self.assertEqual(player.parse_range("bytes=10-19", 100), (10, 19, 206))
        self.assertEqual(player.parse_range("bytes=10-", 100), (10, 99, 206))
        self.assertEqual(player.parse_range("bytes=-30", 100), (70, 99, 206))
        self.assertEqual(player.parse_range("bytes=90-500", 100), (90, 99, 206))

    def test_garbage_falls_back_to_whole_file(self):
        for header in ("bytes=abc-", "bytes=1-x", "bytes=-", "items=0-1"):
            self.assertEqual(player.parse_range(header, 100), (0, 99, 200), header)

    def test_spaces_tolerated(self):
        self.assertEqual(player.parse_range("bytes= 100-", 1000), (100, 999, 206))

    def test_past_end(self):
        self.assertEqual(player.parse_range("bytes=200-", 100)[2], 416)


class WebFileTest(unittest.TestCase):
    def test_index_and_scripts(self):
        self.assertTrue(player.web_file("/")[0].endswith("index.html"))
        self.assertTrue(player.web_file("/js/main.js")[0].endswith("main.js"))

    def test_no_escape(self):
        self.assertIsNone(player.web_file("/../player.py"))
        self.assertIsNone(player.web_file("/%2e%2e/player.py"))
        self.assertIsNone(player.web_file("/js/../../core.py"))


class LibraryTest(unittest.TestCase):
    def test_drive_root(self):
        self.assertEqual(player.norm_folder("C:"), "C:\\")
        self.assertEqual(player.norm_folder("D:\\Nhac"), "D:\\Nhac")
        self.assertEqual(player.norm_folder(""), "")

    def test_audio_path_only_real_audio(self):
        with tempfile.TemporaryDirectory() as d:
            song, text = os.path.join(d, "a.mp3"), os.path.join(d, "a.txt")
            for p in (song, text):
                open(p, "wb").close()
            self.assertEqual(player.audio_path(song), song)
            self.assertIsNone(player.audio_path(text))
            self.assertIsNone(player.audio_path("a.mp3"))  # đường dẫn tương đối

    def test_read_track_cached_until_file_changes(self):
        with tempfile.TemporaryDirectory() as d:
            song = os.path.join(d, "Bai hat.mp3")
            with open(song, "wb") as fh:
                fh.write(b"x")
            with mock.patch.object(player, "_read_track", wraps=player._read_track) as spy:
                player.read_track(song)
                player.read_track(song)
                self.assertEqual(spy.call_count, 1)
                with open(song, "wb") as fh:
                    fh.write(b"xy")
                player.read_track(song)
                self.assertEqual(spy.call_count, 2)


class CleanTitleTest(unittest.TestCase):
    def test_youtube_titles(self):
        self.assertEqual(player.clean_title("Sơn Tùng M-TP - Lạc Trôi (Official MV)", "Sơn Tùng M-TP Official"),
                         ("Lạc Trôi", "Sơn Tùng M-TP"))
        self.assertEqual(player.clean_title("Cầu Ô Thước ｜ MV Lyric - Hoàng Uyên Music", ""), ("Cầu Ô Thước", ""))
        self.assertEqual(player.clean_title("Song ft. Someone", "Artist"), ("Song", "Artist"))


class CacheRobustnessTest(unittest.TestCase):
    def test_corrupt_lyrics_cache_is_refetched(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(player, "LYRICS_DIR", d), \
                mock.patch.object(player, "lrclib", return_value=[]) as fake:
            with open(os.path.join(d, "k.json"), "w", encoding="utf-8") as fh:
                fh.write('{"synced": "cụt')  # ghi dở
            data = player.find_lyrics_for({"title": "Bai", "artist": "Ca si", "duration": 100}, "k.json")
            self.assertTrue(fake.called)
            self.assertEqual(data["synced"], "")
            with open(os.path.join(d, "k.json"), encoding="utf-8") as fh:
                self.assertIsInstance(json.load(fh), dict)  # cache đã được ghi lại cho đúng

    def test_peaks_timeout_returns_none(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(player, "PEAKS_DIR", d), \
                mock.patch.object(player.core, "find_tool", return_value="ffmpeg"), \
                mock.patch.object(player.subprocess, "run", side_effect=subprocess.TimeoutExpired("ffmpeg", 120)):
            song = os.path.join(d, "a.mp3")
            open(song, "wb").close()
            self.assertIsNone(player.compute_peaks(song))


class StateBackupTest(unittest.TestCase):
    def test_one_backup_per_day_and_rotation(self):
        with tempfile.TemporaryDirectory() as d:
            state, backups = os.path.join(d, "state.json"), os.path.join(d, "backups")
            with mock.patch.object(player, "STATE_FILE", state), mock.patch.object(player, "BACKUP_DIR", backups):
                player.write_state(b'{"v": 1}')  # chưa có state cũ -> không có gì để sao lưu
                self.assertFalse(os.path.exists(backups))
                os.makedirs(backups)
                for i in range(20):
                    open(os.path.join(backups, f"state-2020{i:04d}.json"), "w").close()
                player.write_state(b'{"v": 2}')
                player.write_state(b'{"v": 3}')
                names = sorted(os.listdir(backups))
                self.assertEqual(len(names), player.BACKUP_KEEP)
                with open(os.path.join(backups, names[-1]), encoding="utf-8") as fh:
                    self.assertEqual(json.load(fh), {"v": 1})  # bản của hôm nay = trạng thái trước lần ghi đầu
                with self.assertRaises(ValueError):
                    player.write_state(b"not json")
                with open(state, encoding="utf-8") as fh:
                    self.assertEqual(json.load(fh), {"v": 3})


class UpdaterTest(unittest.TestCase):
    def test_versions(self):
        self.assertEqual(updater.parse_version("v1.2.3"), (1, 2, 3))
        self.assertEqual(updater.parse_version("1.2"), (1, 2, 0))
        self.assertTrue(updater.is_newer("v1.10.0", "1.9.9"))
        self.assertFalse(updater.is_newer("v1.0.0", "1.0.0"))
        self.assertFalse(updater.is_newer("latest", "1.0.0"))

    def test_summarize(self):
        release = {"tag_name": "v1.1.0", "body": "Sửa lỗi", "html_url": "u",
                   "assets": [{"name": "source.zip"},
                              {"name": "NhacSetup-1.1.0.exe", "browser_download_url": "https://x/s.exe", "size": 5}]}
        info = updater.summarize(release, current="1.0.0", frozen=True)
        self.assertTrue(info["available"] and info["canInstall"])
        self.assertEqual(info["latest"], "1.1.0")
        self.assertEqual(info["asset"]["url"], "https://x/s.exe")
        self.assertFalse(updater.summarize(release, current="1.0.0", frozen=False)["canInstall"])
        self.assertFalse(updater.summarize({**release, "assets": []}, current="1.0.0", frozen=True)["available"])


if __name__ == "__main__":
    unittest.main()
