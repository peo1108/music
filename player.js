"use strict";

// =====================================================================================
// Tiện ích
// =====================================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const enc = encodeURIComponent;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const fmtLong = (s) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`;
};
const coverUrl = (p) => "/cover?p=" + enc(p);
const isOnline = (p) => typeof p === "string" && (p.startsWith("yt:") || p.startsWith("sc:"));
const mediaUrl = (p) => (isOnline(p) ? "/stream?p=" : "/audio?p=") + enc(p);
const onlineWaitText = (p) => (String(p || "").startsWith("yt:") ? "Đang kết nối YouTube…" : "Đang tải từ SoundCloud…");
const pyReady = new Promise((res) => {
  if (window.pywebview && window.pywebview.api) return res();
  addEventListener("pywebviewready", res, { once: true });
});
// Gọi hàm Python của cửa sổ (không có khi mở bằng trình duyệt thường)
const py = (name, ...args) => {
  const api = window.pywebview && window.pywebview.api;
  return api && api[name] ? api[name](...args) : Promise.resolve(null);
};

// ---------- Biểu tượng ----------
const IC = {
  play: { fill: 1, d: '<path d="M7 4.8v14.4a1.2 1.2 0 0 0 1.8 1l11.5-7.2a1.2 1.2 0 0 0 0-2L8.8 3.8A1.2 1.2 0 0 0 7 4.8z"/>' },
  pause: { fill: 1, d: '<rect x="5.5" y="4" width="4.5" height="16" rx="1.4"/><rect x="14" y="4" width="4.5" height="16" rx="1.4"/>' },
  next: { fill: 1, d: '<path d="M3.5 6.2v11.6a1 1 0 0 0 1.55.83L13 13.2V17.8a1 1 0 0 0 1.55.83l7.9-5.8a1 1 0 0 0 0-1.66l-7.9-5.8A1 1 0 0 0 13 6.2v4.6L5.05 5.37A1 1 0 0 0 3.5 6.2z"/>' },
  prev: { fill: 1, d: '<path d="M20.5 6.2v11.6a1 1 0 0 1-1.55.83L11 13.2V17.8a1 1 0 0 1-1.55.83l-7.9-5.8a1 1 0 0 1 0-1.66l7.9-5.8A1 1 0 0 1 11 6.2v4.6l7.95-5.43a1 1 0 0 1 1.55.83z"/>' },
  shuffle: { d: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>' },
  repeat: { d: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>' },
  vol: { d: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>' },
  mute: { d: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>' },
  lyrics: { d: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>' },
  queue: { d: '<path d="M21 15V6"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M12 12H3M16 6H3M12 18H3"/>' },
  sliders: { d: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>' },
  more: { fill: 1, d: '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>' },
  expand: { d: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>' },
  heart: { d: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>' },
  heartFill: { fill: 1, d: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>' },
  home: { d: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  note: { d: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
  disc: { d: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5"/>' },
  mic: { d: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>' },
  clock: { d: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  folder: { d: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
  folderPlus: { d: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>' },
  list: { d: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>' },
  plus: { d: '<path d="M12 5v14M5 12h14"/>' },
  search: { d: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>' },
  down: { d: '<path d="m6 9 6 6 6-6"/>' },
  left: { d: '<path d="m15 18-6-6 6-6"/>' },
  x: { d: '<path d="M18 6 6 18M6 6l12 12"/>' },
  trash: { d: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>' },
  pencil: { d: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>' },
  nextUp: { d: '<path d="M3 6h12M3 12h8M3 18h8"/><path d="m15 15 3 3 3-3M18 9v9"/>' },
  addQ: { d: '<path d="M3 6h14M3 12h10M3 18h8M18 13v8M14 17h8"/>' },
  globe: { d: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>' },
  download: { d: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>' },
  spark: { d: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5.2 5.2l3.5 3.5M15.3 15.3l3.5 3.5M18.8 5.2l-3.5 3.5M8.7 15.3l-3.5 3.5"/>' },
};
const icon = (name, cls = "") => {
  const i = IC[name];
  return `<svg class="ic ${i.fill ? "fill" : ""} ${cls}" viewBox="0 0 24 24">${i.d}</svg>`;
};
const setIcon = (el, name) => { el.innerHTML = icon(name); };

// =====================================================================================
// Dữ liệu lưu lại (yêu thích, danh sách phát, lượt nghe, cài đặt, phiên nghe)
// =====================================================================================
const DEFAULT_SETTINGS = { volume: 0.8, muted: false, eq: [0, 0, 0, 0, 0], shuffle: false, repeat: "all", crossfade: 4, glass: true, preferOffline: false };
const S = { favorites: [], playlists: [], plays: {}, folders: [], settings: { ...DEFAULT_SETTINGS }, session: null };
let saveTimer = 0;
let stateLoaded = false; // chưa đọc xong dữ liệu cũ thì tuyệt đối không ghi, kẻo đè mất
function save(now = false) {
  if (!stateLoaded) return;
  clearTimeout(saveTimer);
  const send = () => fetch("/api/state", { method: "POST", body: JSON.stringify(S) }).catch(() => {});
  if (now) return send();
  saveTimer = setTimeout(send, 700);
}
async function loadState() {
  try {
    const s = await (await fetch("/api/state")).json();
    Object.assign(S, s);
    S.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    stateLoaded = true;
  } catch {}
}
const isFav = (p) => S.favorites.includes(p);
function toggleFav(p) {
  if (!p) return;
  const i = S.favorites.indexOf(p);
  if (i >= 0) S.favorites.splice(i, 1); else S.favorites.unshift(p);
  save();
  toast(i >= 0 ? "Đã bỏ khỏi Yêu thích" : "Đã thêm vào Yêu thích");
  syncFavButtons();
  $$(`.fav[data-p="${CSS.escape(p)}"]`).forEach((b) => { b.classList.toggle("on", i < 0); b.innerHTML = icon(i < 0 ? "heartFill" : "heart"); });
  if (view.name === "favorites") renderView(false);
}

// =====================================================================================
// Thư viện nhạc
// =====================================================================================
const known = new Map(); // đường dẫn -> thông tin bài
let library = [];
let openedFolder = null; // {dir, name, tracks}
const T = (p) => known.get(p);
const artistOf = (t) => t.artist || "Không rõ ca sĩ";

async function fetchFolder(dir) {
  const d = await (await fetch("/api/tracks?dir=" + enc(dir || ""))).json();
  d.tracks.forEach((t) => known.set(t.file, t));
  return d;
}
async function loadLibrary() {
  try {
    library = (await fetchFolder("")).tracks;
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
    const list = await (await fetch("/api/meta", { method: "POST", body: JSON.stringify(missing) })).json();
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

// =====================================================================================
// Âm thanh: 2 "đầu phát" để chuyển bài mượt, EQ, âm lượng, bộ phân tích phổ
// =====================================================================================
const BANDS = [
  { f: 60, type: "lowshelf", label: "60" },
  { f: 230, type: "peaking", label: "230" },
  { f: 910, type: "peaking", label: "910" },
  { f: 3600, type: "peaking", label: "3.6k" },
  { f: 14000, type: "highshelf", label: "14k" },
];
const PRESETS = {
  "Phẳng": [0, 0, 0, 0, 0], "Bass mạnh": [7, 4, 0, 0, 1], "Giọng hát": [-2, -1, 3, 4, 1],
  "Sáng": [0, 0, 0, 3, 6], "Ấm": [3, 2, 0, -2, -4], "Lofi": [4, 1, -1, -4, -8],
};
let ctx = null, master = null, analyser = null, eqNodes = [];
const decks = [0, 1].map(() => ({ el: new Audio(), src: null, gain: null, path: null, seekTo: 0, counted: false }));
let A = 0; // đầu phát đang dùng
const cur = () => decks[A];
let intendPlay = false;
let loadSeq = 0;

function ensureGraph() {
  if (ctx) return;
  ctx = new AudioContext();
  eqNodes = BANDS.map((b, i) => {
    const n = ctx.createBiquadFilter();
    n.type = b.type; n.frequency.value = b.f; n.Q.value = 1.1; n.gain.value = S.settings.eq[i] || 0;
    return n;
  });
  master = ctx.createGain();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  for (const d of decks) {
    d.el.volume = 1;
    d.src = ctx.createMediaElementSource(d.el);
    d.gain = ctx.createGain();
    d.gain.gain.value = d === cur() && !d.el.paused ? 1 : 0;
    d.src.connect(d.gain).connect(eqNodes[0]);
  }
  eqNodes.reduce((a, b) => (a.connect(b), b)).connect(master).connect(analyser).connect(ctx.destination);
  applyVolume();
}
function ramp(d, to, sec) {
  if (!d.gain) return;
  const g = d.gain.gain, now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(to, now + Math.max(0.01, sec));
}
// Trình duyệt chặn âm thanh đến khi có cú bấm đầu tiên -> bấm/gõ phím bất kỳ là chạy tiếp
["pointerdown", "keydown"].forEach((ev) => addEventListener(ev, () => { if (ctx && ctx.state === "suspended") ctx.resume(); }, true));

for (const d of decks) {
  d.el.preload = "auto";
  d.el.addEventListener("loadedmetadata", () => {
    if (d.seekTo) { d.el.currentTime = Math.min(d.seekTo, d.el.duration - 1); d.seekTo = 0; }
  });
  d.el.addEventListener("ended", () => { if (d === cur()) onEnded(); });
  d.el.addEventListener("error", () => { if (d === cur() && d.el.src) toast("Không phát được bài này"); });
  d.el.addEventListener("play", () => { if (d === cur()) syncPlayState(); });
  d.el.addEventListener("pause", () => { if (d === cur()) syncPlayState(); });
}

function applyVolume() {
  const v = S.settings.muted ? 0 : S.settings.volume;
  const out = v * v; // tai người nghe theo thang log
  if (master) master.gain.setTargetAtTime(out, ctx.currentTime, 0.03);
  else decks.forEach((d) => (d.el.volume = out));
  $$("#muteBtn, #npMute").forEach((b) => setIcon(b, v === 0 ? "mute" : "vol"));
  $$(".vol-input").forEach((vol) => {
    vol.value = Math.round(S.settings.volume * 100);
    setFill(vol);
  });
}
function setVolume(v) {
  S.settings.volume = clamp(v, 0, 1);
  S.settings.muted = false;
  applyVolume();
  save();
}

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

// =====================================================================================
// Hiển thị bài đang phát
// =====================================================================================
let bgFlip = false;
function artHtml(t, size) {
  return t && t.cover ? `<img src="${coverUrl(t.file)}" alt="" draggable="false" decoding="async">` : icon("note");
}
function trackChanged() {
  const t = T(curPath());
  if (!t) return;
  const sub = [artistOf(t), t.album].filter(Boolean).join(" — ");
  $("#lcdTitle").textContent = t.title;
  $("#lcdSub").textContent = sub;
  $("#npTitle").textContent = t.title;
  $("#npSub").textContent = sub;
  $("#lcdDur").textContent = $("#npDur").textContent = fmt(t.duration);

  // Ảnh bìa: hiện dần ảnh mới
  for (const sel of ["#lcdArt", "#npArt"]) {
    const box = $(sel);
    box.innerHTML = artHtml(t);
    const img = box.querySelector("img");
    if (img) img.animate([{ opacity: 0, transform: "scale(1.04)" }, { opacity: 1, transform: "none" }], { duration: 650, easing: "cubic-bezier(.2,.85,.25,1)" });
  }
  // Nền: chuyển mượt giữa 2 lớp
  const [a, b] = bgFlip ? ["#bg1", "#bg2"] : ["#bg2", "#bg1"];
  bgFlip = !bgFlip;
  $(a).style.backgroundImage = t.cover ? `url("${coverUrl(t.file)}")` : "none";
  $(a).classList.add("on");
  $(b).classList.remove("on");
  if (t.cover) {
    const img = new Image();
    img.onload = () => applyPalette(extractPalette(img));
    img.src = coverUrl(t.file);
  } else applyPalette(DEFAULT_PALETTE);

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: artistOf(t), album: t.album || "",
      artwork: t.cover ? [{ src: location.origin + coverUrl(t.file), sizes: "512x512" }] : [],
    });
  }
  syncFavButtons();
  markPlaying();
  loadLyrics(t.file);
  loadPeaks(t.file);
  renderQueue();
}

function syncPlayState() {
  const playing = intendPlay;
  $$("#playBtn, [data-act=play]").forEach((b) => setIcon(b, playing ? "pause" : "play"));
  document.body.classList.toggle("paused", !playing);
  const t = T(curPath());
  document.title = t ? `${t.title} — ${artistOf(t)}` : "Nhạc";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  markPlaying();
}
function syncFavButtons() {
  const on = isFav(curPath());
  for (const b of [$("#lcdFav"), $("#npFav")]) { b.classList.toggle("on", on); setIcon(b, on ? "heartFill" : "heart"); }
}
function markPlaying() {
  const p = curPath();
  $$(".srow").forEach((r) => {
    const on = r.dataset.p === p;
    r.classList.toggle("now", on);
    r.classList.toggle("playing", on && intendPlay);
    const n = r.querySelector(".n");
    if (n) n.innerHTML = on ? '<span class="eqbars"><i></i><i></i><i></i></span>' : r.dataset.n;
  });
}

// ---------- Màu chủ đạo lấy từ ảnh bìa ----------
const DEFAULT_PALETTE = [[255, 77, 109], [120, 90, 255], [40, 170, 255]];
let palette = DEFAULT_PALETTE;
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
function extractPalette(img) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 36;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, 36, 36);
    const data = g.getImageData(0, 0, 36, 36).data;
    // Gom màu theo 12 dải sắc độ, mỗi dải tính điểm theo độ rực
    const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
    let grey = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const w = s * (1 - Math.abs(l - 0.5) * 1.7);
      if (w < 0.08) { grey++; continue; }
      const b = bins[Math.floor(h * 12) % 12];
      b.w += w; b.h += h * w; b.s += s * w; b.l += l * w;
    }
    const top = bins.filter((b) => b.w > 0.6).sort((a, b) => b.w - a.w).slice(0, 3)
      .map((b) => hslToRgb(b.h / b.w, clamp(b.s / b.w, 0.45, 0.9), clamp(b.l / b.w, 0.45, 0.62)));
    if (!top.length) return [[190, 195, 210], [110, 115, 135], [70, 75, 95]];
    while (top.length < 3) top.push(hslToRgb((rgbToHsl(...top[0])[0] + 0.08 * top.length) % 1, 0.6, 0.5));
    return top;
  } catch { return DEFAULT_PALETTE; }
}
function applyPalette(p) {
  palette = p;
  const root = document.documentElement.style;
  const [h, s] = rgbToHsl(...p[0]);
  const accent = s < 0.15 ? [235, 238, 245] : hslToRgb(h, Math.max(s, 0.7), 0.64);
  root.setProperty("--accent-rgb", accent.join(", "));
  p.forEach((c, i) => root.setProperty(`--c${i + 1}`, c.join(", ")));
  $$(".slider").forEach(setFill);
}

// =====================================================================================
// Dạng sóng (thanh tua)
// =====================================================================================
const peaksCache = new Map();
let peaks = null;
async function loadPeaks(path) {
  peaks = peaksCache.get(path) || null;
  if (peaks) return;
  try {
    const r = await fetch("/api/peaks?p=" + enc(path));
    if (!r.ok) return;
    const data = await r.json();
    peaksCache.set(path, data);
    if (curPath() === path) {
      peaks = data;
      waveAnim = performance.now();
    }
  } catch {}
}
let waveAnim = 0;
const waves = [
  { c: $("#lcdWave"), bar: 2, gap: 1, min: 0.12 },
  { c: $("#npWave"), bar: 3, gap: 2, min: 0.08 },
];
function drawWave(w, progress, now) {
  const c = w.c;
  if (!c.offsetParent) return;
  const dpr = devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const n = Math.max(1, Math.floor((W + w.gap) / (w.bar + w.gap)));
  const grow = clamp((now - waveAnim) / 700, 0, 1); // sóng mọc lên khi vừa tải xong
  const hoverX = w.hover != null ? w.hover : -1;
  const playedX = progress * W;
  for (let i = 0; i < n; i++) {
    let v = 0.35;
    if (peaks) {
      const a = Math.floor((i / n) * peaks.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
      v = 0;
      for (let j = a; j < b; j++) v = Math.max(v, peaks[j]);
      v = 0.35 + (Math.pow(v, 0.8) - 0.35) * (1 - Math.pow(1 - grow, 3));
    }
    const h = Math.max(w.min * H, v * H);
    const x = i * (w.bar + w.gap);
    const played = x + w.bar / 2 <= playedX;
    const inHover = hoverX >= 0 && x <= hoverX;
    g.fillStyle = played ? "rgba(255,255,255,.95)" : inHover ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.26)";
    g.beginPath();
    g.roundRect(x, (H - h) / 2, w.bar, h, w.bar / 2);
    g.fill();
  }
}
for (const w of waves) {
  const c = w.c;
  let dragging = false;
  const ratio = (e) => clamp((e.clientX - c.getBoundingClientRect().left) / c.clientWidth, 0, 1);
  c.addEventListener("pointermove", (e) => { w.hover = ratio(e) * c.clientWidth; if (dragging) w.drag = ratio(e); });
  c.addEventListener("pointerleave", () => { if (!dragging) w.hover = null; });
  c.addEventListener("pointerdown", (e) => { dragging = true; w.drag = ratio(e); c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    seek(ratio(e) * duration());
    w.drag = null;
    w.hover = null;
  });
}

// =====================================================================================
// Lời bài hát (LRCLIB)
// =====================================================================================
let lyr = { path: null, lines: [], synced: false, status: "", source: "" };
let lyrIdx = -2;
function parseLRC(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of tags) out.push({ t: +m[1] * 60 + +m[2], text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}
async function loadLyrics(path) {
  lyr = { path, lines: [], synced: false, status: "loading", source: "" };
  renderLyrics();
  try {
    const d = await (await fetch("/api/lyrics?p=" + enc(path))).json();
    if (lyr.path !== path) return;
    if (d.synced) { lyr.lines = parseLRC(d.synced); lyr.synced = true; lyr.status = "ok"; }
    else if (d.plain) { lyr.lines = d.plain.split(/\r?\n/).map((text) => ({ t: null, text })); lyr.status = "ok"; }
    else lyr.status = d.error === "offline" ? "offline" : "none";
    lyr.source = d.source || "";
  } catch { if (lyr.path === path) lyr.status = "offline"; }
  if (lyr.path === path) renderLyrics();
}
function renderLyrics() {
  lyrIdx = -2;
  $("#lcdLyric").textContent = "";
  for (const box of [$("#rpLyrics"), $("#npLyrics")]) {
    box.classList.toggle("unsynced", lyr.status === "ok" && !lyr.synced);
    if (lyr.status !== "ok") {
      const msg = { loading: "Đang tìm lời bài hát…", none: "Không tìm thấy lời cho bài này.", offline: "Không kết nối được LRCLIB.<br>Cần có mạng để tải lời bài hát." }[lyr.status] || "";
      box.innerHTML = `<div class="pad"></div><div class="msg">${curPath() ? msg : "Chưa phát bài nào."}</div>`;
      continue;
    }
    box.innerHTML = '<div class="pad"></div>' + lyr.lines.map((l, i) =>
      `<div class="line ${l.text ? "" : "dots"}" data-i="${i}">${l.text ? esc(l.text) : "• • •"}</div>`).join("") +
      (lyr.source ? `<div class="src">Lời bài hát: LRCLIB</div>` : "") + '<div class="pad"></div>';
  }
}
for (const box of [$("#rpLyrics"), $("#npLyrics")]) {
  box.addEventListener("click", (e) => {
    const line = e.target.closest(".line");
    if (line && lyr.synced) { seek(lyr.lines[+line.dataset.i].t); if (!intendPlay) play(); }
  });
  box.addEventListener("wheel", () => { box.dataset.userScroll = Date.now(); }, { passive: true });
}
function updateLyrics(t) {
  if (!lyr.synced || !lyr.lines.length) return;
  let lo = 0, hi = lyr.lines.length - 1, idx = -1;
  const tt = t + 0.25;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lyr.lines[mid].t <= tt) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  if (idx === lyrIdx) return;
  lyrIdx = idx;
  // Câu đang hát cũng hiện trên thanh phát
  const lcdLine = $("#lcdLyric"), text = idx >= 0 ? lyr.lines[idx].text : "";
  if (lcdLine.textContent !== text) {
    lcdLine.textContent = text;
    lcdLine.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
  }
  for (const box of [$("#rpLyrics"), $("#npLyrics")]) {
    if (!box.offsetParent) continue;
    box.querySelectorAll(".line").forEach((el) => {
      const i = +el.dataset.i, dist = Math.abs(i - idx);
      el.classList.toggle("on", i === idx);
      el.style.setProperty("--b", i === idx ? "0px" : `${Math.min(dist * 0.7, 3.5)}px`);
    });
    const on = box.querySelector(".line.on");
    if (on && Date.now() - (+box.dataset.userScroll || 0) > 3000) {
      box.scrollTo({ top: on.offsetTop - box.clientHeight * 0.32, behavior: "smooth" });
    }
  }
}

// =====================================================================================
// Màn hình Đang phát: nền màu chuyển động + sóng nhạc quanh ảnh bìa
// =====================================================================================
let freq = null, bass = 0;
const ring = $("#npRing"), npBg = $("#npBg");
const levels = new Float32Array(72);
function drawNowPlaying(now) {
  // Nền: các đốm màu trôi chậm, phồng theo tiếng bass
  const bw = 96, bh = 60;
  if (npBg.width !== bw) { npBg.width = bw; npBg.height = bh; }
  const g = npBg.getContext("2d");
  g.fillStyle = "#07080c";
  g.fillRect(0, 0, bw, bh);
  const tt = now / 1000;
  const blobs = [
    [palette[0], 0.25 + 0.15 * Math.sin(tt * 0.11), 0.3 + 0.2 * Math.cos(tt * 0.09), 0.55],
    [palette[1], 0.75 + 0.15 * Math.cos(tt * 0.07), 0.35 + 0.25 * Math.sin(tt * 0.13), 0.6],
    [palette[2], 0.5 + 0.3 * Math.sin(tt * 0.05 + 2), 0.85 + 0.12 * Math.cos(tt * 0.1), 0.65],
    [palette[0], 0.85 + 0.1 * Math.sin(tt * 0.08 + 1), 0.9 + 0.1 * Math.sin(tt * 0.06), 0.45],
  ];
  g.globalCompositeOperation = "lighter";
  for (const [c, x, y, r] of blobs) {
    const rad = r * bw * (1 + bass * 0.35);
    const gr = g.createRadialGradient(x * bw, y * bh, 0, x * bw, y * bh, rad);
    gr.addColorStop(0, `rgba(${c.join(",")},.75)`);
    gr.addColorStop(1, `rgba(${c.join(",")},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, bw, bh);
  }
  g.globalCompositeOperation = "source-over";

  // Sóng nhạc vòng quanh ảnh bìa
  const dpr = devicePixelRatio || 1, W = ring.clientWidth, H = ring.clientHeight;
  if (ring.width !== Math.round(W * dpr)) { ring.width = Math.round(W * dpr); ring.height = Math.round(H * dpr); }
  const rg = ring.getContext("2d");
  rg.setTransform(dpr, 0, 0, dpr, 0, 0);
  rg.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, art = W / 1.7, R = art * 0.5 * 1.04;
  const N = levels.length;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb");
  rg.lineCap = "round";
  for (let i = 0; i < N; i++) {
    const v = levels[i];
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const len = 3 + v * art * 0.14;
    const x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R;
    const x2 = cx + Math.cos(a) * (R + len), y2 = cy + Math.sin(a) * (R + len);
    rg.strokeStyle = `rgba(${accent}, ${0.12 + v * 0.6})`;
    rg.lineWidth = Math.max(2, (Math.PI * 2 * R) / N * 0.32);
    rg.beginPath(); rg.moveTo(x1, y1); rg.lineTo(x2, y2); rg.stroke();
  }
  // quầng sáng theo bass
  const glow = rg.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.6);
  glow.addColorStop(0, `rgba(${accent}, ${0.12 + bass * 0.35})`);
  glow.addColorStop(1, `rgba(${accent}, 0)`);
  rg.fillStyle = glow;
  rg.fillRect(0, 0, W, H);
}
// Sóng nhạc chạy phía sau khung bài hát trên thanh phát
const lcdViz = $("#lcdViz");
function drawLcdViz() {
  if (!lcdViz.offsetParent) return;
  const dpr = devicePixelRatio || 1, W = lcdViz.clientWidth, H = lcdViz.clientHeight;
  if (lcdViz.width !== Math.round(W * dpr) || lcdViz.height !== Math.round(H * dpr)) { lcdViz.width = Math.round(W * dpr); lcdViz.height = Math.round(H * dpr); }
  const g = lcdViz.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const half = levels.length / 2, step = W / half;
  g.fillStyle = `rgba(${palette[0].join(",")}, .85)`;
  for (let i = 0; i < half; i++) {
    const h = Math.pow(levels[half + i], 0.8) * H * 0.95;
    if (h < 1) continue;
    g.beginPath();
    g.roundRect(i * step, H - h, Math.max(2, step - 3), h, 2);
    g.fill();
  }
}
function readSpectrum() {
  if (!analyser || !intendPlay) {
    for (let i = 0; i < levels.length; i++) levels[i] *= 0.9;
    bass *= 0.92;
    return;
  }
  freq = freq || new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const half = levels.length / 2, maxBin = Math.floor(freq.length * 0.55);
  for (let i = 0; i < half; i++) {
    // thang log, đối xứng 2 bên cho đẹp
    const a = Math.floor(Math.pow(maxBin, i / half)), b = Math.max(a + 1, Math.floor(Math.pow(maxBin, (i + 1) / half)));
    let s = 0;
    for (let j = a; j < b; j++) s += freq[j];
    const v = Math.pow(s / (b - a) / 255, 1.5);
    const k = Math.max(v, levels[i] * 0.88);
    levels[half + i] = k;
    levels[half - 1 - i] = k;
  }
  let b = 0;
  for (let j = 1; j < 8; j++) b += freq[j];
  bass = Math.max(b / 7 / 255, bass * 0.9);
}

// =====================================================================================
// Vòng lặp khung hình: thanh tua, thời gian, lời, hiệu ứng
// =====================================================================================
function frame(now) {
  requestAnimationFrame(frame);
  const el = cur().el, dur = duration();
  const t = el.currentTime || 0;
  readSpectrum();
  for (const w of waves) {
    const p = w.drag != null ? w.drag : dur ? t / dur : 0;
    drawWave(w, p, now);
  }
  const shown = waves[0].drag != null ? waves[0].drag * dur : t;
  $("#lcdCur").textContent = fmt(shown);
  $("#npCur").textContent = fmt(waves[1].drag != null ? waves[1].drag * dur : t);
  if (dur) $("#lcdDur").textContent = $("#npDur").textContent = fmt(dur);
  updateLyrics(t);
  if (document.body.classList.contains("np-open")) drawNowPlaying(now);
  else drawLcdViz();
}
setInterval(() => {
  const el = cur().el;
  if ("mediaSession" in navigator && isFinite(el.duration) && curPath()) {
    try { navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: 1 }); } catch {}
  }
}, 2000);

// =====================================================================================
// Các trang (Trang chủ, Bài hát, Album, Ca sĩ, Yêu thích, Danh sách phát...)
// =====================================================================================
let view = { name: "home" };
const backStack = [];
const content = $("#content");

function go(v, remember = true) {
  if (remember && (v.name === "album" || v.name === "artist" || v.name === "auto")) backStack.push(view);
  else if (remember) backStack.length = 0;
  view = v;
  renderView();
  content.scrollTop = 0;
}
function goBack() { go(backStack.pop() || { name: "home" }, false); }

let currentList = [];
const currentListPaths = () => currentList.map((t) => t.file);

function renderView(animate = true) {
  const v = view;
  let html = "";
  currentList = [];
  if (v.name === "home") html = homeHtml();
  else if (v.name === "songs") { currentList = library; html = headerHtml({ title: "Bài hát", stats: statsText(library), actions: library.length }) + songsHtml(library); }
  else if (v.name === "albums") html = headerHtml({ title: "Album" }) + gridHtml(albums().map(albumCard));
  else if (v.name === "artists") html = headerHtml({ title: "Ca sĩ" }) + gridHtml(artists().map(artistCard));
  else if (v.name === "album") html = albumHtml(v.key);
  else if (v.name === "artist") html = artistHtml(v.key);
  else if (v.name === "favorites") {
    currentList = S.favorites.map(T).filter(Boolean);
    html = headerHtml({ title: "Yêu thích", kind: "Danh sách", art: `<div class="big-art" style="background:linear-gradient(135deg,rgba(var(--accent-rgb),1),rgba(var(--c2),1))">${icon("heartFill")}</div>`, stats: statsText(currentList), actions: currentList.length })
      + (currentList.length ? songsHtml(currentList) : `<div class="empty">Bấm ♡ cạnh bài hát để thêm vào đây.</div>`);
  } else if (v.name === "recent") {
    currentList = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean).slice(0, 100);
    html = headerHtml({ title: "Nghe gần đây", stats: statsText(currentList), actions: currentList.length })
      + (currentList.length ? songsHtml(currentList) : `<div class="empty">Chưa nghe bài nào.</div>`);
  } else if (v.name === "playlist") html = playlistHtml(v.id);
  else if (v.name === "folder") html = folderHtml();
  else if (v.name === "playlists") html = playlistsHtml();
  else if (v.name === "auto") html = autoHtml(v.key);
  else if (v.name === "search") html = searchHtml(v.q);
  content.innerHTML = `<div class="view" ${animate ? "" : 'style="animation:none"'}>${html}</div>`;
  markNav();
  markPlaying();
}

function statsText(list) {
  const total = list.reduce((s, t) => s + (t.duration || 0), 0);
  return `${list.length} bài · ${fmtLong(total)}`;
}
function headerHtml({ title, kind = "", by = "", byView = "", stats = "", art = "", actions = false, extra = "", back = false }) {
  return `${back ? `<button class="back" data-back>${icon("left")}Quay lại</button>` : ""}
  <header class="vhead">${art}
    <div style="min-width:0">${kind ? `<div class="kind">${kind}</div>` : ""}<h1>${esc(title)}</h1>
      ${by ? `<div class="by" ${byView}>${esc(by)}</div>` : ""}
      ${stats ? `<div class="stats">${stats}</div>` : ""}
      ${actions ? `<div class="actions"><button class="pill accent" data-play-all>${icon("play")}Phát</button><button class="pill" data-shuffle-all>${icon("shuffle")}Ngẫu nhiên</button><button class="pill" data-add-all title="Thêm tất cả vào playlist">${icon("plus")}</button>${extra}</div>` : ""}
    </div></header>`;
}
function sourceBadge(t) {
  if (!isOnline(t.file)) return "";
  if (t.file.startsWith("yt:")) return `<span class="src yt">YouTube</span>`;
  if (t.file.startsWith("sc:")) return `<span class="src sc">SoundCloud</span>`;
  return "";
}
function songsHtml(list, { album = true, removable = false, offset = 0, offline = null } = {}) {
  return `<div class="songs">${list.map((t, i) => {
    const n = offset + i;
    const dup = offline && offline.has(t.file)
      ? `<span class="src off" title="Đã có trong thư viện">Có bản offline</span>` : "";
    return `
    <div class="srow ${album ? "" : "noalbum"}" draggable="true" data-p="${esc(t.file)}" data-i="${n}" data-n="${n + 1}" style="--i:${n}" ${removable ? "data-removable" : ""}>
      <div class="num"><span class="n">${n + 1}</span><span class="pbtn">${icon("play")}</span></div>
      <div class="thumb">${t.cover ? `<img loading="lazy" src="${coverUrl(t.file)}" alt="" draggable="false">` : icon("note")}</div>
      <div class="st"><span class="tname">${esc(t.title)}</span>${sourceBadge(t)}${dup}</div>
      <div class="sa" data-artist="${esc(plain(artistOf(t)))}">${esc(artistOf(t))}</div>
      ${album ? `<div class="sb" data-album="${esc(plain(t.album || t.title) + "|" + plain(artistOf(t)))}">${esc(t.album || "")}</div>` : ""}
      <button class="fav ${isFav(t.file) ? "on" : ""}" data-p="${esc(t.file)}">${icon(isFav(t.file) ? "heartFill" : "heart")}</button>
      <div class="dur">${fmt(t.duration)}</div>
    </div>`; }).join("")}</div>`;
}
function gridHtml(cards) { return cards.length ? `<div class="grid">${cards.join("")}</div>` : `<div class="empty">Chưa có gì ở đây.</div>`; }
function cardHtml({ art, title, sub, attrs, round = false, i = 0 }) {
  return `<div class="card ${round ? "round" : ""}" draggable="true" ${attrs} style="--i:${i}">
    <div class="art">${art}<button class="cplay glass" data-cplay>${icon("play")}</button></div>
    <div class="ct">${esc(title)}</div><div class="cs">${esc(sub)}</div></div>`;
}
const imgOr = (t, ic) => (t ? `<img loading="lazy" src="${coverUrl(t.file)}" alt="" draggable="false">` : icon(ic));
function albumCard(a, i) {
  return cardHtml({ art: imgOr(firstCover(a.tracks), "disc"), title: a.name, sub: a.single ? `${a.artist} · Đĩa đơn` : a.artist, attrs: `data-album="${esc(a.key)}"`, i });
}
function artistCard(a, i) {
  return cardHtml({ art: imgOr(firstCover(a.tracks), "mic"), title: a.name, sub: `${a.tracks.length} bài`, attrs: `data-artist="${esc(a.key)}"`, round: true, i });
}
function trackCard(t, i) {
  return cardHtml({ art: imgOr(t.cover ? t : null, "note"), title: t.title, sub: artistOf(t), attrs: `data-track="${esc(t.file)}"`, i });
}

function homeHtml() {
  const h = new Date().getHours();
  const hello = h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  if (!library.length) {
    return `<h1 class="greeting">${hello}</h1><div class="empty">Thư viện chưa có bài nào.<br>Tải nhạc bằng TaiNhac.bat, mở thư mục ở thanh bên, hoặc tìm trên YouTube/SoundCloud ở ô tìm kiếm.</div>`;
  }
  const recent = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean).slice(0, 14);
  const most = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n).slice(0, 8)
    .map(([p, v]) => [T(p), v.n]).filter(([t]) => t);
  const fresh = library.slice().sort((a, b) => b.added - a.added).slice(0, 14);
  let html = `<h1 class="greeting">${hello}</h1>`;
  if (recent.length) html += `<section class="section"><h2>Nghe gần đây</h2><div class="row-scroll">${recent.map(trackCard).join("")}</div></section>`;
  if (most.length) {
    html += `<section class="section"><h2>Nghe nhiều nhất</h2><div class="top-list">${most.map(([t, n], i) => `
      <div class="top-item" data-track="${esc(t.file)}" style="--i:${i}"><div class="rank">${i + 1}</div>
      <div class="thumb">${imgOr(t.cover ? t : null, "note")}</div>
      <div style="min-width:0"><div class="tt">${esc(t.title)}</div><div class="ts">${esc(artistOf(t))}</div></div>
      <div class="cnt">${n} lượt</div></div>`).join("")}</div></section>`;
  }
  html += `<section class="section"><h2>Mới thêm</h2><div class="row-scroll">${fresh.map(trackCard).join("")}</div></section>`;
  const al = albums().slice(0, 14);
  if (al.length) html += `<section class="section"><h2>Album</h2><div class="row-scroll">${al.map(albumCard).join("")}</div></section>`;
  return html;
}
function albumHtml(key) {
  const a = albums().find((x) => x.key === key);
  if (!a) return `<div class="empty">Không tìm thấy album.</div>`;
  currentList = a.tracks;
  const year = (a.tracks.find((t) => t.year) || {}).year;
  return headerHtml({ back: true, title: a.name, kind: a.single ? "Đĩa đơn" : "Album", by: a.artist, byView: `data-artist="${esc(plain(a.artist))}"`,
    art: `<div class="big-art">${imgOr(firstCover(a.tracks), "disc")}</div>`, stats: [year, statsText(a.tracks)].filter(Boolean).join(" · "), actions: true })
    + songsHtml(a.tracks, { album: false });
}
function artistHtml(key) {
  const a = artists().find((x) => x.key === key);
  if (!a) return `<div class="empty">Không tìm thấy ca sĩ.</div>`;
  currentList = a.tracks;
  const al = albums(a.tracks);
  return headerHtml({ back: true, title: a.name, kind: "Ca sĩ", art: `<div class="big-art round">${imgOr(firstCover(a.tracks), "mic")}</div>`, stats: statsText(a.tracks), actions: true })
    + (al.length > 1 ? `<section class="section"><h2>Album</h2><div class="row-scroll">${al.map(albumCard).join("")}</div></section>` : "")
    + `<section class="section"><h2>Bài hát</h2>${songsHtml(a.tracks)}</section>`;
}
function playlistHtml(id) {
  const pl = S.playlists.find((x) => x.id === id);
  if (!pl) return `<div class="empty">Danh sách phát không còn.</div>`;
  currentList = pl.tracks.map(T).filter(Boolean);
  const art = `<div class="big-art">${playlistCover(currentList)}</div>`;
  return headerHtml({ title: pl.name, kind: "Danh sách phát", art, stats: statsText(currentList), actions: true,
    extra: `<button class="pill" data-rename="${id}">${icon("pencil")}Đổi tên</button><button class="pill" data-pl-menu="${id}">${icon("more")}Khác</button>` })
    + (currentList.length ? songsHtml(currentList, { removable: true }) : `<div class="empty">Chuột phải vào bài bất kỳ → “Thêm vào danh sách phát”.</div>`);
}
function folderHtml() {
  if (!openedFolder) return `<div class="empty">Chưa mở thư mục nào.</div>`;
  currentList = openedFolder.tracks;
  return headerHtml({ title: openedFolder.name, kind: "Thư mục", art: `<div class="big-art">${icon("folder")}</div>`, stats: esc(openedFolder.dir) + "<br>" + statsText(currentList), actions: currentList.length })
    + (currentList.length ? songsHtml(currentList) : `<div class="empty">Thư mục này không có file nhạc.</div>`);
}

function playlistCover(tracks) {
  const covers = [...new Set(tracks.map((t) => (t && t.cover ? t.file : null)).filter(Boolean))].slice(0, 4);
  if (!covers.length) return icon("list");
  if (covers.length < 4) return `<img loading="lazy" src="${coverUrl(covers[0])}" alt="">`;
  return `<div class="mosaic">${covers.map((p) => `<img loading="lazy" src="${coverUrl(p)}" alt="">`).join("")}</div>`;
}
function miniCover(pl) {
  const covers = [...new Set(pl.tracks.map(T).filter((t) => t && t.cover).map((t) => t.file))].slice(0, 4);
  if (!covers.length) return `<span class="plcover">${icon("list")}</span>`;
  if (covers.length < 4) return `<span class="plcover"><img loading="lazy" src="${coverUrl(covers[0])}" alt=""></span>`;
  return `<span class="plcover"><span class="pgrid">${covers.map((p) => `<img loading="lazy" src="${coverUrl(p)}" alt="">`).join("")}</span></span>`;
}
function uniqTracks(list) {
  const seen = new Set();
  return list.filter((t) => {
    if (!t || seen.has(t.file)) return false;
    seen.add(t.file);
    return true;
  });
}
function topArtistByPlays() {
  const counts = new Map();
  for (const [p, v] of Object.entries(S.plays)) {
    const t = T(p);
    if (!t) continue;
    const a = artistOf(t);
    if (a && a !== "Không rõ ca sĩ") counts.set(a, (counts.get(a) || 0) + (v.n || 1));
  }
  if (!counts.size) {
    for (const t of library) {
      const a = artistOf(t);
      if (a && a !== "Không rõ ca sĩ") counts.set(a, (counts.get(a) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}
function autoPlaylists() {
  const recent = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean);
  const most = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n).map(([p]) => T(p)).filter(Boolean);
  const fresh = library.slice().sort((a, b) => (b.added || 0) - (a.added || 0));
  const unplayed = library.filter((t) => !S.plays[t.file]);
  const online = uniqTracks([...S.favorites, ...S.playlists.flatMap((pl) => pl.tracks), ...Object.keys(S.plays)]
    .map(T).filter((t) => t && isOnline(t.file)));
  return [
    { key: "recent", name: "Nghe gần đây", icon: "clock", tracks: uniqTracks(recent).slice(0, 50) },
    { key: "most", name: "Nghe nhiều", icon: "spark", tracks: uniqTracks(most).slice(0, 40) },
    { key: "fresh", name: "Mới thêm", icon: "note", tracks: fresh.slice(0, 40) },
    { key: "unplayed", name: "Chưa nghe", icon: "disc", tracks: unplayed.slice(0, 50) },
    { key: "online", name: "Online đã lưu", icon: "globe", tracks: online },
  ].filter((a) => a.tracks.length);
}
function suggestPlaylists() {
  const recent = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean);
  const most = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n).map(([p]) => T(p)).filter(Boolean);
  const out = [];
  const top = topArtistByPlays();
  if (top) {
    const tracks = uniqTracks([...library, ...recent]).filter((t) => artistOf(t) === top).slice(0, 30);
    if (tracks.length >= 3) out.push({ key: "artist", name: `${top} tuyển tập`, hint: `${tracks.length} bài · gu của bạn`, tracks });
  }
  const forgotten = library.filter((t) => {
    const p = S.plays[t.file];
    return !p || Date.now() - p.last > 30 * 86400000;
  });
  if (forgotten.length >= 3) out.push({ key: "forgotten", name: "Bài bỏ quên", hint: `${forgotten.length} bài lâu chưa nghe`, tracks: forgotten.slice(0, 40) });
  const mix = uniqTracks([...recent.slice(0, 8), ...most.slice(0, 8)]).slice(0, 20);
  if (mix.length >= 5) out.push({ key: "mix", name: "Trộn gu của bạn", hint: "Gần đây + nghe nhiều", tracks: mix });
  return out.slice(0, 3);
}
function autoCard(a, i) {
  return cardHtml({ art: playlistCover(a.tracks), title: a.name, sub: `${a.tracks.length} bài`, attrs: `data-auto="${a.key}"`, i });
}
function suggCard(s, i) {
  return `<div class="card sugg" draggable="false" data-sugg="${s.key}" style="--i:${i}">
    <div class="art">${playlistCover(s.tracks)}<button class="cplay glass" data-cplay>${icon("play")}</button></div>
    <div class="ct">${esc(s.name)}</div><div class="cs">${esc(s.hint)}</div>
    <button class="pill accent sugg-save" data-save-sugg="${s.key}">${icon("plus")}Lưu</button></div>`;
}
function playlistCard(pl, i) {
  const tracks = pl.tracks.map(T).filter(Boolean);
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);
  return cardHtml({ art: playlistCover(tracks), title: pl.name, sub: `${pl.tracks.length} bài · ${fmtLong(total)}`, attrs: `data-playlist="${pl.id}"`, i });
}
function playlistsHtml() {
  const auto = autoPlaylists();
  const sugg = suggestPlaylists();
  let html = headerHtml({ title: "Playlist", kind: "Bộ sưu tập", stats: `${S.playlists.length} playlist · ${auto.length} tự động` });
  html += `<div class="sfilters"><button class="pill accent" data-new-playlist>${icon("plus")}Playlist mới</button>${auto.length || sugg.length ? `<button class="pill" data-materialize-all>${icon("spark")}Tạo từ gợi ý</button>` : ""}</div>`;
  if (auto.length) html += `<section class="section"><h2>Tự động</h2><div class="row-scroll">${auto.map(autoCard).join("")}</div></section>`;
  if (sugg.length) html += `<section class="section"><h2>Gợi ý cho bạn</h2><div class="row-scroll">${sugg.map(suggCard).join("")}</div></section>`;
  html += `<section class="section"><h2>Của bạn</h2>${S.playlists.length ? `<div class="row-scroll">${S.playlists.map(playlistCard).join("")}</div>` : `<div class="empty">Chưa có playlist. Bấm “Playlist mới” hoặc lưu hàng đợi.</div>`}</section>`;
  return html;
}
function autoHtml(key) {
  const a = autoPlaylists().find((x) => x.key === key);
  if (!a) return `<div class="empty">Playlist tự động này không còn dữ liệu.</div>`;
  currentList = a.tracks;
  return headerHtml({ back: true, title: a.name, kind: "Playlist tự động", art: `<div class="big-art">${playlistCover(a.tracks)}</div>`,
    stats: statsText(a.tracks), actions: true, extra: `<button class="pill" data-save-auto="${key}">${icon("plus")}Lưu thành playlist</button>` })
    + songsHtml(a.tracks);
}
function saveGroup(key, groups) {
  const g = groups.find((x) => x.key === key);
  if (!g) return;
  const pl = createPlaylist(g.name, g.tracks.map((t) => t.file));
  toast(`Đã tạo “${pl.name}”`);
  if (view.name === "playlists" || view.name === "auto") renderView(false);
}
function materializeAll() {
  const groups = [...autoPlaylists(), ...suggestPlaylists()];
  let n = 0;
  for (const g of groups) {
    createPlaylist(g.name, g.tracks.map((t) => t.file));
    n++;
  }
  toast(`Đã tạo ${n} playlist từ gợi ý`);
  if (view.name === "playlists") renderView(false);
}
// ---------- Tìm kiếm hợp nhất: thư viện + YouTube + SoundCloud ----------
const searchState = { q: "", yt: [], sc: [], pending: new Set(), errors: {}, filter: "all", seq: 0, abort: null };
let onlineTimer = 0;

function searchNorm(t) {
  const name = String(t.title || "").split(/\s*[|｜]\s*/)[0];
  return plain(`${name} ${t.artist || ""}`)
    .replace(/[\(\[][^\)\]]*[\)\]]/g, " ")
    .replace(/\b(official|mv|m\/v|lyric|lyrics|audio|video|music|remaster(ed)?|visuali[sz]er|vietsub|engsub)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function offlineMatches() {
  const keys = new Map();
  for (const t of library) {
    const key = searchNorm(t);
    if (key && !keys.has(key)) keys.set(key, t);
  }
  const out = new Set();
  for (const t of [...searchState.yt, ...searchState.sc]) {
    const local = keys.get(searchNorm(t));
    if (local && (!local.duration || !t.duration || Math.abs(local.duration - t.duration) <= 6)) out.add(t.file);
  }
  return out;
}
function sourceSection(name, list, pending, error, offset, offline) {
  const note = pending
    ? `<div class="src-note">Đang tìm trên ${name}…</div>`
    : error ? `<div class="src-note">${esc(error)}</div>` : "";
  const body = list.length ? songsHtml(list, { offset, offline }) : "";
  if (!note && !body) return "";
  return `<section class="section"><h2>${name}</h2>${note}${body}</section>`;
}
function loadOnlineSearch(text, seq) {
  const ctrl = new AbortController();
  searchState.abort = ctrl;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 15000);
  const jobs = ["yt", "sc"].map((src) =>
    fetch(`/api/search?src=${src}&q=${enc(text)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (seq !== searchState.seq) return;
        if (Array.isArray(data)) {
          data.forEach((t) => known.set(t.file, t));
          searchState[src] = data;
          delete searchState.errors[src];
        } else {
          searchState[src] = [];
          searchState.errors[src] = (data && data.error) || "Không tìm được.";
        }
      })
      .catch(() => {
        if (seq !== searchState.seq) return;
        searchState[src] = [];
        searchState.errors[src] = timedOut ? "Hết thời gian tìm kiếm." : "Không kết nối được.";
      })
      .finally(() => {
        if (seq !== searchState.seq) return;
        searchState.pending.delete(src);
        if (!searchState.pending.size) {
          searchState.abort = null;
          clearTimeout(timer);
        }
        if (view.name === "search" && view.q.trim() === text) renderView(false);
      }));
  return Promise.allSettled(jobs);
}
function searchHtml(q) {
  const text = (q || "").trim();
  if (searchState.q !== text) {
    clearTimeout(onlineTimer);
    if (searchState.abort) searchState.abort.abort();
    searchState.q = text;
    searchState.filter = "all";
    searchState.yt = [];
    searchState.sc = [];
    searchState.pending = new Set();
    searchState.errors = {};
    searchState.seq += 1;
    if (text.length >= 2) {
      const seq = searchState.seq;
      searchState.pending = new Set(["yt", "sc"]);
      onlineTimer = setTimeout(() => loadOnlineSearch(text, seq), 450);
    }
  }
  const k = plain(text);
  const songs = text ? library.filter((t) => plain(`${t.title} ${t.artist} ${t.album}`).includes(k)) : [];
  const al = text ? albums().filter((a) => plain(a.name + " " + a.artist).includes(k) && !a.single) : [];
  const ar = text ? artists().filter((a) => plain(a.name).includes(k)) : [];
  const f = searchState.filter;
  const showLocal = f === "all" || f === "local";
  const showYt = f === "all" || f === "yt";
  const showSc = f === "all" || f === "sc";
  const offline = offlineMatches();
  const pref = !!S.settings.preferOffline;
  const hiddenDups = pref ? [...searchState.yt, ...searchState.sc].filter((t) => offline.has(t.file)).length : 0;
  const ytAll = pref ? searchState.yt.filter((t) => !offline.has(t.file)) : searchState.yt;
  const scAll = pref ? searchState.sc.filter((t) => !offline.has(t.file)) : searchState.sc;
  const localSongs = showLocal ? songs : [];
  const ytList = showYt ? ytAll : [];
  const scList = showSc ? scAll : [];
  currentList = [...localSongs, ...ytList, ...scList];
  const total = songs.length + ytAll.length + scAll.length;
  const chip = (id, label, n) =>
    `<button class="pill ${f === id ? "accent" : ""}" data-sfilter="${id}">${label}${n ? ` (${n})` : ""}</button>`;
  let html = headerHtml({
    title: `Kết quả cho “${q}”`,
    stats: `${currentList.length} bài · ${fmtLong(currentList.reduce((s, t) => s + (t.duration || 0), 0))}`,
    actions: currentList.length > 0,
  });
  html += `<div class="sfilters">${chip("all", "Tất cả", total)}${chip("local", "Thư viện", songs.length)}${chip("yt", "YouTube", ytAll.length)}${chip("sc", "SoundCloud", scAll.length)}<button class="pill ${pref ? "accent" : ""}" data-prefer-offline>Ưu tiên offline</button></div>`;
  if (hiddenDups) html += `<div class="src-note">Đã ẩn ${hiddenDups} bản online trùng với thư viện.</div>`;
  let hasResults = false;
  if (showLocal && ar.length) {
    hasResults = true;
    html += `<section class="section"><h2>Ca sĩ</h2><div class="row-scroll">${ar.map(artistCard).join("")}</div></section>`;
  }
  if (showLocal && al.length) {
    hasResults = true;
    html += `<section class="section"><h2>Album</h2><div class="row-scroll">${al.map(albumCard).join("")}</div></section>`;
  }
  if (showLocal && localSongs.length) {
    hasResults = true;
    html += `<section class="section"><h2>Bài hát</h2>${songsHtml(localSongs, { offset: 0, offline })}</section>`;
  }
  const ytSection = sourceSection("YouTube", ytList, showYt && searchState.pending.has("yt"), showYt ? searchState.errors.yt : "", localSongs.length, offline);
  if (ytSection) {
    hasResults = true;
    html += ytSection;
  }
  const scSection = sourceSection("SoundCloud", scList, showSc && searchState.pending.has("sc"), showSc ? searchState.errors.sc : "", localSongs.length + ytList.length, offline);
  if (scSection) {
    hasResults = true;
    html += scSection;
  }
  if (!hasResults && !searchState.pending.size) html += `<div class="empty">Không tìm thấy gì.</div>`;
  return html;
}

const prepared = new Map();
function prepareOnline(p) {
  if (!isOnline(p)) return Promise.resolve(true);
  if (!prepared.has(p)) {
    const job = fetch("/api/prepare?p=" + enc(p))
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok) {
          if (d.info) known.set(p, d.info);
          return true;
        }
        prepared.delete(p);
        return false;
      })
      .catch(() => { prepared.delete(p); return false; });
    prepared.set(p, job);
  }
  return prepared.get(p);
}
function prefetchNext() {
  const next = Q[qi + 1];
  if (isOnline(next)) prepareOnline(next);
}
const saving = new Set();
async function saveOffline(p) {
  if (!isOnline(p) || saving.has(p)) return;
  saving.add(p);
  toast("Đang lưu bài vào thư viện…", 120000);
  try {
    const res = await (await fetch("/api/save?p=" + enc(p))).json();
    if (!res || !res.ok) {
      toast((res && res.error) || "Không lưu được bài này");
      return;
    }
    await loadLibrary();
    hideToast();
    toast("Đã lưu vào thư viện");
    if (["search", "songs", "favorites", "recent"].includes(view.name)) renderView(false);
  } catch {
    toast("Không lưu được bài này");
  } finally {
    saving.delete(p);
  }
}

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

// =====================================================================================
// Thanh bên
// =====================================================================================
function renderSidebar() {
  const folders = openedFolder ? [openedFolder] : [];
  $("#folderNav").innerHTML = `<a class="nav" data-view="library-folder">${icon("folder")}<span class="nav-name">out (thư viện)</span></a>` +
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
  const dir = path.replace(/[\\/][^\\/]*$/, "");
  const d = await fetchFolder(dir);
  const inLibrary = d.isLibrary;
  if (!inLibrary) openedFolder = d;
  renderSidebar();
  go(inLibrary ? { name: "songs" } : { name: "folder" });
  const paths = d.tracks.map((t) => t.file);
  const i = paths.findIndex((p) => p.toLowerCase() === path.toLowerCase());
  playList(paths, Math.max(0, i));
}
// File được gửi tới trước khi trang khởi động xong thì để dành, khởi động xong mới mở
let booted = false, pendingOpen = null;
window.openFile = (p) => (booted ? openFileNow(p) : (pendingOpen = p));

// ---------- Danh sách phát ----------
function createPlaylist(name, tracks = []) {
  let final = (name || "").trim() || "Playlist mới";
  const base = final;
  let n = 2;
  while (S.playlists.some((p) => p.name === final)) final = `${base} (${n++})`;
  const pl = {
    id: "pl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: final,
    tracks: [...new Set(tracks.filter(Boolean))],
  };
  S.playlists.push(pl);
  save();
  renderSidebar();
  return pl;
}
async function newPlaylist(withTrack) {
  const name = await ask("Tên danh sách phát mới", `Danh sách ${S.playlists.length + 1}`);
  if (!name) return;
  const pl = createPlaylist(name, withTrack ? [withTrack] : []);
  toast(withTrack ? `Đã thêm vào “${pl.name}”` : `Đã tạo “${pl.name}”`);
  if (view.name === "playlists") renderView(false);
}
function addPathsToPlaylist(id, paths) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return 0;
  let added = 0;
  for (const p of paths) {
    if (p && !pl.tracks.includes(p)) { pl.tracks.push(p); added++; }
  }
  if (added) {
    save();
    renderSidebar();
    if (view.name === "playlist" && view.id === id) renderView(false);
    if (view.name === "playlists") renderView(false);
  }
  return added;
}
function addToPlaylist(id, path) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  if (pl.tracks.includes(path)) return toast("Bài này đã có trong danh sách");
  addPathsToPlaylist(id, [path]);
  toast(`Đã thêm vào “${pl.name}”`);
}
async function renamePlaylist(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  const name = await ask("Đổi tên danh sách phát", pl.name);
  if (!name) return;
  pl.name = name;
  save();
  renderSidebar();
  if (view.name === "playlist") renderView(false);
  if (view.name === "playlists") renderView(false);
}
function deletePlaylist(id) {
  const idx = S.playlists.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const [pl] = S.playlists.splice(idx, 1);
  save();
  renderSidebar();
  if (view.name === "playlist" && view.id === id) go({ name: "playlists" });
  else if (view.name === "playlists") renderView(false);
  showUndo(`Đã xoá “${pl.name}”`, () => {
    S.playlists.splice(Math.min(idx, S.playlists.length), 0, pl);
    save();
    renderSidebar();
    if (view.name === "playlists") renderView(false);
    toast(`Đã khôi phục “${pl.name}”`);
  });
}
function duplicatePlaylist(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  let name = `${pl.name} (bản sao)`;
  let n = 2;
  while (S.playlists.some((p) => p.name === name)) name = `${pl.name} (bản sao ${n++})`;
  const copy = { ...pl, id: "pl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, tracks: [...pl.tracks] };
  S.playlists.splice(S.playlists.indexOf(pl) + 1, 0, copy);
  save();
  renderSidebar();
  if (view.name === "playlists") renderView(false);
  toast(`Đã nhân bản “${pl.name}”`);
}
function mergePlaylistMenu(id, x, y) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  const others = S.playlists.filter((p) => p.id !== id);
  if (!others.length) return toast("Không có playlist khác để gộp");
  showMenu(x, y, others.map((p) => ({
    ic: "list", label: p.name, run: () => {
      const n = addPathsToPlaylist(id, p.tracks);
      toast(n ? `Đã gộp ${n} bài từ “${p.name}”` : `“${p.name}” không có bài mới`);
    },
  })));
}
function m3uText(pl) {
  const lines = ["#EXTM3U", `#PLAYLIST:${pl.name}`];
  let count = 0;
  for (const p of pl.tracks) {
    const t = T(p);
    if (!t) continue;
    const target = isOnline(p) ? (t.web || "") : p;
    if (!target) continue;
    lines.push(`#EXTINF:${Math.round(t.duration || 0)},${artistOf(t)} - ${t.title}`);
    lines.push(target);
    count++;
  }
  return { text: lines.join("\r\n"), count };
}
async function exportPlaylist(id) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  const { text, count } = m3uText(pl);
  if (!count) return toast("Playlist không có bài nào để xuất");
  const name = (pl.name || "playlist").replace(/[\\/:*?"<>|]+/g, "_");
  if (window.pywebview) {
    let saved = false;
    try { saved = await py("save_text", name + ".m3u", text); } catch {}
    if (!saved) return toast("Đã huỷ xuất M3U");
    return toast(`Đã lưu ${count} bài ra M3U`);
  }
  const blob = new Blob([text], { type: "audio/x-mpegurl;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".m3u";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Đã xuất ${count} bài ra M3U`);
}
function reorderPlaylist(id, from, to) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl || from === to || from < 0 || to < 0 || from >= pl.tracks.length || to >= pl.tracks.length) return;
  const [p] = pl.tracks.splice(from, 1);
  pl.tracks.splice(to, 0, p);
  save();
  if (view.name === "playlist" && view.id === id) renderView(false);
  toast("Đã đổi thứ tự bài");
}
function reorderPlaylists(fromId, toId) {
  const from = S.playlists.findIndex((p) => p.id === fromId);
  const to = S.playlists.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [pl] = S.playlists.splice(from, 1);
  S.playlists.splice(to, 0, pl);
  save();
  renderSidebar();
  if (view.name === "playlists") renderView(false);
}
async function saveQueuePlaylist() {
  if (!Q.length) return toast("Hàng đợi trống");
  const name = await ask("Lưu hàng đợi thành playlist", `Hàng đợi ${new Date().toLocaleDateString("vi-VN")}`);
  if (!name) return;
  const pl = createPlaylist(name, Q.slice());
  toast(`Đã lưu ${pl.tracks.length} bài vào “${pl.name}”`);
  if (view.name === "playlists") renderView(false);
}
function addManyToPlaylist(paths, e) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return toast("Không có bài nào để thêm");
  const items = S.playlists.map((pl) => ({
    ic: "list", label: `${pl.name} (${pl.tracks.length})`,
    run: () => {
      const n = addPathsToPlaylist(pl.id, list);
      toast(n ? `Đã thêm ${n} bài vào “${pl.name}”` : "Các bài này đã có trong playlist");
    },
  }));
  items.push("-", {
    ic: "plus", label: "Playlist mới…", run: async () => {
      const name = await ask("Tên playlist mới", `Playlist ${S.playlists.length + 1}`);
      if (!name) return;
      const pl = createPlaylist(name, list);
      toast(`Đã thêm ${pl.tracks.length} bài vào “${pl.name}”`);
      if (view.name === "playlists") renderView(false);
    },
  });
  showMenu(e.clientX, e.clientY, items);
}
function playlistMenu(id, x, y) {
  const pl = S.playlists.find((p) => p.id === id);
  if (!pl) return;
  showMenu(x, y, [
    { ic: "play", label: "Phát", run: () => { const list = pl.tracks.filter(T); if (list.length) playList(list); } },
    { ic: "shuffle", label: "Ngẫu nhiên", run: () => { const list = pl.tracks.filter(T); if (list.length) playList(list, 0, { shuffle: true }); } },
    "-",
    { ic: "plus", label: "Nhân bản", run: () => duplicatePlaylist(id) },
    { ic: "list", label: "Gộp playlist…", run: () => mergePlaylistMenu(id, x, y) },
    { ic: "download", label: "Xuất M3U", run: () => exportPlaylist(id) },
    "-",
    { ic: "pencil", label: "Đổi tên", run: () => renamePlaylist(id) },
    { ic: "trash", label: "Xoá playlist", run: () => deletePlaylist(id) },
  ]);
}

// =====================================================================================
// Bảng phải: Tiếp theo (kéo thả đổi thứ tự) / Lời bài hát
// =====================================================================================
let rpTab = "queue";
function openPanel(tab) {
  const open = document.body.classList.contains("rp-open");
  if (open && rpTab === tab) document.body.classList.remove("rp-open");
  else { rpTab = tab; document.body.classList.add("rp-open"); }
  $$("#rpTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === rpTab));
  $("#rpQueue").hidden = rpTab !== "queue";
  $("#rpLyrics").hidden = rpTab !== "lyrics";
  $("#queueBtn").classList.toggle("on", document.body.classList.contains("rp-open") && rpTab === "queue");
  $("#lyricsBtn").classList.toggle("on", document.body.classList.contains("rp-open") && rpTab === "lyrics");
  lyrIdx = -2;
  renderQueue();
}
$$("#rpTabs button").forEach((b) => b.addEventListener("click", () => { rpTab = b.dataset.tab; document.body.classList.remove("rp-open"); openPanel(rpTab); }));

// Tab Lời bài hát / Tiếp theo trong màn hình Đang phát
let npTab = "lyrics";
function setNpTab(tab) {
  npTab = tab;
  $$("#npTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#npLyrics").hidden = tab !== "lyrics";
  $("#npQueueWrap").hidden = tab !== "queue";
  lyrIdx = -2;
  renderQueue();
}
$$("#npTabs button").forEach((b) => b.addEventListener("click", () => setNpTab(b.dataset.tab)));

function renderQueue() {
  const body = document.body.classList;
  const boxes = [];
  if (body.contains("rp-open") && rpTab === "queue") boxes.push($("#rpQueue"));
  if (body.contains("np-open") && npTab === "queue") boxes.push($("#npQueue"));
  if (boxes.length) {
    const html = queueHtml();
    boxes.forEach((box) => { box.innerHTML = html; });
  }
}
function queueHtml() {
  const nowT = T(curPath());
  if (!nowT) return `<div class="empty">Hàng đợi trống.</div>`;
  const item = (t, i, now) => `<div class="q-item ${now ? "now" : ""}" ${now ? "" : 'draggable="true"'} data-qi="${i}">
      <div class="thumb" style="width:38px;height:38px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.07);display:grid;place-items:center">${imgOr(t.cover ? t : null, "note")}</div>
      <div style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
      <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(artistOf(t))}</div></div>
      ${now ? "" : `<button class="x" data-rm="${i}" title="Bỏ khỏi hàng đợi">${icon("x")}</button>`}</div>`;
  const upcoming = Q.slice(qi + 1, qi + 201).map((p, k) => [T(p), qi + 1 + k]).filter(([t]) => t);
  const tools = `<div class="q-tools"><button class="pill" data-queue-save>${icon("plus")}Lưu thành playlist</button><button class="pill" data-queue-add>${icon("addQ")}Thêm vào playlist</button></div>`;
  return `${tools}<div class="q-head">Đang phát</div>${item(nowT, qi, true)}
    <div class="q-head">Tiếp theo ${upcoming.length ? `<button data-clearq>Xoá hết</button>` : ""}</div>
    ${upcoming.length ? upcoming.map(([t, i]) => item(t, i, false)).join("") : `<div class="empty" style="padding:20px">Không còn bài nào.</div>`}`;
}
let dragQi = null;
for (const qBox of [$("#rpQueue"), $("#npQueue")]) {
  qBox.addEventListener("click", (e) => {
    if (e.target.closest("[data-queue-save]")) { saveQueuePlaylist(); return; }
    if (e.target.closest("[data-queue-add]")) { addManyToPlaylist(Q, e); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) { Q.splice(+rm.dataset.rm, 1); renderQueue(); saveSession(true); return; }
    if (e.target.closest("[data-clearq]")) { Q = Q.slice(0, qi + 1); renderQueue(); saveSession(true); return; }
    const it = e.target.closest(".q-item:not(.now)");
    if (it) { qi = +it.dataset.qi; startTrack(); }
  });
  qBox.addEventListener("dragstart", (e) => {
    const it = e.target.closest(".q-item");
    if (!it) return;
    dragQi = +it.dataset.qi;
    dragPath = Q[dragQi] || null;
    dragFromPlaylist = null;
    dragPlaylistId = null;
    it.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  qBox.addEventListener("dragover", (e) => {
    const it = e.target.closest(".q-item:not(.now)");
    if (dragQi === null || !it) return;
    e.preventDefault();
    $$(".q-item.over", qBox).forEach((x) => x.classList.remove("over"));
    it.classList.add("over");
  });
  qBox.addEventListener("drop", (e) => {
    const it = e.target.closest(".q-item:not(.now)");
    if (dragQi === null || !it) return;
    e.preventDefault();
    const to = +it.dataset.qi;
    const [p] = Q.splice(dragQi, 1);
    Q.splice(to > dragQi ? to - 1 : to, 0, p);
    dragQi = null;
    renderQueue();
    saveSession(true);
  });
  qBox.addEventListener("dragend", () => { dragQi = null; dragPath = null; renderQueue(); });
}

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
addEventListener("contextmenu", (e) => { if (!e.defaultPrevented && !e.target.closest("input")) e.preventDefault(); });

function trackMenu(p, x, y, removable) {
  const t = T(p);
  if (!t) return;
  const items = [
    { ic: "play", label: "Phát", run: () => playList([p]) },
    { ic: "nextUp", label: "Phát tiếp theo", run: () => { if (!curPath()) return playList([p]); Q.splice(qi + 1, 0, p); renderQueue(); toast("Sẽ phát tiếp theo"); } },
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

// =====================================================================================
// Bảng âm thanh: EQ, chuyển bài mượt, bật/tắt kính lỏng
// =====================================================================================
function setFill(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty("--p", p + "%");
}
function setEq(values) {
  S.settings.eq = values.slice();
  save();
  eqNodes.forEach((n, i) => n.gain.setTargetAtTime(values[i], ctx.currentTime, 0.03));
  $$(".band").forEach((el, i) => {
    const inp = el.querySelector("input");
    inp.value = values[i];
    setFill(inp);
    el.querySelector(".v").textContent = (values[i] > 0 ? "+" : "") + values[i];
  });
  $$("#presets button").forEach((b) => b.classList.toggle("on", PRESETS[b.textContent].every((x, i) => x === values[i])));
}
function buildSound() {
  $("#bands").innerHTML = BANDS.map((b) => `<div class="band"><div class="v"></div><div class="slot"><input type="range" class="slider" min="-12" max="12" step="1"></div><div class="f">${b.label}Hz</div></div>`).join("");
  $$(".band input").forEach((inp, i) => inp.addEventListener("input", () => { const v = S.settings.eq.slice(); v[i] = +inp.value; setEq(v); }));
  $("#presets").innerHTML = Object.keys(PRESETS).map((n) => `<button>${n}</button>`).join("");
  $$("#presets button").forEach((b) => b.addEventListener("click", () => setEq(PRESETS[b.textContent])));
  setEq(S.settings.eq);
  const xf = $("#xfade");
  const showXf = () => { $("#xfadeLabel").textContent = +xf.value ? `Chồng ${xf.value} giây giữa 2 bài` : "Tắt"; setFill(xf); };
  xf.value = S.settings.crossfade;
  showXf();
  xf.addEventListener("input", () => { S.settings.crossfade = +xf.value; showXf(); save(); });
  const gt = $("#glassToggle");
  gt.checked = S.settings.glass;
  gt.addEventListener("change", () => { S.settings.glass = gt.checked; save(); applyGlassAll(); });
}
function toggleSound(force) {
  const p = $("#sound");
  p.hidden = force !== undefined ? !force : !p.hidden;
  $$("#soundBtn, #npSound").forEach((b) => b.classList.toggle("on", !p.hidden));
  if (!p.hidden) requestAnimationFrame(() => applyLiquid(p));
}
$("#sound [data-close]").addEventListener("click", () => toggleSound(false));
addEventListener("pointerdown", (e) => {
  const p = $("#sound");
  if (!p.hidden && !p.contains(e.target) && !e.target.closest("#soundBtn, #npSound")) toggleSound(false);
});

// =====================================================================================
// Kính lỏng: bộ lọc SVG làm méo nền ở mép kính (như nhìn qua thấu kính)
// =====================================================================================
const glassDefs = $("#glassDefs");
const glassMap = new Map();
let glassSeq = 0;
// Bản đồ dịch chuyển: giữa tấm kính giữ nguyên, càng gần mép càng bẻ cong ánh sáng vào trong
function displacementMap(w, h, radius, bezel) {
  const k = 0.5, mw = Math.max(2, Math.round(w * k)), mh = Math.max(2, Math.round(h * k));
  const c = document.createElement("canvas");
  c.width = mw; c.height = mh;
  const g = c.getContext("2d");
  const img = g.createImageData(mw, mh), d = img.data;
  const hw = w / 2, hh = h / 2, r = Math.min(radius, hw, hh);
  for (let py = 0; py < mh; py++) {
    for (let px = 0; px < mw; px++) {
      const x = (px + 0.5) / k - hw, y = (py + 0.5) / k - hh;
      const qx = Math.abs(x) - (hw - r), qy = Math.abs(y) - (hh - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const sdf = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r; // < 0 là bên trong
      const dist = -sdf;
      let dx = 0, dy = 0;
      if (dist < bezel && dist > -1) {
        let nx, ny;
        if (qx > 0 && qy > 0) { const l = Math.hypot(ox, oy) || 1; nx = ox / l; ny = oy / l; }
        else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
        nx *= Math.sign(x) || 1; ny *= Math.sign(y) || 1;
        const t = 1 - clamp(dist / bezel, 0, 1);
        const mag = t * t * (3 - 2 * t); // mép cong mượt
        dx = -nx * mag; dy = -ny * mag;
      }
      const i = (py * mw + px) * 4;
      d[i] = 128 + dx * 127; d[i + 1] = 128 + dy * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
function applyLiquid(el) {
  if (!S.settings.glass) { el.style.backdropFilter = el.style.webkitBackdropFilter = ""; return; }
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (w < 8 || h < 8) return;
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const bezel = +el.dataset.bezel || 20;
  const sig = `${w}x${h}x${radius}`;
  let f = glassMap.get(el);
  if (f && f.sig === sig) return;
  if (!f) {
    const id = "lg" + ++glassSeq;
    glassDefs.insertAdjacentHTML("beforeend",
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" preserveAspectRatio="none" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="${Math.min(70, bezel * 2.6)}" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`);
    f = { id, node: glassDefs.lastElementChild };
    glassMap.set(el, f);
  }
  f.sig = sig;
  const fe = f.node.querySelector("feImage");
  fe.setAttribute("width", w);
  fe.setAttribute("height", h);
  fe.setAttribute("href", displacementMap(w, h, radius, bezel));
  const bf = `url(#${f.id}) blur(14px) saturate(1.9) brightness(1.06)`;
  el.style.backdropFilter = bf;
  el.style.webkitBackdropFilter = bf;
}
const glassRO = new ResizeObserver((entries) => {
  for (const e of entries) {
    clearTimeout(e.target._lgT);
    e.target._lgT = setTimeout(() => applyLiquid(e.target), 120);
  }
});
function applyGlassAll() {
  document.body.classList.toggle("noglass", !S.settings.glass);
  glassMap.forEach((f) => (f.sig = ""));
  $$(".lg").forEach(applyLiquid);
}
$$(".lg").forEach((el) => glassRO.observe(el));
// Vệt sáng chạy theo con trỏ trên mặt kính
addEventListener("pointermove", (e) => {
  const g = e.target.closest && e.target.closest(".glass");
  if (!g) return;
  const r = g.getBoundingClientRect();
  g.style.setProperty("--mx", e.clientX - r.left + "px");
  g.style.setProperty("--my", e.clientY - r.top + "px");
}, { passive: true });

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
function closeNowPlaying() { document.body.classList.remove("np-open"); lyrIdx = -2; }
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
  if (e.target.tagName === "INPUT" && e.target.type !== "range") {
    if (e.key === "Escape") { e.target.value = ""; e.target.blur(); go({ name: "home" }); }
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
