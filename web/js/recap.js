"use strict";

// =====================================================================================
// "Nhìn lại": thói quen nghe nhạc theo 7/30/90 ngày (tính trên máy từ nhật ký nghe, không tốn token)
// + gợi ý ở trang chủ: "Giờ này bạn hay nghe", "Đang nghiện"
// =====================================================================================
let recapDays = 30;
const recapData = {}; // số ngày -> dữ liệu
const SLOT_OF_HOUR = (h) => (h < 5 || h >= 22 ? "khuya" : h < 11 ? "sáng" : h < 17 ? "chiều" : "tối");

const recapLoading = new Set();
async function loadRecap(days) {
  if (recapLoading.has(days)) return;
  recapLoading.add(days);
  try {
    const d = await (await api(`/api/habits?days=${days}`)).json();
    await ensureKnown([...d.topTracks.map((t) => t.uri), ...(d.hot || []).map((t) => t.uri),
      ...Object.values(d.slotTracks || {}).flat()]);
    recapData[days] = d;
  } catch { recapData[days] = recapData[days] || null; }
  recapLoading.delete(days);
  if (view.name === "recap" && recapDays === days) renderView(false);
  if (view.name === "home" && days === 30) renderView(false);
}

const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} giờ ${Math.round(m % 60)} phút` : `${Math.round(m)} phút`);
const SOURCE_NAMES = { yt: "YouTube", sc: "SoundCloud", local: "Trong máy" };

function personas(d) {
  const out = [];
  const total = d.hours.reduce((a, b) => a + b, 0) || 1;
  const night = [22, 23, 0, 1, 2, 3, 4].reduce((a, h) => a + d.hours[h], 0) / total;
  const morning = [5, 6, 7, 8].reduce((a, h) => a + d.hours[h], 0) / total;
  if (night >= 0.35) out.push(["🦉", "Cú đêm", `${Math.round(night * 100)}% thời gian nghe sau 10 giờ tối`]);
  if (morning >= 0.3) out.push(["🐓", "Chim sớm", `${Math.round(morning * 100)}% thời gian nghe lúc sáng sớm`]);
  const top = d.topArtists[0];
  if (top && top.minutes >= d.minutes * 0.2) out.push(["💘", `Fan cứng của ${top.name}`, `${fmtMinutes(top.minutes)} nghe ${top.name}`]);
  if ((d.sources.sc || 0) >= 35) out.push(["☁️", "Thợ săn SoundCloud", `${d.sources.sc}% nhạc từ SoundCloud`]);
  if (d.plays >= 10 && d.skips / d.plays >= 0.4) out.push(["🎯", "Người kén chọn", `Bỏ qua ${Math.round((d.skips / d.plays) * 100)}% số bài`]);
  if (d.streak >= 5) out.push(["🔥", `Chuỗi ${d.streak} ngày`, "Ngày nào cũng nghe"]);
  if (d.newArtistCount >= 5) out.push(["🧭", "Nhà khám phá", `${d.newArtistCount} ca sĩ mới`]);
  return out.slice(0, 4);
}

function recapHtml() {
  const d = recapData[recapDays];
  if (d === undefined) loadRecap(recapDays);
  const tabs = `<div class="sfilters">${[7, 30, 90].map((n) => `<button class="pill ${n === recapDays ? "accent" : ""}" data-action="recapDays" data-days="${n}">${n} ngày</button>`).join("")}</div>`;
  const head = headerHtml({ title: "Nhìn lại", kind: "Thói quen nghe nhạc" }) + tabs;
  if (d === undefined) return head + `<div class="loading-box"><div class="spinner"></div>Đang tính…</div>`;
  if (!d || !d.plays) return head + `<div class="empty">Chưa có nhật ký nghe trong ${recapDays} ngày qua.<br>App bắt đầu ghi từ bản này, nghe vài bài rồi quay lại nhé.</div>`;
  const maxH = Math.max(...d.hours, 1);
  const peak = d.hours.indexOf(Math.max(...d.hours));
  const tiles = [
    [fmtMinutes(d.minutes), "Thời gian nghe"], [nf.format(d.plays), "Lượt nghe"], [nf.format(d.tracks), "Bài khác nhau"],
    [`${d.streak} ngày`, "Chuỗi ngày nghe"], [nf.format(d.newArtistCount), "Ca sĩ mới"],
  ];
  const maxA = Math.max(...d.topArtists.map((a) => a.minutes), 1);
  const src = Object.entries(d.sources).sort((a, b) => b[1] - a[1]);
  return head
    + `<div class="persona">${personas(d).map(([e, t, s]) => `<div class="persona-card"><span class="pe">${e}</span><div><b>${esc(t)}</b><small>${esc(s)}</small></div></div>`).join("")}</div>`
    + `<div class="tiles">${tiles.map(([v, l], i) => `<div class="tile" style="--i:${i}"><b>${esc(v)}</b><span>${l}</span></div>`).join("")}</div>`
    + `<div class="recap-grid">
        <section class="recap-card"><h2>Bài của bạn <button class="pill sm accent" data-action="recapPlayAll">${icon("play")}Phát top bài</button></h2>
          ${d.topTracks.map((t, i) => `<div class="rk" data-action="recapPlay" data-i="${i}"><span class="rk-n">${i + 1}</span>
            <div class="rk-t"><b>${esc((T(t.uri) || t).title)}</b><small>${esc(t.artist)}</small></div><span class="rk-v">${t.plays} lượt · ${fmtMinutes(t.minutes)}</span></div>`).join("")}</section>
        <section class="recap-card"><h2>Ca sĩ hàng đầu</h2>
          ${d.topArtists.map((a) => `<div class="ab"><span class="ab-n">${esc(a.name)}</span><span class="ab-bar"><i style="width:${(a.minutes / maxA) * 100}%"></i></span><span class="ab-v">${fmtMinutes(a.minutes)}</span></div>`).join("")}</section>
        <section class="recap-card"><h2>Bạn nghe lúc nào</h2>
          <div class="hours">${d.hours.map((m, h) => `<i class="${h === peak ? "peak" : ""}" style="height:${Math.max(3, (m / maxH) * 100)}%" title="${h} giờ: ${fmtMinutes(m)}"></i>`).join("")}</div>
          <div class="hours-x"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
          <p class="recap-note">Nghe nhiều nhất lúc <b>${peak} giờ</b>${d.busiestDay ? ` · ngày nghe nhiều nhất ${new Date(d.busiestDay.date).toLocaleDateString("vi-VN")} (${fmtMinutes(d.busiestDay.minutes)})` : ""}.</p></section>
        <section class="recap-card"><h2>Nghe từ đâu</h2>
          <div class="stack">${src.map(([k, v]) => `<i class="s-${k}" style="width:${v}%" title="${SOURCE_NAMES[k] || k}: ${v}%"></i>`).join("")}</div>
          <div class="stack-legend">${src.map(([k, v]) => `<span><i class="s-${k}"></i>${SOURCE_NAMES[k] || k} ${v}%</span>`).join("")}</div>
          <p class="recap-note">${d.vietnamese}% là nhạc Việt${d.styles.length ? ` · hay nghe: ${d.styles.map(esc).join(", ")}` : ""}.</p>
          ${d.newArtists.length ? `<p class="recap-note">Ca sĩ mới khám phá: ${d.newArtists.slice(0, 6).map(esc).join(", ")}.</p>` : ""}</section>
      </div>`
    + ((d.hot || []).length ? `<section class="section"><h2>Đang nghiện</h2><div class="row-scroll">${d.hot.map((h, i) => trackCard(T(h.uri) || { file: h.uri, title: h.title, artist: h.artist }, i)).join("")}</div></section>` : "");
}
ACTIONS.recapDays = (b) => { recapDays = +b.dataset.days; renderView(false); };
const recapUris = () => ((recapData[recapDays] || {}).topTracks || []).map((t) => t.uri).filter(T);
ACTIONS.recapPlayAll = () => { const u = recapUris(); if (u.length) playList(u, 0); };
ACTIONS.recapPlay = (b) => {
  const all = ((recapData[recapDays] || {}).topTracks || []).map((t) => t.uri);
  const u = all.filter(T);
  const i = u.indexOf(all[+b.dataset.i]);
  if (i >= 0) playList(u, i);
};

// ---------- Trang chủ: gợi ý theo thói quen (dùng dữ liệu 30 ngày) ----------
function habitHomeHtml() {
  const d = recapData[30];
  if (!d || !d.plays) return "";
  const slot = SLOT_OF_HOUR(new Date().getHours());
  const slotTracks = ((d.slotTracks || {})[slot] || []).map(T).filter(Boolean).slice(0, 12);
  const hot = (d.hot || []).map((h) => T(h.uri)).filter(Boolean);
  let html = "";
  if (slotTracks.length >= 3) html += `<section class="section"><h2>Buổi ${slot} bạn hay nghe</h2><div class="row-scroll">${slotTracks.map(trackCard).join("")}</div></section>`;
  if (hot.length >= 2) html += `<section class="section"><h2>Đang nghiện 🔥</h2><div class="row-scroll">${hot.map(trackCard).join("")}</div></section>`;
  return html;
}
setInterval(() => { if (document.visibilityState === "visible") loadRecap(30); }, 30 * 60000); // làm mới 30 phút/lần
