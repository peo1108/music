"use strict";

// =====================================================================================
// Nút điều khiển & phím tắt
// =====================================================================================
function toggleShuffle() {
  S.settings.shuffle = !S.settings.shuffle;
  if (Q.length) {
    if (S.settings.shuffle) shuffleQueue();
    else if (origQ) { const p = Q[qi]; Q = origQ; qi = Math.max(0, Q.indexOf(p)); origQ = null; }
  }
  save();
  syncModes();
  renderQueue();
  toast(S.settings.shuffle ? "Phát ngẫu nhiên: bật" : "Phát ngẫu nhiên: tắt");
}
function cycleRepeat() {
  S.settings.repeat = { off: "all", all: "one", one: "off" }[S.settings.repeat] || "all";
  save();
  syncModes();
  toast({ off: "Không lặp", all: "Lặp cả danh sách", one: "Lặp 1 bài" }[S.settings.repeat]);
}
function syncModes() {
  $$("#shuffleBtn, [data-act=shuffle]").forEach((b) => b.classList.toggle("on", S.settings.shuffle));
  $$("#repeatBtn, [data-act=repeat]").forEach((b) => {
    b.classList.toggle("on", S.settings.repeat !== "off");
    b.classList.toggle("one-on", S.settings.repeat === "one");
  });
}
function toggleMute() { S.settings.muted = !S.settings.muted; applyVolume(); save(); }

$("#playBtn").addEventListener("click", toggle);
$("#nextBtn").addEventListener("click", () => next());
$("#prevBtn").addEventListener("click", prev);
$("#shuffleBtn").addEventListener("click", toggleShuffle);
$("#repeatBtn").addEventListener("click", cycleRepeat);
$("#muteBtn").addEventListener("click", toggleMute);
$$(".vol-input").forEach((inp) => inp.addEventListener("input", (e) => setVolume(e.target.value / 100)));
$("#lyricsBtn").addEventListener("click", () => openPanel("lyrics"));
$("#djBtn").addEventListener("click", () => openPanel("dj"));
$("#queueBtn").addEventListener("click", () => openPanel("queue"));
$("#soundBtn").addEventListener("click", () => toggleSound());
$("#lcdFav").addEventListener("click", () => toggleFav(curPath()));
$("#npFav").addEventListener("click", () => toggleFav(curPath()));
$$("[data-act]").forEach((b) => b.addEventListener("click", () => {
  ({ play: toggle, next: () => next(), prev, shuffle: toggleShuffle, repeat: cycleRepeat })[b.dataset.act]();
}));
// Lăn chuột trên thanh âm lượng để chỉnh
$$(".vol").forEach((v) => v.addEventListener("wheel", (e) => { e.preventDefault(); setVolume(S.settings.volume - Math.sign(e.deltaY) * 0.05); }, { passive: false }));

addEventListener("keydown", (e) => {
  if (!$("#modal").hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); closeNowPlaying(); $("#search").focus(); $("#search").select(); return; }
  // Đang gõ chữ (ô tìm kiếm, khung chat DJ, ô nhập trong Cài đặt): không dùng phím tắt
  if ((e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") || e.target.tagName === "TEXTAREA") {
    if (e.key === "Escape") {
      if (e.target.id === "search") { e.target.value = ""; go({ name: "home" }); }
      e.target.blur();
    }
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  const act = {
    " ": toggle,
    arrowright: () => seek(cur().el.currentTime + (e.shiftKey ? 30 : 5)),
    arrowleft: () => seek(cur().el.currentTime - (e.shiftKey ? 30 : 5)),
    arrowup: () => { setVolume(S.settings.volume + 0.05); toast(`Âm lượng ${Math.round(S.settings.volume * 100)}%`); },
    arrowdown: () => { setVolume(S.settings.volume - 0.05); toast(`Âm lượng ${Math.round(S.settings.volume * 100)}%`); },
    n: () => next(), p: prev, s: toggleShuffle, r: cycleRepeat, m: toggleMute, e: () => toggleSound(),
    l: () => (document.body.classList.contains("np-open") ? setNpTab("lyrics") : openPanel("lyrics")),
    q: () => (document.body.classList.contains("np-open") ? setNpTab("queue") : openPanel("queue")),
    d: () => { closeNowPlaying(); openPanel("dj"); },
    f: () => (document.body.classList.contains("np-open") ? closeNowPlaying() : openNowPlaying()),
    escape: () => { if (!menu.hidden) menu.hidden = true; else if (!$("#sound").hidden) toggleSound(false); else closeNowPlaying(); },
  }[k];
  if (act) { e.preventDefault(); act(); }
});

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => play());
  ms.setActionHandler("pause", () => pause());
  ms.setActionHandler("nexttrack", () => next());
  ms.setActionHandler("previoustrack", prev);
  ms.setActionHandler("seekto", (d) => seek(d.seekTime));
}

// Quay lại cửa sổ thì quét lại thư viện (vd. vừa tải bài mới)
let lastRescan = Date.now();
addEventListener("focus", async () => {
  if (Date.now() - lastRescan < 5000) return;
  lastRescan = Date.now();
  const before = library.length + ":" + library.map((t) => t.file + t.title + t.artist).join();
  await loadLibrary();
  const after = library.length + ":" + library.map((t) => t.file + t.title + t.artist).join();
  if (before !== after && ["home", "songs", "albums", "artists", "album", "artist", "search"].includes(view.name)) renderView(false);
});
