"use strict";

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
let accentRgb = "255, 77, 109"; // giữ sẵn để khỏi gọi getComputedStyle mỗi khung hình
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
  accentRgb = accent.join(", ");
  root.setProperty("--accent-rgb", accentRgb);
  p.forEach((c, i) => root.setProperty(`--c${i + 1}`, c.join(", ")));
  $$(".slider").forEach(setFill);
  redraw();
}
