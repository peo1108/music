"use strict";

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
