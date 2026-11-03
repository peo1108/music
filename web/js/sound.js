"use strict";

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
  const mt = $("#motionToggle");
  const applyMotion = () => document.body.classList.toggle("motion", !!S.settings.motion);
  mt.checked = !!S.settings.motion;
  applyMotion();
  mt.addEventListener("change", () => { S.settings.motion = mt.checked; save(); applyMotion(); });
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
