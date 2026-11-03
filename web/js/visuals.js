"use strict";

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
  const accent = accentRgb;
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
// Chỉ vẽ khi cần: đang phát (hoặc hiệu ứng còn đang tắt dần) thì tối đa 30 khung/giây, đủ mượt cho sóng nhạc;
// đứng yên thì chỉ vẽ lại khi có gì thay đổi (tua, đổi bài, rê chuột trên thanh tua, đổi cỡ cửa sổ...).
// Trước đây vòng này vẽ lại mọi thứ ở 60+ khung/giây kể cả lúc dừng nhạc.
const FRAME_MS = 1000 / 30;
let needDraw = true, lastDraw = -1e9;
const redraw = () => { needDraw = true; };
const $lcdCur = $("#lcdCur"), $npCur = $("#npCur"), $lcdDur = $("#lcdDur"), $npDur = $("#npDur");
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const animating = intendPlay || now - waveAnim < 750 || bass > 0.004 || levels.some((v) => v > 0.004);
  if (!needDraw && (!animating || now - lastDraw < FRAME_MS - 1)) return;
  needDraw = false;
  lastDraw = now;
  const el = cur().el, dur = duration();
  const t = el.currentTime || 0;
  readSpectrum();
  for (const w of waves) {
    const p = w.drag != null ? w.drag : dur ? t / dur : 0;
    drawWave(w, p, now);
  }
  const shown = waves[0].drag != null ? waves[0].drag * dur : t;
  setText($lcdCur, fmt(shown));
  setText($npCur, fmt(waves[1].drag != null ? waves[1].drag * dur : t));
  if (dur) { const d = fmt(dur); setText($lcdDur, d); setText($npDur, d); }
  updateLyrics(t);
  if (document.body.classList.contains("np-open")) drawNowPlaying(now);
  else drawLcdViz();
}
for (const d of decks) {
  for (const ev of ["timeupdate", "seeked", "loadedmetadata", "durationchange", "play", "pause", "emptied"]) d.el.addEventListener(ev, redraw);
}
for (const w of waves) {
  for (const ev of ["pointermove", "pointerleave", "pointerdown", "pointerup"]) w.c.addEventListener(ev, redraw);
}
addEventListener("resize", redraw);
document.addEventListener("visibilitychange", redraw);
setInterval(() => {
  const el = cur().el;
  if ("mediaSession" in navigator && isFinite(el.duration) && curPath()) {
    try { navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: 1 }); } catch {}
  }
}, 2000);
