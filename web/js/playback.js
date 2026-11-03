"use strict";

// =====================================================================================
// Hàng đợi & điều khiển phát
// =====================================================================================
let Q = [], qi = -1, origQ = null;
const curPath = () => Q[qi];

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Ngẫu nhiên kiểu "trộn bài": giữ bài đang phát, trộn phần còn lại
function shuffleQueue() {
  origQ = Q.slice();
  const now = Q[qi];
  Q = [now, ...shuffleArr(Q.filter((_, i) => i !== qi))];
  qi = 0;
}
function playList(paths, i = 0, { shuffle = false } = {}) {
  if (!paths.length) return;
  Q = paths.slice();
  qi = clamp(i, 0, Q.length - 1);
  origQ = null;
  if (shuffle) {
    S.settings.shuffle = true;
    qi = Math.floor(Math.random() * Q.length);
  }
  if (S.settings.shuffle) shuffleQueue();
  syncModes();
  startTrack();
}

async function startTrack({ fade = 0.5, at = 0, autoplay = true } = {}) {
  const path = curPath();
  if (!path) return;
  const seq = ++loadSeq;
  if (autoplay) intendPlay = true;
  if (isOnline(path) && autoplay) {
    toast(onlineWaitText(path), 20000);
    const ok = await prepareOnline(path);
    if (seq !== loadSeq || curPath() !== path) return;
    if (!ok) {
      pause(0.2);
      toast("Không tải được bài này");
      return;
    }
    hideToast();
  }
  if (seq !== loadSeq) return;
  trackChanged();
  const old = cur();
  A = 1 - A;
  const d = cur();
  d.path = path; d.seekTo = at; d.counted = false;
  if (autoplay || !isOnline(path)) {
    d.el.src = mediaUrl(path);
  } else {
    d.el.pause();
    d.el.removeAttribute("src");
    d.el.load();
  }
  if (d.gain) { d.gain.gain.cancelScheduledValues(0); d.gain.gain.value = 0; }
  if (old.path && !old.el.paused) {
    ramp(old, 0, fade);
    setTimeout(() => { if (old !== cur()) old.el.pause(); }, fade * 1000 + 80);
  } else old.el.pause();

  if (autoplay && intendPlay) {
    S.plays[path] = { n: (S.plays[path] && S.plays[path].n) || 0, last: Date.now() };
    saveSession();
    await play(fade);
    prefetchNext();
  } else syncPlayState();
}

async function play(fade = 0.35) {
  if (!curPath()) {
    const list = currentListPaths();
    if (list.length) playList(list, 0);
    return;
  }
  const d = cur();
  if (isOnline(d.path) && !d.el.getAttribute("src")) {
    intendPlay = true;
    toast(onlineWaitText(d.path), 20000);
    const ok = await prepareOnline(d.path);
    if (!ok) { intendPlay = false; syncPlayState(); toast("Không tải được bài này"); return; }
    if (d !== cur() || d.path !== curPath()) return;
    hideToast();
    d.el.src = mediaUrl(d.path);
    loadPeaks(d.path);
    if (!intendPlay) { syncPlayState(); return; }
  }
  ensureGraph();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  intendPlay = true;
  try { await d.el.play(); } catch {}
  ramp(d, 1, fade);
  syncPlayState();
}
function pause(fade = 0.28) {
  intendPlay = false;
  const d = cur();
  if (!ctx) { d.el.pause(); syncPlayState(); return; }
  ramp(d, 0, fade);
  setTimeout(() => { if (!intendPlay && d === cur()) d.el.pause(); }, fade * 1000 + 30);
  syncPlayState();
}
const toggle = () => (intendPlay ? pause() : play());

function nextIndex(auto) {
  if (!Q.length) return null;
  if (qi + 1 < Q.length) return qi + 1;
  if (S.settings.repeat === "all" || !auto) {
    if (S.settings.shuffle) { const now = Q[qi]; Q = shuffleArr(Q.slice()); if (Q[0] === now && Q.length > 1) Q.push(Q.shift()); qi = -1; }
    return 0;
  }
  return null;
}
function next(auto = false) {
  const n = nextIndex(auto);
  if (n === null) { pause(); cur().el.currentTime = 0; return; }
  qi = n;
  startTrack({ fade: auto ? 0.05 : 0.5 });
  renderQueue();
}
function prev() {
  const d = cur();
  if (d.el.currentTime > 3 || !Q.length) { seek(0); return; }
  qi = qi > 0 ? qi - 1 : S.settings.repeat === "all" ? Q.length - 1 : 0;
  startTrack();
  renderQueue();
}
function onEnded() {
  if (xfading) return;
  if (S.settings.repeat === "one") { seek(0); play(0.05); } else next(true);
}
function seek(t) {
  const el = cur().el;
  if (isFinite(el.duration)) el.currentTime = clamp(t, 0, el.duration - 0.2);
}
const duration = () => {
  const el = cur().el;
  return isFinite(el.duration) ? el.duration : (T(curPath()) || {}).duration || 0;
};

// Chuyển bài mượt: còn X giây là bắt đầu bài tiếp (bài cũ nhỏ dần, bài mới to dần)
let xfading = false;
function audioTick() {
  const d = cur(), el = d.el, xf = S.settings.crossfade;
  if (intendPlay && !xfading && xf > 0 && S.settings.repeat !== "one" && isFinite(el.duration) && el.duration > xf * 3) {
    if (el.duration - el.currentTime <= xf) {
      const n = nextIndex(true);
      if (n !== null) {
        xfading = true;
        qi = n;
        startTrack({ fade: xf }).finally(() => { xfading = false; });
        renderQueue();
      }
    }
  }
  // Tính 1 lượt nghe khi nghe quá 30 giây (hoặc nửa bài với bài ngắn)
  if (d.path && !d.counted && el.currentTime > Math.min(30, (el.duration || 60) * 0.5)) {
    d.counted = true;
    const p = S.plays[d.path] || (S.plays[d.path] = { n: 0, last: Date.now() });
    p.n++;
    save();
  }
}
setInterval(audioTick, 250);

let lastSessionSave = 0;
function saveSession(force = false) {
  if (!force && Date.now() - lastSessionSave < 4000) return;
  lastSessionSave = Date.now();
  if (Q.length) S.session = { q: Q, i: qi, pos: cur().el.currentTime || 0 };
  save();
}
setInterval(() => { if (intendPlay) saveSession(); }, 5000);
addEventListener("pagehide", () => {
  if (!stateLoaded) return;
  if (Q.length) S.session = { q: Q, i: qi, pos: cur().el.currentTime || 0 };
  navigator.sendBeacon("/api/state", JSON.stringify(S));
});
