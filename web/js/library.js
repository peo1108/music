"use strict";

// =====================================================================================
// Thư viện nhạc
// =====================================================================================
const known = new Map(); // đường dẫn -> thông tin bài
let library = [];
let openedFolder = null; // {dir, name, tracks}
let libraryInfo = { dir: "", name: "Thư viện" };
const T = (p) => known.get(p);
const artistOf = (t) => t.artist || "Không rõ ca sĩ";

async function fetchFolder(dir) {
  const d = await (await api("/api/tracks?dir=" + enc(dir || ""))).json();
  d.tracks.forEach((t) => known.set(t.file, t));
  return d;
}
async function loadLibrary() {
  try {
    const d = await fetchFolder("");
    library = d.tracks;
    libraryInfo = { dir: d.dir, name: d.name };
  } catch { library = []; }
  if (openedFolder) {
    try { openedFolder = await fetchFolder(openedFolder.dir); } catch {}
  }
}
// Lấy thông tin cho các bài nằm ngoài thư viện (trong danh sách phát, hàng đợi...)
async function ensureKnown(paths) {
  const missing = [...new Set(paths)].filter((p) => p && !known.has(p));
  if (!missing.length) return;
  try {
    const list = await (await api("/api/meta", { method: "POST", body: JSON.stringify(missing) })).json();
    list.forEach((t) => known.set(t.file, t));
  } catch {}
}

function albums(tracks = library) {
  const m = new Map();
  for (const t of tracks) {
    const name = t.album || t.title;
    const key = plain(name) + "|" + plain(artistOf(t));
    if (!m.has(key)) m.set(key, { key, name, artist: artistOf(t), single: !t.album, tracks: [] });
    m.get(key).tracks.push(t);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
function artists() {
  const m = new Map();
  for (const t of library) {
    const key = plain(artistOf(t));
    if (!m.has(key)) m.set(key, { key, name: artistOf(t), tracks: [] });
    m.get(key).tracks.push(t);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
const firstCover = (tracks) => tracks.find((t) => t.cover);
