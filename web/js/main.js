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
  applyGlassAll();
  requestAnimationFrame(frame);
  initApp();

  booted = true;
  const opened = pendingOpen || new URLSearchParams(location.search).get("open");
  if (opened) { await openFileNow(opened); return; }
  go({ name: "home" });
  // Khôi phục bài đang nghe dở
  const ss = S.session;
  if (ss && ss.q && ss.q.length) {
    Q = ss.q.filter(T);
    qi = Math.max(0, Q.indexOf(ss.q[ss.i]));
    if (Q.length) startTrack({ autoplay: false, at: ss.pos || 0 });
  }
})();
