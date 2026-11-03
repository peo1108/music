"use strict";

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
