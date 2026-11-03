"use strict";

// =====================================================================================
// Cửa sổ: nút điều khiển, đổi kích thước, trình phát mini, toàn màn hình Đang phát
// =====================================================================================
$$(".winctl button").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.win === "min") py("minimize");
  if (b.dataset.win === "max") py("toggle_maximize");
  if (b.dataset.win === "close") { saveSession(true); save(true); py("close"); }
}));
window.setWinState = (maxed) => {
  document.body.classList.toggle("maxed", maxed);
  const b = $('.winctl [data-win="max"]');
  b.innerHTML = maxed ? "&#xE923;" : "&#xE922;";
  b.title = maxed ? "Thu nhỏ lại" : "Phóng to";
};
// Nhấp đúp vào thanh tiêu đề để phóng to / thu nhỏ
$$(".toolbar, .side-top, .rp-head, .np-top").forEach((el) => el.addEventListener("dblclick", (e) => {
  if (!e.target.closest("button, input, canvas, .lcd")) py("toggle_maximize");
}));

// Kéo mép cửa sổ: Python theo dõi chuột đến khi nhả nút
$$(".grip").forEach((g) => g.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  py("begin_resize", g.dataset.edge);
}));

function openNowPlaying() {
  if (!curPath()) return toast("Chọn một bài để phát trước đã");
  document.body.classList.add("np-open");
  setNpTab(npTab);
  setTimeout(() => $$(".np .lg").forEach(applyLiquid), 50);
}
function closeNowPlaying() { document.body.classList.remove("np-open"); lyrIdx = -2; redraw(); }
$("#lcdArt").addEventListener("click", openNowPlaying);
$("#npBtn").addEventListener("click", openNowPlaying);
$("#npClose").addEventListener("click", closeNowPlaying);
$("#npSound").addEventListener("click", () => toggleSound());
$("#npMute").addEventListener("click", () => toggleMute());
$("#npMore").addEventListener("click", (e) => { if (curPath()) trackMenu(curPath(), e.clientX, e.clientY); });
$("#npSub").addEventListener("click", () => {
  const t = T(curPath());
  if (t) { closeNowPlaying(); go({ name: "artist", key: plain(artistOf(t)) }); }
});
