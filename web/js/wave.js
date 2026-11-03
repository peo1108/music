"use strict";

// =====================================================================================
// Dạng sóng (thanh tua)
// =====================================================================================
const peaksCache = new Map();
let peaks = null;
async function loadPeaks(path) {
  peaks = peaksCache.get(path) || null;
  if (peaks) return;
  try {
    const r = await api("/api/peaks?p=" + enc(path));
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
