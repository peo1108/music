"""Test cho DJ: danh sách chặn, máy chủ MCP, đọc luồng sự kiện Claude Code, bảo vệ /api/agent/tool."""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import agent  # noqa: E402
import blocklist  # noqa: E402
import mcp_server  # noqa: E402
import player  # noqa: E402


class BlocklistTest(unittest.TestCase):
    def test_name_variants(self):
        for text in ("HIEUTHUHAI - Không Thể Say", "Hiếu Thứ Hai x MANBO", "ngủ một mình (ft. hieuthuhai)",
                     "Exit Sign | HIEUTHUHAI ft. marzuz", "[Cover] Không Thể Say - Hieu Thu Hai"):
            self.assertTrue(blocklist.matches("HIEUTHUHAI", text), text)
        self.assertTrue(blocklist.matches("Hiếu Thứ Hai", "HIEUTHUHAI"))
        for text in ("Sơn Tùng M-TP - Lạc Trôi", "Thứ Hai đầu tuần", "Hiếu - Hai mươi hai"):
            self.assertFalse(blocklist.matches("HIEUTHUHAI", text), text)

    def test_short_names_keep_accents(self):
        self.assertTrue(blocklist.matches("Đen", "Đen - Bài này chill phết"))
        self.assertFalse(blocklist.matches("Đen", "Anh Đến Đây"))
        self.assertFalse(blocklist.matches("Đen", "Golden Hour"))

    def test_storage_and_filter(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(blocklist, "FILE", os.path.join(d, "b.json")), \
                mock.patch.object(blocklist.core, "DATA_DIR", d):
            self.assertEqual(blocklist.add("HIEUTHUHAI"), ["HIEUTHUHAI"])
            self.assertEqual(blocklist.add("Hiếu Thứ Hai"), ["HIEUTHUHAI"])  # cùng 1 người, không thêm trùng
            tracks = [{"file": "yt:1", "title": "Không Thể Say", "artist": "HIEUTHUHAI"},
                      {"file": "yt:2", "title": "Lạc Trôi", "artist": "Sơn Tùng M-TP Official"}]
            self.assertEqual([t["file"] for t in blocklist.filter_tracks(tracks)], ["yt:2"])
            self.assertEqual(blocklist.remove("hieu thu hai"), [])


class McpServerTest(unittest.TestCase):
    def test_initialize_and_list(self):
        r = mcp_server.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})
        self.assertEqual(r["result"]["protocolVersion"], "2025-06-18")
        self.assertIsNone(mcp_server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}))
        names = {t["name"] for t in mcp_server.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]}
        self.assertTrue({"get_context", "search_online", "play_tracks", "block_artist"} <= names)
        self.assertIn("error", mcp_server.handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "rm_rf"}}))

    def test_tool_call_goes_to_app_with_token(self):
        with mock.patch.object(mcp_server, "call_app", return_value=({"ok": True}, False)) as call:
            r = mcp_server.handle({"jsonrpc": "2.0", "id": 4, "method": "tools/call",
                                   "params": {"name": "control", "arguments": {"action": "next"}}})
        call.assert_called_once_with("control", {"action": "next"})
        self.assertFalse(r["result"]["isError"])
        self.assertEqual(json.loads(r["result"]["content"][0]["text"]), {"ok": True})


class AgentEndpointTest(unittest.TestCase):
    """Máy chủ MCP -> /api/agent/tool: cần đúng mã, sai mã bị 403."""

    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), player.Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def post(self, token):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/agent/tool", method="POST",
                                     data=json.dumps({"name": "search_online", "args": {"query": "x"}}).encode(),
                                     headers={"Origin": f"http://127.0.0.1:{self.port}", "X-Nhac-Agent": token})
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())

    def test_wrong_token_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.post("sai-ma")
        self.assertEqual(ctx.exception.code, 403)

    def test_right_token_filters_blocked(self):
        found = [{"file": "yt:aaaaaaaaaaa", "title": "Không Thể Say", "artist": "HIEUTHUHAI", "duration": 200},
                 {"file": "yt:bbbbbbbbbbb", "title": "Lạc Trôi", "artist": "Sơn Tùng M-TP", "duration": 233}]
        with mock.patch.object(player.online, "search", return_value=found), \
                mock.patch.object(player.blocklist, "load", return_value=["HIEUTHUHAI"]):
            res = self.post(player.AGENT_TOKEN)["result"]
        self.assertEqual([t["uri"] for t in res], ["yt:bbbbbbbbbbb"])
        self.assertEqual(res[0]["length"], "3:53")


class AgentStreamTest(unittest.TestCase):
    def test_translate(self):
        ev = {"type": "assistant", "message": {"content": [
            {"type": "text", "text": " Ok thầy "},
            {"type": "tool_use", "name": "mcp__nhac__search_online", "input": {"query": "ballad buồn", "source": "sc"}}]}}
        self.assertEqual(agent.translate(ev), [{"type": "text", "text": "Ok thầy"},
                                               {"type": "tool", "text": "Tìm trên SoundCloud: ballad buồn"}])
        done = agent.translate({"type": "result", "subtype": "success", "is_error": False, "session_id": "s1"})
        self.assertEqual(done, [{"type": "done", "session": "s1"}])
        err = agent.translate({"type": "result", "subtype": "success", "is_error": True, "result": "Not logged in · Please run /login"})
        self.assertEqual(err[0]["type"], "error")
        self.assertIn("/login", agent.friendly_error(err[0]["text"]))

    def test_never_uses_npm_cmd_shim(self):
        with tempfile.TemporaryDirectory() as d:
            shim = os.path.join(d, "claude.cmd")
            open(shim, "w").close()
            with mock.patch.object(agent.shutil, "which", return_value=shim), \
                    mock.patch.object(agent.os.path, "expanduser", return_value=d), \
                    mock.patch.dict(agent.os.environ, {"APPDATA": d}):
                self.assertIsNone(agent.find_claude())  # chỉ có .cmd -> không dùng
                exe = os.path.join(d, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
                os.makedirs(os.path.dirname(exe))
                open(exe, "w").close()
                self.assertEqual(agent.find_claude(), exe)


if __name__ == "__main__":
    unittest.main()
