"use strict";

// =====================================================================================
// Menu chuột phải, hộp thoại, thông báo
// =====================================================================================
const menu = $("#menu");
function showMenu(x, y, items) {
  menu.innerHTML = items.map((it, i) => it === "-" ? '<div class="sep"></div>' : it.title ? `<div class="sub-title">${esc(it.title)}</div>`
    : `<button class="mi" data-mi="${i}">${it.ic ? icon(it.ic) : '<span style="width:16px"></span>'}${esc(it.label)}</button>`).join("");
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
  menu.onclick = (e) => {
    const b = e.target.closest("[data-mi]");
    if (!b) return;
    menu.hidden = true;
    items[+b.dataset.mi].run();
  };
}
addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; }, true);
addEventListener("contextmenu", (e) => { if (!e.defaultPrevented && !e.target.closest("input, textarea")) e.preventDefault(); });

function trackMenu(p, x, y, removable) {
  const t = T(p);
  if (!t) return;
  const items = [
    { ic: "play", label: "Phát", run: () => playList([p]) },
    { ic: "nextUp", label: "Phát tiếp theo", run: () => { if (!curPath()) return playList([p]); Q.splice(qi + 1, 0, p); if (radioStart > qi) radioStart++; renderQueue(); toast("Sẽ phát tiếp theo"); } },
    { ic: "addQ", label: "Thêm vào hàng đợi", run: () => { if (!curPath()) return playList([p]); Q.push(p); renderQueue(); toast("Đã thêm vào hàng đợi"); } },
    "-",
    { ic: isFav(p) ? "heartFill" : "heart", label: isFav(p) ? "Bỏ yêu thích" : "Yêu thích", run: () => toggleFav(p) },
    { title: "Thêm vào danh sách phát" },
    ...S.playlists.map((pl) => ({ ic: "list", label: pl.name, run: () => addToPlaylist(pl.id, p) })),
    { ic: "plus", label: "Danh sách mới…", run: () => newPlaylist(p) },
  ];
  if (removable && view.name === "playlist") {
    const plId = view.id;
    items.push("-", { ic: "trash", label: "Xoá khỏi danh sách này", run: () => {
      const pl = S.playlists.find((x) => x.id === plId);
      if (!pl) return;
      const idx = pl.tracks.indexOf(p);
      if (idx < 0) return;
      pl.tracks.splice(idx, 1);
      save();
      renderView(false);
      showUndo(`Đã xoá “${t.title}” khỏi playlist`, () => {
        const cur = S.playlists.find((x) => x.id === plId);
        if (!cur) return;
        cur.tracks.splice(Math.min(idx, cur.tracks.length), 0, p);
        save();
        if (view.name === "playlist" && view.id === plId) renderView(false);
        toast("Đã hoàn tác");
      });
    } });
  }
  if (isOnline(p)) {
    items.push("-", { ic: "download", label: "Lưu vào thư viện", run: () => saveOffline(p) });
  } else {
    items.push("-", { ic: "album", label: "Đi tới album", run: () => { closeNowPlaying(); go({ name: "album", key: plain(t.album || t.title) + "|" + plain(artistOf(t)) }); } },
      { ic: "mic", label: "Đi tới ca sĩ", run: () => { closeNowPlaying(); go({ name: "artist", key: plain(artistOf(t)) }); } },
      { ic: "folder", label: "Mở vị trí file", run: () => py("reveal", p) });
  }
  if (djInfo && djInfo.claude) {
    items.push("-", { ic: "dj", label: "Nhờ DJ mở nhạc giống bài này", run: () => djSend(`Mở nhạc giống bài "${t.title}" của ${artistOf(t)}`) });
  }
  if (t.artist) {
    items.push({ ic: "x", label: `Chặn ${artistOf(t)}`, run: async () => {
      djBlocked = (await py("blocklist_add", artistOf(t))) || djBlocked;
      toast(`Sẽ không bao giờ phát ${artistOf(t)} nữa`, 2500);
    } });
  }
  showMenu(x, y, items.map((it) => (it.ic === "album" ? { ...it, ic: "disc" } : it)));
}

function ask(title, value = "") {
  return new Promise((resolve) => {
    const wrap = $("#modal"), input = $("#modalInput");
    $("#modalTitle").textContent = title;
    input.value = value;
    wrap.hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 30);
    const done = (v) => { wrap.hidden = true; wrap.onclick = input.onkeydown = null; resolve(v && v.trim() ? v.trim() : null); };
    wrap.onclick = (e) => {
      const b = e.target.closest("[data-modal]");
      if (b) done(b.dataset.modal === "ok" ? input.value : null);
      else if (e.target === wrap) done(null);
    };
    input.onkeydown = (e) => { if (e.key === "Enter") done(input.value); if (e.key === "Escape") done(null); };
  });
}
let toastTimer = 0;
function toast(msg, ms = 1600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function hideToast() {
  clearTimeout(toastTimer);
  $("#toast").classList.remove("show");
}
let undoAction = null;
let undoHideTimer = 0;
function showUndo(msg, action) {
  $("#undoText").textContent = msg;
  undoAction = action;
  $("#undo").classList.add("show");
  clearTimeout(undoHideTimer);
  undoHideTimer = setTimeout(hideUndo, 8000);
}
function hideUndo() {
  clearTimeout(undoHideTimer);
  $("#undo").classList.remove("show");
  undoAction = null;
}
$("#undoBtn").addEventListener("click", () => {
  const fn = undoAction;
  hideUndo();
  if (fn) fn();
});
