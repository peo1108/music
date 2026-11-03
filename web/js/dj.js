"use strict";

// =====================================================================================
// DJ: chat với Claude Code (gói Claude của bạn) để chọn và mở nhạc. Tab "DJ" ở bảng bên phải.
// Python chạy Claude Code, Claude gọi công cụ của app qua MCP; công cụ nào động vào hàng đợi / gu nghe
// thì Python chuyển sang đây (agentTool), còn chữ trả lời đổ về qua agentEvent.
// =====================================================================================
const djMsgs = []; // {role: "user"|"dj"|"tool"|"error"|"play", text, title, uris}
let djBusy = false;
let djBlocked = [];
let djInfo = null; // {claude: đường dẫn claude.exe hoặc "", model, hasKey, busy}
const DJ_SUGGEST = {
  morning: ["Mở nhạc tươi tươi cho buổi sáng", "Nhạc tập trung làm việc", "Mở mấy bài tao hay nghe"],
  noon: ["Nhạc chill nghỉ trưa", "Nhạc tập trung làm việc", "Quẩy nhẹ cho tỉnh ngủ"],
  evening: ["Hôm nay buồn, mở gì nghe đi", "Mở nhạc chill tối nay", "Quẩy chút đi", "Rap Việt chill", "Nhạc nhẹ để ngủ"],
};
const djSuggestions = () => {
  const h = new Date().getHours();
  return DJ_SUGGEST[h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "noon" : "evening"];
};

// ---------- Token & hạn mức ----------
let djLimits = null; // {windows: {five_hour: {used, resetsAt}, seven_day: {...}}}
const djSession = { tokens: 0, replies: 0, cost: 0, paid: false };
const nf = new Intl.NumberFormat("vi-VN");
const fmtTok = (n) => (n < 1000 ? nf.format(n) : `${(n / 1000).toLocaleString("vi-VN", { maximumFractionDigits: n < 10000 ? 1 : 0 })}k`);
const fmtUsd = (x) => `$${(x || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: x < 0.1 ? 3 : 2 })}`;
const fmtSec = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} phút ${Math.round((ms % 60000) / 1000)} giây` : `${Math.round(ms / 1000)} giây`);
function fmtReset(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000), now = new Date();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? hm : `${hm} ${d.toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric" })}`;
}
const WINDOW_NAMES = { five_hour: "5 giờ", seven_day: "7 ngày", seven_day_opus: "7 ngày Opus", seven_day_sonnet: "7 ngày Sonnet" };
function renderDjTop() {
  const box = $("#djQuota");
  if (!box) return;
  const session = djSession.replies
    ? `<div class="dj-session">Phiên này: <b>${fmtTok(djSession.tokens)}</b> token · ${djSession.replies} lượt${djSession.paid ? ` · ${fmtUsd(djSession.cost)}` : ""}</div>` : "";
  const wins = djLimits && djLimits.windows ? Object.entries(djLimits.windows).filter(([, w]) => typeof w.used === "number") : [];
  if (!wins.length) {
    box.innerHTML = (djInfo && djInfo.hasKey ? `<div class="dj-session">Đang dùng API key riêng</div>` : `<div class="dj-session">Hạn mức gói Claude hiện sau tin nhắn đầu</div>`) + session;
    return;
  }
  box.innerHTML = wins.map(([k, w]) => {
    const pct = Math.round(w.used * 100);
    return `<div class="q-row ${pct >= 90 ? "hot" : pct >= 70 ? "warm" : ""}" title="Gói Claude, cửa sổ ${WINDOW_NAMES[k] || k}: đã dùng ${pct}%. Đặt lại lúc ${fmtReset(w.resetsAt)}">
      <span class="q-name">${WINDOW_NAMES[k] || k}</span><span class="q-bar"><i style="width:${Math.min(100, pct)}%"></i></span>
      <span class="q-pct">${pct}%</span><span class="q-reset">↻ ${fmtReset(w.resetsAt)}</span></div>`;
  }).join("") + session;
}
function recordUsage(ev) {
  djSession.tokens += ev.total;
  djSession.replies += 1;
  djSession.cost += ev.costUsd;
  djSession.paid = ev.paid;
  const day = new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd theo giờ máy
  const st = S.djStats || (S.djStats = { days: {}, total: { tokens: 0, replies: 0, cost: 0 } });
  for (const bucket of [st.total, (st.days[day] = st.days[day] || { tokens: 0, replies: 0, cost: 0 })]) {
    bucket.tokens += ev.total;
    bucket.replies += 1;
    bucket.cost = Math.round((bucket.cost + ev.costUsd) * 10000) / 10000;
  }
  const keep = Object.keys(st.days).sort().slice(-60); // giữ 60 ngày gần nhất
  st.days = Object.fromEntries(keep.map((k) => [k, st.days[k]]));
  save();
}
function usageHtml(m) {
  const models = Object.entries(m.models || {}).map(([k, v]) => `${esc(k)}: ${fmtTok(v)}`).join(" · ");
  const costNote = m.paid ? "Tính tiền thật vào API key của bạn." : "Quy đổi theo giá API cho dễ hình dung. Dùng gói Claude nên không mất thêm tiền, chỉ trừ vào hạn mức.";
  return `<details class="dj-usage"><summary>${icon("spark")}${fmtTok(m.total)} token · ${m.turns} bước · ${fmtSec(m.durationMs)} · ${m.paid ? "" : "~"}${fmtUsd(m.costUsd)}</summary>
    <div class="dj-usage-detail">
      <div><span>Vào (mới)</span><b>${nf.format(m.input)}</b></div><div><span>Đọc cache</span><b>${nf.format(m.cacheRead)}</b></div>
      <div><span>Ghi cache</span><b>${nf.format(m.cacheWrite)}</b></div><div><span>Ra (DJ viết)</span><b>${nf.format(m.output)}</b></div>
      <p>${models}</p><p>${costNote}</p></div></details>`;
}

// ---------- Hiển thị ----------
const djFormat = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
function djMsgHtml(m, i) {
  if (m.role === "user") return `<div class="dj-msg me">${djFormat(m.text)}</div>`;
  if (m.role === "dj") return `<div class="dj-msg bot">${djFormat(m.text)}</div>`;
  if (m.role === "tool") return `<div class="dj-step">${icon("spark")}${esc(m.text)}</div>`;
  if (m.role === "error") return `<div class="dj-msg err">${esc(m.text)}</div>`;
  if (m.role === "usage") return usageHtml(m);
  if (m.role === "play") {
    return `<div class="dj-card"><div class="dj-card-art">${playlistCover(m.uris.map(T).filter(Boolean))}</div>
      <div class="dj-card-body"><div class="dj-card-kind">${esc(m.kind)}</div><div class="dj-card-title">${esc(m.title)}</div>
      <div class="dj-card-sub">${m.uris.length} bài</div></div>
      <button class="pill sm" data-dj-save="${i}" title="Lưu thành playlist">${icon("plus")}Lưu</button></div>`;
  }
  return "";
}
function renderDj() {
  const box = $("#djMsgs");
  if (!box) return;
  let html;
  if (!djMsgs.length) {
    const ready = djInfo && djInfo.claude;
    html = `<div class="dj-hello">${icon("dj")}<h3>DJ của bạn</h3>
      <p>${ready ? "Kể tâm trạng hoặc muốn nghe gì, DJ tự chọn, xếp và mở nhạc." : djInfo ? "Cần cài Claude Code và đăng nhập (gõ /login) để dùng DJ." : "Đang kiểm tra Claude Code…"}</p>
      ${ready ? `<div class="dj-chips">${djSuggestions().map((s) => `<button data-dj-ask="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}</div>`;
  } else html = djMsgs.map(djMsgHtml).join("");
  if (djBusy) html += `<div class="dj-typing"><span class="dots"><i></i><i></i><i></i></span>DJ đang chọn nhạc…<button data-dj-stop>Dừng</button></div>`;
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
  $("#djSend").disabled = djBusy;
}

// ---------- Gửi tin ----------
async function djSend(text) {
  text = String(text || "").trim();
  if (!text || djBusy) return;
  if (document.body.classList.contains("np-open")) closeNowPlaying();
  if (!document.body.classList.contains("rp-open") || rpTab !== "dj") openPanel("dj");
  djMsgs.push({ role: "user", text });
  djBusy = true;
  renderDj();
  const r = await py("agent_send", text);
  if (!r || !r.ok) {
    djBusy = false;
    djMsgs.push({ role: "error", text: (r && r.error) || "Chỉ dùng được DJ trong app Nhạc." });
    renderDj();
  }
}
// Python gọi: sự kiện từ Claude Code
window.agentEvent = (ev) => {
  if (ev.type === "text") djMsgs.push({ role: "dj", text: ev.text });
  else if (ev.type === "tool") djMsgs.push({ role: "tool", text: ev.text });
  else if (ev.type === "error") djMsgs.push({ role: "error", text: ev.text });
  else if (ev.type === "usage") { djMsgs.push({ role: "usage", ...ev }); recordUsage(ev); }
  else if (ev.type === "limits") djLimits = ev;
  else if (ev.type === "done") djBusy = false;
  renderDj();
  renderDjTop();
  if (ev.type === "usage" && view.name === "settings") renderView(false);
};

// ---------- Công cụ phía giao diện mà DJ gọi ----------
const trackLine = (t) => (t ? { uri: t.file, title: t.title, artist: artistOf(t) } : null);
const rememberTracks = (tracks) => tracks.forEach((t) => known.set(t.file, { ...(known.get(t.file) || {}), ...t }));
const AGENT_TOOLS = {
  get_context() {
    const byPlays = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n);
    const artistCount = new Map();
    for (const [p, v] of byPlays) {
      const t = T(p);
      if (t && t.artist) artistCount.set(artistOf(t), (artistCount.get(artistOf(t)) || 0) + v.n);
    }
    return {
      now: new Date().toLocaleString("vi-VN", { weekday: "long", hour: "2-digit", minute: "2-digit" }),
      playing: intendPlay,
      nowPlaying: trackLine(T(curPath())),
      upcoming: Q.slice(qi + 1, qi + 11).map(T).map(trackLine).filter(Boolean),
      topArtists: [...artistCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, plays]) => ({ name, plays })),
      mostPlayed: byPlays.slice(0, 25).map(([p, v]) => ({ ...trackLine(T(p)), plays: v.n })).filter((t) => t.uri),
      recent: Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).slice(0, 15).map(([p]) => trackLine(T(p))).filter(Boolean),
      favorites: S.favorites.slice(0, 25).map(T).map(trackLine).filter(Boolean),
      playlists: S.playlists.map((p) => ({ name: p.name, tracks: p.tracks.length })),
      librarySize: library.length,
      settings: { repeat: S.settings.repeat, shuffle: S.settings.shuffle, autoplay: S.settings.autoplay !== false },
    };
  },
  play_tracks({ tracks, mode = "replace", title = "" }) {
    rememberTracks(tracks);
    const uris = tracks.map((t) => t.file);
    let kind = "Đang phát";
    if (mode === "append" && curPath()) {
      Q.push(...uris);
      kind = "Đã thêm vào hàng đợi";
    } else if (mode === "after_current" && curPath()) {
      Q = [...Q.slice(0, qi + 1), ...uris];
      origQ = null;
      radioStart = -1;
      kind = "Phát sau bài này";
      prefetchNext();
    } else {
      if (S.settings.shuffle) { // giữ đúng thứ tự DJ xếp theo mạch cảm xúc
        S.settings.shuffle = false;
        syncModes();
        save();
        toast("Đã tắt trộn bài để giữ thứ tự DJ xếp", 2500);
      }
      playList(uris, 0);
    }
    renderQueue();
    saveSession(true);
    djMsgs.push({ role: "play", kind, title: title || "Nhạc của DJ", uris });
    renderDj();
    return { ok: true, queued: uris.length, mode };
  },
  control({ action }) {
    ({ pause: () => pause(), resume: () => play(), next: () => next(), previous: () => prev() })[action]?.();
    return { ok: true, action };
  },
  save_playlist({ name, tracks }) {
    rememberTracks(tracks);
    const pl = createPlaylist(name, tracks.map((t) => t.file));
    if (view.name === "playlists") renderView(false);
    return { ok: true, name: pl.name, tracks: pl.tracks.length };
  },
  play_playlist({ name, shuffle = false }) {
    const key = plain(name);
    const pl = S.playlists.find((p) => plain(p.name) === key) || S.playlists.find((p) => plain(p.name).includes(key));
    if (!pl) return { ok: false, message: "Không có playlist này", available: S.playlists.map((p) => p.name) };
    const list = pl.tracks.filter(T);
    if (!list.length) return { ok: false, message: "Playlist trống" };
    playList(list, 0, { shuffle });
    return { ok: true, name: pl.name, tracks: list.length };
  },
  blocklist_changed({ names }) {
    djBlocked = names || [];
    if (view.name === "settings") renderView(false);
    return { ok: true };
  },
};
window.agentTool = (name, args) => {
  try {
    return AGENT_TOOLS[name] ? AGENT_TOOLS[name](args || {}) : { ok: false, message: `Không có công cụ ${name}` };
  } catch (e) {
    logJs(`agentTool ${name}: ${e && e.stack}`);
    return { ok: false, message: String(e) };
  }
};

// ---------- Bấm trong khung chat ----------
$("#rpDj").addEventListener("click", async (e) => {
  const ask = e.target.closest("[data-dj-ask]");
  if (ask) return djSend(ask.dataset.djAsk);
  if (e.target.closest("[data-dj-stop]")) return py("agent_cancel");
  if (e.target.closest("[data-dj-new]")) {
    if (djBusy) await py("agent_cancel");
    await py("agent_new");
    djMsgs.length = 0;
    djBusy = false;
    renderDj();
    $("#djInput").focus();
    return;
  }
  const sv = e.target.closest("[data-dj-save]");
  if (sv) {
    const m = djMsgs[+sv.dataset.djSave];
    const pl = createPlaylist(m.title, m.uris);
    toast(`Đã lưu “${pl.name}” (${pl.tracks.length} bài)`);
  }
});
const djInput = $("#djInput");
djInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const text = djInput.value;
    djInput.value = "";
    djInput.style.height = "";
    djSend(text);
  }
});
djInput.addEventListener("input", () => { djInput.style.height = ""; djInput.style.height = Math.min(djInput.scrollHeight, 120) + "px"; });
$("#djSend").addEventListener("click", () => { const text = djInput.value; djInput.value = ""; djSend(text); });

// Gợi ý trên trang chủ: bấm là mở DJ và gửi luôn
function djHomeHtml() {
  if (!djInfo || !djInfo.claude) return "";
  return `<div class="dj-home"><span class="dj-home-q">${icon("dj")}Hôm nay nghe gì?</span>${djSuggestions().map((s) => `<button class="pill sm" data-action="djAsk" data-text="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
}
ACTIONS.djAsk = (b) => djSend(b.dataset.text);

// ---------- Thông tin DJ & danh sách chặn (cho trang Cài đặt) ----------
async function loadDjInfo() {
  djInfo = await py("agent_info");
  djBlocked = (await py("blocklist_get")) || [];
  if (djInfo && djInfo.limits) djLimits = djInfo.limits;
  renderDj();
  renderDjTop();
  if (view.name === "settings" || view.name === "home") renderView(false);
}
