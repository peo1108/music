"use strict";

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
    const d = await (await api("/api/lyrics?p=" + enc(path))).json();
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
  redraw();
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
