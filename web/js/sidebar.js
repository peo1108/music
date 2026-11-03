"use strict";

// =====================================================================================
// Thanh bên
// =====================================================================================
function renderSidebar() {
  const folders = openedFolder ? [openedFolder] : [];
  $("#folderNav").innerHTML = `<a class="nav" data-view="library-folder" title="${esc(libraryInfo.dir)}">${icon("folder")}<span class="nav-name">${esc(libraryInfo.name)} (thư viện)</span></a>` +
    folders.map((f) => `<a class="nav" data-view="folder" title="${esc(f.dir)}">${icon("folder")}<span class="nav-name">${esc(f.name)}</span></a>`).join("");
  $("#playlistNav").innerHTML = S.playlists.map((p) =>
    `<a class="nav" data-view="playlist" data-id="${p.id}" draggable="true" title="${esc(p.name)}">${miniCover(p)}<span class="nav-name">${esc(p.name)}</span><span class="nav-count">${p.tracks.length}</span></a>`).join("") ||
    `<div class="nav" style="color:var(--text3);cursor:default">Chưa có danh sách nào</div>`;
  markNav();
}
function markNav() {
  $$(".sidebar .nav").forEach((a) => {
    const v = a.dataset.view;
    const on = v && (v === view.name && (v !== "playlist" || a.dataset.id === view.id)) || (v === "albums" && view.name === "album") || (v === "artists" && view.name === "artist") || (v === "playlists" && view.name === "auto");
    a.classList.toggle("on", !!on);
  });
}
$(".sidebar").addEventListener("click", (e) => {
  const a = e.target.closest(".nav[data-view]");
  if (!a) return;
  $("#search").value = "";
  if (a.dataset.view === "library-folder") return go({ name: "songs" });
  go({ name: a.dataset.view, id: a.dataset.id });
});
$("#playlistNav").addEventListener("contextmenu", (e) => {
  const a = e.target.closest("[data-id]");
  if (!a) return;
  e.preventDefault();
  playlistMenu(a.dataset.id, e.clientX, e.clientY);
});
let searchTimer = 0;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => (q ? go({ name: "search", q }) : go({ name: "home" })), 180);
});
$("#openFolder").addEventListener("click", pickFolder);
$("#newPlaylist").addEventListener("click", () => newPlaylist());

async function pickFolder() {
  const dir = await py("pick_folder");
  if (!dir) return;
  openedFolder = await fetchFolder(dir);
  renderSidebar();
  go({ name: "folder" });
}
// Mở 1 file từ ngoài (nhấp đúp trong Explorer): hiện thư mục của nó và phát file đó
async function openFileNow(path) {
  // Giữ dấu \ cuối: file ở gốc ổ đĩa (C:\bai.mp3) phải ra "C:\", không phải "C:" (= thư mục hiện hành của ổ C)
  const dir = path.slice(0, Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);
  const d = await fetchFolder(dir);
  const inLibrary = d.isLibrary;
  if (!inLibrary) openedFolder = d;
  renderSidebar();
  go(inLibrary ? { name: "songs" } : { name: "folder" });
  const paths = d.tracks.map((t) => t.file);
  const i = paths.findIndex((p) => p.toLowerCase() === path.toLowerCase());
  if (i >= 0) playList(paths, i);
  else {
    // Không thấy trong danh sách thư mục (vd. đuôi lạ): vẫn phát đúng file được mở, không phát nhầm bài đầu
    await ensureKnown([path]);
    if (T(path)) playList([path]);
    else toast("Không mở được file này");
  }
}
// File được gửi tới trước khi trang khởi động xong thì để dành, khởi động xong mới mở
let booted = false, pendingOpen = null;
window.openFile = (p) => (booted ? openFileNow(p) : (pendingOpen = p));
