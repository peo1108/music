"use strict";

// =====================================================================================
// Dữ liệu lưu lại (yêu thích, danh sách phát, lượt nghe, cài đặt, phiên nghe)
// =====================================================================================
const DEFAULT_SETTINGS = { volume: 0.8, muted: false, eq: [0, 0, 0, 0, 0], shuffle: false, repeat: "off", crossfade: 4, glass: true, motion: false, preferOffline: false, autoplay: true, onboarded: false };
const S = { favorites: [], playlists: [], plays: {}, folders: [], settings: { ...DEFAULT_SETTINGS }, session: null,
  djStats: { days: {}, total: { tokens: 0, replies: 0, cost: 0 } } }; // token DJ đã dùng, theo ngày
let saveTimer = 0;
let stateLoaded = false; // chưa đọc xong dữ liệu cũ thì tuyệt đối không ghi, kẻo đè mất
function save(now = false) {
  if (!stateLoaded) return;
  clearTimeout(saveTimer);
  const send = () => api("/api/state", { method: "POST", body: JSON.stringify(S) }).catch(() => {});
  if (now) return send();
  saveTimer = setTimeout(send, 700);
}
async function loadState() {
  try {
    const s = await (await api("/api/state")).json();
    Object.assign(S, s);
    S.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    stateLoaded = true;
  } catch {}
}
const isFav = (p) => S.favorites.includes(p);
function toggleFav(p) {
  if (!p) return;
  const i = S.favorites.indexOf(p);
  if (i >= 0) S.favorites.splice(i, 1); else S.favorites.unshift(p);
  save();
  toast(i >= 0 ? "Đã bỏ khỏi Yêu thích" : "Đã thêm vào Yêu thích");
  syncFavButtons();
  $$(`.fav[data-p="${CSS.escape(p)}"]`).forEach((b) => { b.classList.toggle("on", i < 0); b.innerHTML = icon(i < 0 ? "heartFill" : "heart"); });
  if (view.name === "favorites") renderView(false);
}
