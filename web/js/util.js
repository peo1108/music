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
// Gọi API của server nội bộ. Header X-Nhac là thứ trang web lạ không gửi được (bị chặn bởi CORS),
// server từ chối mọi /api/ thiếu header này -> trang khác mở trong trình duyệt không đụng được vào app.
const api = (url, opts = {}) => fetch(url, { ...opts, headers: { "X-Nhac": "1", ...(opts.headers || {}) } });
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };
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
