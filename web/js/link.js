"use strict";

// =====================================================================================
// Dán link YouTube/SoundCloud: xem playlist / bài, phát, lưu thành playlist, tải cả playlist về máy
// =====================================================================================
const linkState = { url: "", status: "", data: null, error: "" };
const SOURCE_NAME = { yt: "YouTube", sc: "SoundCloud" };

function loadLink(url) {
  Object.assign(linkState, { url, status: "loading", data: null, error: "" });
  api("/api/link?u=" + enc(url))
    .then((r) => r.json())
    .then((d) => {
      if (linkState.url !== url) return;
      if (d && d.ok) {
        d.tracks.forEach((t) => known.set(t.file, { ...(known.get(t.file) || {}), ...t }));
        Object.assign(linkState, { status: "ok", data: d });
      } else Object.assign(linkState, { status: "error", error: (d && d.error) || "Không đọc được link này" });
    })
    .catch(() => { if (linkState.url === url) Object.assign(linkState, { status: "error", error: "Không kết nối được" }); })
    .finally(() => { if (view.name === "link" && view.url === url) renderView(false); });
}

function linkHtml(url) {
  if (linkState.url !== url) loadLink(url);
  const back = `<button class="back" data-back>${icon("left")}Quay lại</button>`;
  if (linkState.status === "loading") {
    const sc = /soundcloud/i.test(url);
    return `${back}<div class="loading-box"><div class="spinner"></div>Đang đọc link${sc ? " SoundCloud (playlist dài sẽ mất vài giây)" : ""}…</div>`;
  }
  if (linkState.status === "error") {
    return `${back}<div class="empty">${esc(linkState.error)}<br><button class="pill" data-action="linkRetry" style="margin-top:14px">Thử lại</button></div>`;
  }
  const d = linkState.data;
  if (!d) return "";
  const src = SOURCE_NAME[d.source] || "";
  if (d.kind === "playlists") {
    return headerHtml({ back: true, title: d.title || "Các playlist", kind: `${src} · chọn 1 playlist`, stats: `${d.lists.length} playlist` })
      + `<div class="link-lists">${d.lists.map((l, i) => `<button class="link-list" data-action="openLink" data-url="${esc(l.url)}" style="--i:${i}">${icon("list")}<span>${esc(l.title)}</span></button>`).join("")}</div>`;
  }
  currentList = d.tracks;
  if (!d.tracks.length) return `${back}<div class="empty">Link này không có bài nào nghe được.</div>`;
  const single = d.kind === "track";
  const saved = S.playlists.find((p) => p.source === d.url);
  const online = d.tracks.filter((t) => isOnline(t.file));
  const extra = (single ? "" : saved
    ? `<button class="pill" data-action="openPlaylist" data-id="${saved.id}">${icon("list")}Mở playlist đã lưu</button>`
    : `<button class="pill" data-action="linkSave">${icon("plus")}Lưu thành playlist</button>`)
    + (online.length ? `<button class="pill" data-action="linkDownload">${icon("download")}${single ? "Tải về máy" : "Tải cả playlist"}</button>` : "");
  return headerHtml({
    back: true, title: single ? d.tracks[0].title : d.title || "Playlist", kind: `${single ? "Bài hát" : "Playlist"} ${src}`,
    by: single ? artistOf(d.tracks[0]) : d.uploader, art: `<div class="big-art">${playlistCover(d.tracks)}</div>`,
    stats: statsText(d.tracks), actions: true, extra,
  }) + songsHtml(d.tracks);
}

ACTIONS.linkRetry = () => { linkState.url = ""; renderView(false); };
ACTIONS.openLink = (b) => go({ name: "link", url: b.dataset.url });
ACTIONS.openPlaylist = (b) => go({ name: "playlist", id: b.dataset.id });
ACTIONS.linkSave = () => {
  const d = linkState.data;
  if (!d) return;
  const pl = createPlaylist(d.title || "Playlist", d.tracks.map((t) => t.file));
  pl.source = d.url; // nhớ nguồn để "Cập nhật từ nguồn" sau này
  save();
  toast(`Đã lưu “${pl.name}” (${pl.tracks.length} bài)`);
  renderView(false);
};
ACTIONS.linkDownload = () => {
  const d = linkState.data;
  if (d) queueDownloads(d.tracks.map((t) => t.file));
};

// Playlist nhập từ link: lấy thêm bài mới từ playlist gốc
async function refreshFromSource(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl || !pl.source) return;
  toast("Đang cập nhật từ nguồn…", 30000);
  try {
    const d = await (await api("/api/link?u=" + enc(pl.source))).json();
    if (!d || !d.ok) return toast((d && d.error) || "Không cập nhật được");
    d.tracks.forEach((t) => known.set(t.file, { ...(known.get(t.file) || {}), ...t }));
    const n = addPathsToPlaylist(id, d.tracks.map((t) => t.file));
    toast(n ? `Thêm ${n} bài mới từ nguồn` : "Không có bài mới");
  } catch { toast("Không kết nối được"); }
}
ACTIONS.refreshSource = (b) => refreshFromSource(b.dataset.id);
ACTIONS.playlistDownload = (b) => {
  const pl = S.playlists.find((p) => p.id === b.dataset.id);
  if (pl) queueDownloads(pl.tracks);
};
