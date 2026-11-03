"use strict";

// ---------- Danh sách phát ----------
function createPlaylist(name, tracks = []) {
  let final = (name || "").trim() || "Playlist mới";
  const base = final;
  let n = 2;
  while (S.playlists.some((p) => p.name === final)) final = `${base} (${n++})`;
  const pl = {
    id: "pl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: final,
    tracks: [...new Set(tracks.filter(Boolean))],
  };
  S.playlists.push(pl);
  save();
  renderSidebar();
  return pl;
}
async function newPlaylist(withTrack) {
  const name = await ask("Tên danh sách phát mới", `Danh sách ${S.playlists.length + 1}`);
  if (!name) return;
  const pl = createPlaylist(name, withTrack ? [withTrack] : []);
  toast(withTrack ? `Đã thêm vào “${pl.name}”` : `Đã tạo “${pl.name}”`);
  if (view.name === "playlists") renderView(false);
}
function addPathsToPlaylist(id, paths) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return 0;
  let added = 0;
  for (const p of paths) {
    if (p && !pl.tracks.includes(p)) { pl.tracks.push(p); added++; }
  }
  if (added) {
    save();
    renderSidebar();
    if (view.name === "playlist" && view.id === id) renderView(false);
    if (view.name === "playlists") renderView(false);
  }
  return added;
}
function addToPlaylist(id, path) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  if (pl.tracks.includes(path)) return toast("Bài này đã có trong danh sách");
  addPathsToPlaylist(id, [path]);
  toast(`Đã thêm vào “${pl.name}”`);
}
async function renamePlaylist(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  const name = await ask("Đổi tên danh sách phát", pl.name);
  if (!name) return;
  pl.name = name;
  save();
  renderSidebar();
  if (view.name === "playlist") renderView(false);
  if (view.name === "playlists") renderView(false);
}
function deletePlaylist(id) {
  const idx = S.playlists.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const [pl] = S.playlists.splice(idx, 1);
  save();
  renderSidebar();
  if (view.name === "playlist" && view.id === id) go({ name: "playlists" });
  else if (view.name === "playlists") renderView(false);
  showUndo(`Đã xoá “${pl.name}”`, () => {
    S.playlists.splice(Math.min(idx, S.playlists.length), 0, pl);
    save();
    renderSidebar();
    if (view.name === "playlists") renderView(false);
    toast(`Đã khôi phục “${pl.name}”`);
  });
}
function duplicatePlaylist(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  let name = `${pl.name} (bản sao)`;
  let n = 2;
  while (S.playlists.some((p) => p.name === name)) name = `${pl.name} (bản sao ${n++})`;
  const copy = { ...pl, id: "pl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, tracks: [...pl.tracks] };
  S.playlists.splice(S.playlists.indexOf(pl) + 1, 0, copy);
  save();
  renderSidebar();
  if (view.name === "playlists") renderView(false);
  toast(`Đã nhân bản “${pl.name}”`);
}
function mergePlaylistMenu(id, x, y) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  const others = S.playlists.filter((p) => p.id !== id);
  if (!others.length) return toast("Không có playlist khác để gộp");
  showMenu(x, y, others.map((p) => ({
    ic: "list", label: p.name, run: () => {
      const n = addPathsToPlaylist(id, p.tracks);
      toast(n ? `Đã gộp ${n} bài từ “${p.name}”` : `“${p.name}” không có bài mới`);
    },
  })));
}
function m3uText(pl) {
  const lines = ["#EXTM3U", `#PLAYLIST:${pl.name}`];
  let count = 0;
  for (const p of pl.tracks) {
    const t = T(p);
    if (!t) continue;
    const target = isOnline(p) ? (t.web || "") : p;
    if (!target) continue;
    lines.push(`#EXTINF:${Math.round(t.duration || 0)},${artistOf(t)} - ${t.title}`);
    lines.push(target);
    count++;
  }
  return { text: lines.join("\r\n"), count };
}
async function exportPlaylist(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  const { text, count } = m3uText(pl);
  if (!count) return toast("Playlist không có bài nào để xuất");
  const name = (pl.name || "playlist").replace(/[\\/:*?"<>|]+/g, "_");
  if (window.pywebview) {
    let saved = false;
    try { saved = await py("save_text", name + ".m3u", text); } catch {}
    if (!saved) return toast("Đã huỷ xuất M3U");
    return toast(`Đã lưu ${count} bài ra M3U`);
  }
  const blob = new Blob([text], { type: "audio/x-mpegurl;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".m3u";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Đã xuất ${count} bài ra M3U`);
}
function reorderPlaylist(id, from, to) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl || from === to || from < 0 || to < 0 || from >= pl.tracks.length || to >= pl.tracks.length) return;
  const [p] = pl.tracks.splice(from, 1);
  pl.tracks.splice(to, 0, p);
  save();
  if (view.name === "playlist" && view.id === id) renderView(false);
  toast("Đã đổi thứ tự bài");
}
function reorderPlaylists(fromId, toId) {
  const from = S.playlists.findIndex((p) => p.id === fromId);
  const to = S.playlists.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [pl] = S.playlists.splice(from, 1);
  S.playlists.splice(to, 0, pl);
  save();
  renderSidebar();
  if (view.name === "playlists") renderView(false);
}
async function saveQueuePlaylist() {
  if (!Q.length) return toast("Hàng đợi trống");
  const name = await ask("Lưu hàng đợi thành playlist", `Hàng đợi ${new Date().toLocaleDateString("vi-VN")}`);
  if (!name) return;
  const pl = createPlaylist(name, Q.slice());
  toast(`Đã lưu ${pl.tracks.length} bài vào “${pl.name}”`);
  if (view.name === "playlists") renderView(false);
}
function addManyToPlaylist(paths, e) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return toast("Không có bài nào để thêm");
  const items = S.playlists.map((pl) => ({
    ic: "list", label: `${pl.name} (${pl.tracks.length})`,
    run: () => {
      const n = addPathsToPlaylist(pl.id, list);
      toast(n ? `Đã thêm ${n} bài vào “${pl.name}”` : "Các bài này đã có trong playlist");
    },
  }));
  items.push("-", {
    ic: "plus", label: "Playlist mới…", run: async () => {
      const name = await ask("Tên playlist mới", `Playlist ${S.playlists.length + 1}`);
      if (!name) return;
      const pl = createPlaylist(name, list);
      toast(`Đã thêm ${pl.tracks.length} bài vào “${pl.name}”`);
      if (view.name === "playlists") renderView(false);
    },
  });
  showMenu(e.clientX, e.clientY, items);
}
function playlistMenu(id, x, y) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  showMenu(x, y, [
    { ic: "play", label: "Phát", run: () => { const list = pl.tracks.filter(T); if (list.length) playList(list); } },
    { ic: "shuffle", label: "Ngẫu nhiên", run: () => { const list = pl.tracks.filter(T); if (list.length) playList(list, 0, { shuffle: true }); } },
    "-",
    { ic: "plus", label: "Nhân bản", run: () => duplicatePlaylist(id) },
    { ic: "list", label: "Gộp playlist…", run: () => mergePlaylistMenu(id, x, y) },
    { ic: "download", label: "Xuất M3U", run: () => exportPlaylist(id) },
    "-",
    { ic: "pencil", label: "Đổi tên", run: () => renamePlaylist(id) },
    { ic: "trash", label: "Xoá playlist", run: () => deletePlaylist(id) },
  ]);
}
