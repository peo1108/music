"use strict";

// =====================================================================================
// Khởi động
// =====================================================================================
(async () => {
  pyReady.then(() => py("ready", devicePixelRatio));
  $$("i[data-ic]").forEach((i) => { i.outerHTML = icon(i.dataset.ic); });
  setIcon($("#lcdArt"), "note");
  setIcon($("#npArt"), "note");
  await loadState();
  await loadLibrary();
  await ensureKnown([...S.favorites, ...S.playlists.flatMap((p) => p.tracks), ...Object.keys(S.plays), ...((S.session && S.session.q) || [])]);
  buildSound();
  applyVolume();
  syncModes();
  syncPlayState();
  renderSidebar();
  openPanel("queue");
  document.body.classList.remove("rp-open");
  $("#queueBtn").classList.remove("on");
  applyLook();
  requestAnimationFrame(frame);
  initApp();
  pollDownloads(); // hàng tải còn dở từ lần trước
  loadRecap(30); // thói quen 30 ngày cho gợi ý trang chủ

  booted = true;
  const opened = pendingOpen || new URLSearchParams(location.search).get("open");
  if (opened) { await openFileNow(opened); return; }
  // ?view=settings / ?view=link&url=... mở thẳng 1 trang (dùng khi phát triển, chụp màn hình)
  const qs = new URLSearchParams(location.search);
  go(qs.get("view") ? { name: qs.get("view"), url: qs.get("url") || "" } : startView());
  // Khôi phục bài đang nghe dở
  const ss = S.session;
  if (ss && ss.q && ss.q.length) {
    Q = ss.q.filter(T);
    qi = Math.max(0, Q.indexOf(ss.q[ss.i]));
    if (Q.length) startTrack({ autoplay: false, at: ss.pos || 0 });
  }
})();
