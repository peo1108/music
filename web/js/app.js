"use strict";

// =====================================================================================
// Ứng dụng: thư mục thư viện, cập nhật, công cụ còn thiếu (ffmpeg/Deno), nhật ký lỗi
// =====================================================================================

// Lỗi JS ghi vào file log của app -> người dùng gửi file log khi báo lỗi là đủ thông tin
const logJs = (msg) => { try { py("log_js", String(msg).slice(0, 4000)); } catch {} };
addEventListener("error", (e) => logJs(`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${(e.error && e.error.stack) || ""}`));
addEventListener("unhandledrejection", (e) => logJs(`Promise bị từ chối: ${(e.reason && (e.reason.stack || e.reason)) || ""}`));

// ---------- Thông báo nổi: mỗi lúc hiện 1 cái, theo thứ tự thêm vào ----------
const notices = new Map(); // key -> { html, actions: [{ label, accent, run }] }
const dismissed = new Set(); // đã bấm "Để sau" trong phiên này
function setNotice(key, n) {
  if (n && !dismissed.has(key)) notices.set(key, n);
  else notices.delete(key);
  renderNotice();
}
function dismissNotice(key) {
  dismissed.add(key);
  setNotice(key, null);
}
function renderNotice() {
  const box = $("#notice");
  const first = notices.entries().next().value;
  if (!first) { box.hidden = true; return; }
  const [key, n] = first;
  $("#noticeText").innerHTML = n.html;
  const acts = $("#noticeActions");
  acts.innerHTML = n.actions.map((a, i) => `<button class="pill sm ${a.accent ? "accent" : ""}" data-na="${i}">${esc(a.label)}</button>`).join("");
  acts.onclick = (e) => {
    const b = e.target.closest("[data-na]");
    if (b) n.actions[+b.dataset.na].run(key);
  };
  box.hidden = false;
}

// ---------- Thông tin app (trang Cài đặt hiển thị) ----------
let appInfo = null;
const appStatus = { update: "", ytdlp: "" }; // dòng trạng thái dưới mục Cập nhật
const rerenderSettings = () => { if (view.name === "settings" || view.name === "welcome") renderView(false); };
async function refreshAppInfo() {
  const info = await py("app_info");
  if (!info) return;
  appInfo = info;
  rerenderSettings();
}
async function changeLibrary() {
  const dir = await py("choose_library");
  if (!dir) return;
  await loadLibrary();
  renderSidebar();
  await refreshAppInfo();
  if (LIBRARY_VIEWS.includes(view.name)) renderView(false);
  toast("Đã đổi thư mục thư viện");
}

// ---------- Cập nhật từ GitHub Releases ----------
let updateInfo = null;
async function checkUpdate(force = false) {
  const setStatus = (s) => { appStatus.update = s; rerenderSettings(); };
  if (force) setStatus("Đang kiểm tra…");
  const u = await py("check_update", force);
  if (!u) { setStatus(""); return; }
  updateInfo = u;
  if (u.error) setStatus(force ? `Không kiểm tra được: ${u.error}` : "");
  else if (u.available) setStatus(`Có bản mới ${u.latest}`);
  else setStatus("Đang dùng bản mới nhất");
  if (!u.available) return;
  if (force) dismissed.delete("update");
  const actions = u.canInstall
    ? [{ label: "Cập nhật", accent: true, run: installUpdate }, { label: "Để sau", run: dismissNotice }]
    : [{ label: "Đóng", run: dismissNotice }];
  const how = u.canInstall ? "" : "<br>Đang chạy từ mã nguồn: dùng <b>git pull</b> để cập nhật.";
  setNotice("update", { html: `Có bản mới <b>${esc(u.latest)}</b> (đang dùng ${esc(u.current)}).${how}`, actions });
}
async function installUpdate() {
  setNotice("update", null);
  toast("Đang tải bản cập nhật…", 600000);
  saveSession(true);
  await save(true);
  const r = await py("install_update");
  if (!r || !r.ok) {
    toast((r && r.error) || "Không cập nhật được", 5000);
    return;
  }
  toast("Đang cài bản mới, app sẽ tự mở lại…", 600000);
}

// ---------- yt-dlp: bộ tải YouTube/SoundCloud, tự cập nhật không cần bản app mới ----------
async function updateYtdlp() {
  appStatus.ytdlp = "Đang kiểm tra…";
  rerenderSettings();
  const r = await py("update_ytdlp");
  appStatus.ytdlp = !r ? "" : r.error ? `Không cập nhật được: ${r.error}` : r.updated ? `Đã cập nhật lên ${r.version}` : "Đang dùng bản mới nhất";
  await refreshAppInfo();
  rerenderSettings();
}

// ---------- ffmpeg / Deno: thiếu thì YouTube, dạng sóng, lưu mp3 không chạy ----------
const TOOL_NAMES = { ffmpeg: "ffmpeg", deno: "Deno" };
async function checkDeps() {
  const d = await py("deps");
  if (!d) return;
  if (!d.missing.length) { setNotice("deps", null); return; }
  const names = d.missing.map((n) => TOOL_NAMES[n] || n).join(" và ");
  const why = "cần để phát YouTube, vẽ dạng sóng và lưu bài thành mp3.";
  if (!d.winget) {
    setNotice("deps", { html: `Thiếu <b>${esc(names)}</b>: ${why}<br>Máy chưa có winget, hãy cài “App Installer” từ Microsoft Store trước.`,
      actions: [{ label: "Đóng", run: dismissNotice }] });
    return;
  }
  setNotice("deps", {
    html: `Thiếu <b>${esc(names)}</b>: ${why}`,
    actions: [
      { label: "Cài ngay", accent: true, run: (key) => { dismissNotice(key); installDeps(); } },
      { label: "Để sau", run: dismissNotice },
    ],
  });
}
async function installDeps() {
  const ok = await py("install_deps");
  depsInstalling = !!ok;
  toast(ok ? "Đang cài trong cửa sổ dòng lệnh, xong thì quay lại app" : "Không mở được trình cài", 5000);
}
// Bấm "Cài ngay" rồi quay lại app thì kiểm tra lại (còn thiếu thì báo lại để cài tiếp)
let depsInstalling = false;
addEventListener("focus", () => {
  if (!depsInstalling) return;
  depsInstalling = false;
  dismissed.delete("deps");
  checkDeps();
  refreshAppInfo();
});

function initApp() {
  pyReady.then(async () => {
    refreshAppInfo();
    loadDjInfo();
    await checkDeps();
    setTimeout(() => checkUpdate(false), 4000);
  });
}
