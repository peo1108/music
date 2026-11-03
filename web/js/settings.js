"use strict";

// =====================================================================================
// Trang Cài đặt & màn hình chào lần đầu mở app
// =====================================================================================
const switchHtml = (key) => `<label class="switch"><input type="checkbox" data-setting="${key}" ${S.settings[key] ? "checked" : ""}><span></span></label>`;
const setRow = (label, hint, control) =>
  `<div class="set-row"><div class="set-text"><div class="set-label">${label}</div>${hint ? `<div class="set-hint">${hint}</div>` : ""}</div><div class="set-ctl">${control}</div></div>`;
const setGroup = (title, rows) => `<section class="set-group"><h2>${title}</h2><div class="set-card">${rows.join("")}</div></section>`;
const btn = (action, label, accent = false) => `<button class="pill sm ${accent ? "accent" : ""}" data-action="${action}">${label}</button>`;
const KEYS = [
  ["Space", "Phát / dừng"], ["N / P", "Bài tiếp / bài trước"], ["← →", "Tua 5 giây (Shift: 30 giây)"], ["↑ ↓", "Âm lượng"],
  ["S", "Trộn bài"], ["R", "Lặp"], ["M", "Tắt tiếng"], ["F", "Màn hình Đang phát"], ["L", "Lời bài hát"], ["Q", "Hàng đợi"],
  ["E", "Âm thanh (EQ)"], ["Ctrl + F", "Tìm kiếm"],
];

// Áp các tuỳ chọn giao diện vào trang
function applyLook() {
  document.body.classList.toggle("motion", !!S.settings.motion);
  applyGlassAll();
}

function settingsHtml() {
  const i = appInfo || {};
  const tools = i.tools || {};
  const missing = Object.keys(tools).filter((k) => !tools[k]);
  const toolText = Object.entries(tools).map(([k, ok]) => `${TOOL_NAMES[k] || k} ${ok ? "✓" : "✗ chưa có"}`).join(" · ");
  return headerHtml({ title: "Cài đặt" })
    + setGroup("Thư viện", [
      setRow("Thư mục thư viện", `<span class="set-path">${esc(i.library || "")}</span>Bài lưu từ YouTube/SoundCloud cũng nằm ở đây.`,
        btn("openLibrary", "Mở") + btn("changeLibrary", "Đổi…")),
    ])
    + setGroup("Phát nhạc", [
      setRow("Tự phát bài liên quan", "Hết danh sách thì phát tiếp bài cùng gu (YouTube Mix / SoundCloud). Không chạy khi đang bật Lặp.", switchHtml("autoplay")),
      setRow("Ưu tiên bản offline", "Ẩn kết quả YouTube/SoundCloud trùng với bài đã có trong thư viện.", switchHtml("preferOffline")),
      setRow("Chuyển bài mượt & EQ", "Chỉnh trong bảng Âm thanh (phím E).", btn("openSound", "Mở")),
    ])
    + setGroup("Giao diện", [
      setRow("Hiệu ứng kính lỏng", "Tắt nếu máy bị chậm.", switchHtml("glass")),
      setRow("Nền chuyển động", "Đốm màu trôi chậm phía sau. Tốn GPU.", switchHtml("motion")),
    ])
    + setGroup("Cập nhật & công cụ", [
      setRow(`Nhạc ${esc(i.version || "")}`, esc(appStatus.update) || "App tự kiểm tra bản mới mỗi lần mở.", btn("checkUpdate", "Kiểm tra")),
      setRow("Bộ tải YouTube/SoundCloud", `yt-dlp ${esc(i.ytdlp || "?")}${appStatus.ytdlp ? ` · ${esc(appStatus.ytdlp)}` : ""}<br>YouTube hay thay đổi; app tự cập nhật phần này, không cần cài lại.`,
        i.frozen ? btn("updateYtdlp", "Cập nhật ngay") : `<span class="set-hint">Chạy từ mã nguồn: pip install -U yt-dlp</span>`),
      setRow("ffmpeg & Deno", `${toolText}<br>Cần để phát YouTube, vẽ dạng sóng và lưu mp3.`,
        missing.length ? (i.winget ? btn("installDeps", "Cài", true) : `<span class="set-hint">Cần winget</span>`) : `<span class="dl-ok">${icon("check")}</span>`),
    ])
    + setGroup("Hỗ trợ", [
      setRow("Nhật ký lỗi", "Gửi file trong thư mục này khi báo lỗi.", btn("openLogs", "Mở thư mục")),
      setRow("Dữ liệu cá nhân", "Playlist, yêu thích, lượt nghe và bản sao lưu hằng ngày.", btn("openData", "Mở thư mục")),
    ])
    + setGroup("Phím tắt", [`<div class="keys">${KEYS.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join("")}</div>`]);
}

function welcomeHtml() {
  const lib = (appInfo && appInfo.library) || "";
  return `<div class="welcome">
    <h1 class="greeting">Chào mừng đến với Nhạc</h1>
    <p class="welcome-sub">Nghe YouTube và SoundCloud không quảng cáo, lưu về máy để nghe offline, lời bài hát chạy theo nhạc.</p>
    <div class="welcome-steps">
      <div class="wstep"><div class="wnum">1</div><h3>Thư mục nhạc</h3>
        <p>Bài bạn lưu về máy sẽ nằm ở:</p><div class="set-path">${esc(lib)}</div>
        <div class="wact">${btn("changeLibrary", "Đổi thư mục…")}</div></div>
      <div class="wstep"><div class="wnum">2</div><h3>Mang playlist sang</h3>
        <p>Dán link playlist YouTube hoặc SoundCloud của bạn:</p>
        <input class="welcome-input" id="welcomeLink" placeholder="https://www.youtube.com/playlist?list=…" spellcheck="false">
        <div class="wact">${btn("welcomeLink", "Mở playlist", true)}</div></div>
      <div class="wstep"><div class="wnum">3</div><h3>Mẹo nhỏ</h3><ul>
        <li>Gõ tên bài ở ô tìm kiếm: tìm cả trong máy lẫn YouTube/SoundCloud.</li>
        <li>Chuột phải vào bài để lưu về máy hoặc thêm vào playlist.</li>
        <li><kbd>Space</kbd> phát/dừng · <kbd>F</kbd> màn hình Đang phát · <kbd>L</kbd> lời bài hát</li></ul></div>
    </div>
    <button class="pill accent" data-action="finishWelcome">Bắt đầu nghe</button></div>`;
}

// Lần đầu mở: máy mới tinh thì hiện màn hình chào; người đã dùng từ bản trước thì bỏ qua
function startView() {
  if (!S.settings.onboarded) {
    const used = Object.keys(S.plays).length || S.playlists.length || S.favorites.length || library.length;
    if (!used) return { name: "welcome" };
    S.settings.onboarded = true;
    save();
  }
  return { name: "home" };
}
function finishWelcome(next = { name: "home" }) {
  S.settings.onboarded = true;
  save();
  go(next);
}
function openWelcomeLink() {
  const url = ($("#welcomeLink") || {}).value || "";
  if (!isLink(url)) return toast("Dán link playlist YouTube hoặc SoundCloud");
  finishWelcome({ name: "link", url: url.trim() });
}

ACTIONS.changeLibrary = () => changeLibrary();
ACTIONS.openSound = () => toggleSound(true);
ACTIONS.checkUpdate = () => checkUpdate(true);
ACTIONS.updateYtdlp = () => updateYtdlp();
ACTIONS.installDeps = () => installDeps();
ACTIONS.openLogs = () => py("open_logs");
ACTIONS.openData = () => py("open_data");
ACTIONS.finishWelcome = () => finishWelcome();
ACTIONS.welcomeLink = () => openWelcomeLink();

content.addEventListener("change", (e) => {
  const key = e.target.dataset && e.target.dataset.setting;
  if (!key) return;
  S.settings[key] = e.target.checked;
  save();
  if (key === "glass" || key === "motion") applyLook();
  if (key === "autoplay") { renderQueue(); maybeExtendRadio(); }
});
content.addEventListener("keydown", (e) => {
  if (e.target.id === "welcomeLink" && e.key === "Enter") openWelcomeLink();
});
