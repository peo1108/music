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
  ["E", "Âm thanh (EQ)"], ["D", "Chat với DJ"], ["Ctrl + F", "Tìm kiếm"],
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
    + setGroup("DJ (chat chọn nhạc)", [
      setRow("Claude Code", djInfo && djInfo.claude
        ? `Đã tìm thấy. DJ dùng gói Claude đang đăng nhập trong Claude Code.<span class="set-path">${esc(djInfo.claude)}</span>`
        : "Chưa có. Cài Claude Code rồi mở nó, gõ /login để đăng nhập.", djInfo && djInfo.claude ? `<span class="dl-ok">${icon("check")}</span>` : ""),
      setRow("Model", "Model DJ dùng để suy nghĩ. Để Mặc định là dùng model bạn đang chọn trong Claude Code.",
        `<select class="set-select" data-agent-model>${[["", "Mặc định"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]]
          .map(([v, l]) => `<option value="${v}" ${(djInfo && djInfo.model) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`),
      setRow("API key riêng (không bắt buộc)", djInfo && djInfo.hasKey ? "Đang dùng API key đã nhập thay cho gói Claude." : "Cho ai không có gói Claude: dán API key của mình vào đây.",
        `<input class="set-input" type="password" id="agentKey" placeholder="sk-ant-…" spellcheck="false">${btn("saveAgentKey", "Lưu")}${djInfo && djInfo.hasKey ? btn("clearAgentKey", "Xoá") : ""}`),
    ])
    + setGroup("Không bao giờ phát", [
      `<div class="block-box"><div class="set-hint">Bài của ca sĩ/từ khoá dưới đây bị loại khỏi tìm kiếm, link, tự phát tiếp và mọi thứ DJ mở, kể cả bài hát cùng (feat) và cover.</div>
        <div class="block-chips">${djBlocked.length ? djBlocked.map((n) => `<span class="block-chip">${esc(n)}<button data-action="unblock" data-name="${esc(n)}" title="Bỏ chặn">${icon("x")}</button></span>`).join("") : `<span class="set-hint">Chưa chặn ai.</span>`}</div>
        <div class="block-add"><input class="set-input" id="blockInput" placeholder="Tên ca sĩ hoặc từ khoá…" spellcheck="false">${btn("blockAdd", "Chặn")}</div></div>`,
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

// ---------- DJ & danh sách chặn ----------
async function setAgent(changes) {
  djInfo = (await py("agent_settings", changes.model ?? null, changes.apiKey ?? null)) || djInfo;
  renderView(false);
}
ACTIONS.saveAgentKey = async () => {
  const key = ($("#agentKey") || {}).value || "";
  if (!key.trim()) return toast("Dán API key vào ô trước đã");
  await setAgent({ apiKey: key });
  toast("Đã lưu API key cho DJ");
};
ACTIONS.clearAgentKey = async () => { await setAgent({ apiKey: "" }); toast("DJ sẽ dùng gói Claude"); };
async function addBlock() {
  const input = $("#blockInput");
  const name = input && input.value.trim();
  if (!name) return;
  djBlocked = (await py("blocklist_add", name)) || djBlocked;
  renderView(false);
  toast(`Sẽ không bao giờ phát ${name}`);
}
ACTIONS.blockAdd = () => addBlock();
ACTIONS.unblock = async (b) => {
  djBlocked = (await py("blocklist_remove", b.dataset.name)) || djBlocked;
  renderView(false);
};

content.addEventListener("change", (e) => {
  if (e.target.matches("[data-agent-model]")) return setAgent({ model: e.target.value });
  const key = e.target.dataset && e.target.dataset.setting;
  if (!key) return;
  S.settings[key] = e.target.checked;
  save();
  if (key === "glass" || key === "motion") applyLook();
  if (key === "autoplay") { renderQueue(); maybeExtendRadio(); }
});
content.addEventListener("keydown", (e) => {
  if (e.target.id === "welcomeLink" && e.key === "Enter") openWelcomeLink();
  if (e.target.id === "blockInput" && e.key === "Enter") addBlock();
});
