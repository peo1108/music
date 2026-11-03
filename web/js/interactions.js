"use strict";

// ---------- Bấm trong trang ----------
content.addEventListener("click", (e) => {
  const el = e.target;
  const sf = el.closest("[data-sfilter]");
  if (sf) { searchState.filter = sf.dataset.sfilter; return renderView(false); }
  if (el.closest("[data-prefer-offline]")) {
    S.settings.preferOffline = !S.settings.preferOffline;
    save();
    return renderView(false);
  }
  if (el.closest("[data-new-playlist]")) return newPlaylist();
  if (el.closest("[data-materialize-all]")) return materializeAll();
  const saveSugg = el.closest("[data-save-sugg]");
  if (saveSugg) return saveGroup(saveSugg.dataset.saveSugg, suggestPlaylists());
  const saveAuto = el.closest("[data-save-auto]");
  if (saveAuto) return saveGroup(saveAuto.dataset.saveAuto, autoPlaylists());
  if (el.closest("[data-add-all]")) return addManyToPlaylist(currentListPaths(), e);
  const plMenuBtn = el.closest("[data-pl-menu]");
  if (plMenuBtn) return playlistMenu(plMenuBtn.dataset.plMenu, e.clientX, e.clientY);
  if (el.closest("[data-back]")) return goBack();
  if (el.closest("[data-play-all]")) return playList(currentListPaths(), 0);
  if (el.closest("[data-shuffle-all]")) return playList(currentListPaths(), 0, { shuffle: true });
  const ren = el.closest("[data-rename]");
  if (ren) return renamePlaylist(ren.dataset.rename);
  const del = el.closest("[data-delete]");
  if (del) return deletePlaylist(del.dataset.delete);
  const fav = el.closest(".fav");
  if (fav) return toggleFav(fav.dataset.p);
  const ar = el.closest(".sa[data-artist], .by[data-artist]");
  if (ar) return go({ name: "artist", key: ar.dataset.artist });
  const alb = el.closest(".sb[data-album]");
  if (alb && alb.textContent) return go({ name: "album", key: alb.dataset.album });
  const row = el.closest(".srow");
  if (row) return playList(currentListPaths(), +row.dataset.i);
  const card = el.closest(".card, .top-item");
  if (!card) return;
  const quick = !!el.closest("[data-cplay]");
  if (card.dataset.auto) {
    const a = autoPlaylists().find((x) => x.key === card.dataset.auto);
    if (quick) { if (a) playList(a.tracks.map((t) => t.file), 0); return; }
    return go({ name: "auto", key: card.dataset.auto });
  }
  if (card.dataset.playlist) {
    const pl = S.playlists.find((x) => x.id === card.dataset.playlist);
    if (quick) { if (pl) playList(pl.tracks.filter(T)); return; }
    return go({ name: "playlist", id: card.dataset.playlist });
  }
  if (card.dataset.sugg) {
    const g = suggestPlaylists().find((x) => x.key === card.dataset.sugg);
    if (g) playList(g.tracks.map((t) => t.file), 0);
    return;
  }
  if (card.dataset.track) {
    const p = card.dataset.track;
    const list = card.closest(".row-scroll, .top-list");
    const paths = list ? $$("[data-track]", list).map((c) => c.dataset.track) : [p];
    return playList(paths, paths.indexOf(p));
  }
  if (card.dataset.album) {
    if (quick) { const a = albums().find((x) => x.key === card.dataset.album); return a && playList(a.tracks.map((t) => t.file)); }
    return go({ name: "album", key: card.dataset.album });
  }
  if (card.dataset.artist) {
    if (quick) { const a = artists().find((x) => x.key === card.dataset.artist); return a && playList(a.tracks.map((t) => t.file)); }
    return go({ name: "artist", key: card.dataset.artist });
  }
});
content.addEventListener("contextmenu", (e) => {
  const plCard = e.target.closest("[data-playlist]");
  if (plCard) {
    e.preventDefault();
    playlistMenu(plCard.dataset.playlist, e.clientX, e.clientY);
    return;
  }
  const row = e.target.closest(".srow, [data-track]");
  if (!row) return;
  e.preventDefault();
  trackMenu(row.dataset.p || row.dataset.track, e.clientX, e.clientY, row.hasAttribute("data-removable"));
});

let dragPath = null;
let dragFromPlaylist = null;
let dragPlaylistId = null;
content.addEventListener("dragstart", (e) => {
  const row = e.target.closest(".srow");
  const card = e.target.closest("[data-track]");
  dragPlaylistId = null;
  dragFromPlaylist = null;
  if (row) {
    dragPath = row.dataset.p;
    if (view.name === "playlist") dragFromPlaylist = { id: view.id, index: +row.dataset.i };
    row.classList.add("dragging");
  } else if (card) {
    dragPath = card.dataset.track;
    card.classList.add("dragging");
  } else return;
  e.dataTransfer.effectAllowed = "copyMove";
  e.dataTransfer.setData("text/plain", dragPath);
});
content.addEventListener("dragover", (e) => {
  if (!dragFromPlaylist) return;
  const row = e.target.closest(".srow");
  if (!row) return;
  e.preventDefault();
  $$(".srow.over", content).forEach((x) => x.classList.remove("over"));
  row.classList.add("over");
});
content.addEventListener("dragleave", (e) => {
  if (!content.contains(e.relatedTarget)) $$(".srow.over", content).forEach((x) => x.classList.remove("over"));
});
content.addEventListener("drop", (e) => {
  if (!dragFromPlaylist) return;
  const row = e.target.closest(".srow");
  const songs = e.target.closest(".songs");
  $$(".srow.over", content).forEach((x) => x.classList.remove("over"));
  if (!row && !songs) return;
  e.preventDefault();
  if (view.name === "playlist" && view.id === dragFromPlaylist.id) {
    const pl = S.playlists.find((p) => p.id === view.id);
    const to = row ? +row.dataset.i : (pl ? pl.tracks.length - 1 : 0);
    reorderPlaylist(view.id, dragFromPlaylist.index, to);
  }
  dragPath = null;
  dragFromPlaylist = null;
});
content.addEventListener("dragend", () => {
  dragPath = null;
  dragFromPlaylist = null;
  dragPlaylistId = null;
  $$(".srow.dragging, .srow.over, .card.dragging", content).forEach((x) => x.classList.remove("dragging", "over"));
});

const playlistNav = $("#playlistNav");
playlistNav.addEventListener("dragstart", (e) => {
  const a = e.target.closest("[data-id]");
  if (!a) return;
  dragPlaylistId = a.dataset.id;
  dragPath = null;
  dragFromPlaylist = null;
  e.dataTransfer.effectAllowed = "move";
});
playlistNav.addEventListener("dragover", (e) => {
  const a = e.target.closest("[data-id]");
  if (!a || (!dragPath && !dragPlaylistId)) return;
  e.preventDefault();
  $$(".nav.over", playlistNav).forEach((x) => x.classList.remove("over"));
  a.classList.add("over");
});
playlistNav.addEventListener("dragleave", (e) => {
  if (!playlistNav.contains(e.relatedTarget)) $$(".nav.over", playlistNav).forEach((x) => x.classList.remove("over"));
});
playlistNav.addEventListener("drop", (e) => {
  const a = e.target.closest("[data-id]");
  $$(".nav.over", playlistNav).forEach((x) => x.classList.remove("over"));
  if (!a) return;
  e.preventDefault();
  const id = a.dataset.id;
  if (dragPath) {
    if (!dragFromPlaylist || dragFromPlaylist.id !== id) {
      const n = addPathsToPlaylist(id, [dragPath]);
      const pl = S.playlists.find((p) => p.id === id);
      toast(n ? `Đã thêm vào “${pl.name}”` : "Bài này đã có trong playlist");
    }
  } else if (dragPlaylistId && dragPlaylistId !== id) {
    reorderPlaylists(dragPlaylistId, id);
  }
  dragPath = null;
  dragFromPlaylist = null;
  dragPlaylistId = null;
});
playlistNav.addEventListener("dragend", () => {
  dragPath = null;
  dragFromPlaylist = null;
  dragPlaylistId = null;
  $$(".nav.over", playlistNav).forEach((x) => x.classList.remove("over"));
});
