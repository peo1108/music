"use strict";

// =====================================================================================
// Trang "Tải về": hàng tải nhạc về thư viện (Python tải 2 bài cùng lúc, trang này hỏi tiến độ)
// =====================================================================================
let dl = { done: 0, active: 0, jobs: [] };
let dlTimer = 0;
let dlShape = ""; // id + trạng thái các mục: đổi thì vẽ lại cả trang, không thì chỉ cập nhật thanh tiến độ
const LIBRARY_VIEWS = ["home", "songs", "albums", "artists", "album", "artist", "search", "favorites", "recent"];
const DL_STATUS = { queued: "Đang chờ", running: "Đang tải", done: "Xong", error: "Lỗi", canceled: "Đã huỷ" };

async function pollDownloads() {
  clearTimeout(dlTimer);
  dlTimer = 0;
  try {
    const d = await (await api("/api/downloads")).json();
    const finishedMore = d.done !== dl.done;
    await ensureKnown(d.jobs.map((j) => j.uri)); // tên, ảnh bìa của bài đang tải
    dl = d;
    $("#dlBadge").textContent = d.active || "";
    if (finishedMore) {
      await loadLibrary(); // bài vừa tải xong vào thư viện ngay
      if (LIBRARY_VIEWS.includes(view.name)) renderView(false);
    }
    if (view.name === "downloads") refreshDownloadsView();
  } catch {}
  if (dl.active || view.name === "downloads") dlTimer = setTimeout(pollDownloads, dl.active ? 1000 : 3000);
}
function ensureDlPolling() { if (!dlTimer) dlTimer = setTimeout(pollDownloads, 200); }

async function queueDownloads(uris) {
  const list = [...new Set(uris.filter(isOnline))];
  if (!list.length) return toast("Không có bài YouTube/SoundCloud nào để tải");
  try {
    const r = await postJson("/api/downloads", { action: "add", uris: list });
    if (!r || !r.ok) throw new Error();
    if (r.added) toast(`Đã thêm ${r.added} bài vào hàng tải${r.skipped ? ` (${r.skipped} bài đã có sẵn)` : ""}`, 2500);
    else toast(r.skipped ? "Các bài này đã có trong thư viện" : "Các bài này đang được tải");
    pollDownloads();
  } catch { toast("Không thêm được vào hàng tải"); }
}

function dlRow(j) {
  const t = T(j.uri) || {};
  const pct = j.status === "done" ? 100 : Math.round((j.progress || 0) * 100);
  const btn = j.status === "queued" || j.status === "running"
    ? `<button class="x" data-action="dlCancel" data-id="${j.id}" title="Huỷ">${icon("x")}</button>`
    : j.status === "done" ? `<span class="dl-ok">${icon("check")}</span>`
    : `<button class="pill sm" data-action="dlRetry" data-id="${j.id}">Thử lại</button>`;
  return `<div class="dl-row ${j.status}" data-job="${j.id}">
    <div class="thumb">${imgOr(t.cover ? t : null, "note")}</div>
    <div class="dl-main"><div class="dl-title">${esc(t.title || j.title)}</div><div class="dl-sub">${esc(t.artist || j.artist)}</div>
      <div class="dl-bar"><i style="width:${pct}%"></i></div></div>
    <div class="dl-status" title="${esc(j.error || "")}">${esc(dlStatus(j))}</div>${btn}</div>`;
}
const dlStatus = (j) => (j.status === "running" ? `${Math.round((j.progress || 0) * 100)}%` : j.status === "error" ? j.error || "Lỗi" : DL_STATUS[j.status]);

function downloadsHtml() {
  ensureDlPolling();
  const jobs = dl.jobs;
  dlShape = jobs.map((j) => j.id + j.status).join();
  const active = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const finished = jobs.length - active;
  let html = headerHtml({ title: "Tải về", kind: "Lưu vào thư viện", stats: jobs.length ? `${active} đang chờ/tải · ${finished} đã xong` : "" });
  html += `<div class="sfilters">${active ? `<button class="pill" data-action="dlCancelAll">${icon("x")}Huỷ tất cả</button>` : ""}`
    + `${finished ? `<button class="pill" data-action="dlClear">${icon("trash")}Xoá mục đã xong</button>` : ""}`
    + `<button class="pill" data-action="openLibrary">${icon("folder")}Mở thư mục thư viện</button></div>`;
  if (!jobs.length) {
    return html + `<div class="empty">Chưa có gì đang tải.<br>Chuột phải vào bài YouTube/SoundCloud → “Lưu vào thư viện”,<br>hoặc dán link playlist vào ô tìm kiếm → “Tải cả playlist”.</div>`;
  }
  return html + `<div class="dl-list">${jobs.map(dlRow).join("")}</div>`;
}
function refreshDownloadsView() {
  if (dl.jobs.map((j) => j.id + j.status).join() !== dlShape) return renderView(false);
  for (const j of dl.jobs) {
    const row = content.querySelector(`[data-job="${j.id}"]`);
    if (!row) continue;
    row.querySelector(".dl-bar i").style.width = (j.status === "done" ? 100 : Math.round((j.progress || 0) * 100)) + "%";
    setText(row.querySelector(".dl-status"), dlStatus(j));
  }
}

const dlAction = (body) => postJson("/api/downloads", body).then(pollDownloads).catch(() => toast("Không thực hiện được"));
ACTIONS.dlCancel = (b) => dlAction({ action: "cancel", id: +b.dataset.id });
ACTIONS.dlRetry = (b) => dlAction({ action: "retry", id: +b.dataset.id });
ACTIONS.dlCancelAll = () => dlAction({ action: "cancelAll" });
ACTIONS.dlClear = () => dlAction({ action: "clear" });
ACTIONS.openLibrary = () => py("open_library");
