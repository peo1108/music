"use strict";

// =====================================================================================
// Bảng phải: Tiếp theo (kéo thả đổi thứ tự) / Lời bài hát
// =====================================================================================
let rpTab = "queue";
function openPanel(tab) {
  const open = document.body.classList.contains("rp-open");
  if (open && rpTab === tab) document.body.classList.remove("rp-open");
  else { rpTab = tab; document.body.classList.add("rp-open"); }
  $$("#rpTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === rpTab));
  $("#rpQueue").hidden = rpTab !== "queue";
  $("#rpLyrics").hidden = rpTab !== "lyrics";
  $("#rpDj").hidden = rpTab !== "dj";
  const isOpen = document.body.classList.contains("rp-open");
  $("#queueBtn").classList.toggle("on", isOpen && rpTab === "queue");
  $("#lyricsBtn").classList.toggle("on", isOpen && rpTab === "lyrics");
  $("#djBtn").classList.toggle("on", isOpen && rpTab === "dj");
  if (isOpen && rpTab === "dj") { renderDj(); setTimeout(() => $("#djInput").focus(), 60); }
  lyrIdx = -2;
  redraw();
  renderQueue();
}
$$("#rpTabs button").forEach((b) => b.addEventListener("click", () => { rpTab = b.dataset.tab; document.body.classList.remove("rp-open"); openPanel(rpTab); }));

// Tab Lời bài hát / Tiếp theo trong màn hình Đang phát
let npTab = "lyrics";
function setNpTab(tab) {
  npTab = tab;
  $$("#npTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#npLyrics").hidden = tab !== "lyrics";
  $("#npQueueWrap").hidden = tab !== "queue";
  lyrIdx = -2;
  redraw();
  renderQueue();
}
$$("#npTabs button").forEach((b) => b.addEventListener("click", () => setNpTab(b.dataset.tab)));

function renderQueue() {
  const body = document.body.classList;
  const boxes = [];
  if (body.contains("rp-open") && rpTab === "queue") boxes.push($("#rpQueue"));
  if (body.contains("np-open") && npTab === "queue") boxes.push($("#npQueue"));
  if (boxes.length) {
    const html = queueHtml();
    boxes.forEach((box) => { box.innerHTML = html; });
  }
}
function queueHtml() {
  const nowT = T(curPath());
  if (!nowT) return `<div class="empty">Hàng đợi trống.</div>`;
  const item = (t, i, now) => `<div class="q-item ${now ? "now" : ""}" ${now ? "" : 'draggable="true"'} data-qi="${i}">
      <div class="thumb" style="width:38px;height:38px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.07);display:grid;place-items:center">${imgOr(t.cover ? t : null, "note")}</div>
      <div style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
      <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(artistOf(t))}</div></div>
      ${now ? "" : `<button class="x" data-rm="${i}" title="Bỏ khỏi hàng đợi">${icon("x")}</button>`}</div>`;
  const upcoming = Q.slice(qi + 1, qi + 201).map((p, k) => [T(p), qi + 1 + k]).filter(([t]) => t);
  const tools = `<div class="q-tools"><button class="pill" data-queue-save>${icon("plus")}Lưu thành playlist</button><button class="pill" data-queue-add>${icon("addQ")}Thêm vào playlist</button></div>`;
  return `${tools}<div class="q-head">Đang phát</div>${item(nowT, qi, true)}
    <div class="q-head">Tiếp theo ${upcoming.length ? `<button data-clearq>Xoá hết</button>` : ""}</div>
    ${upcoming.length ? upcoming.map(([t, i]) => (i === radioStart ? RADIO_HEAD : "") + item(t, i, false)).join("") : `<div class="empty" style="padding:20px">Không còn bài nào.</div>`}
    ${radioEnabled() ? `<div class="q-note">${icon("spark")}Hết danh sách sẽ tự phát bài liên quan</div>` : ""}`;
}
const RADIO_HEAD = `<div class="q-head">Tự động phát <span class="q-sub">bài liên quan</span></div>`;
let dragQi = null;
for (const qBox of [$("#rpQueue"), $("#npQueue")]) {
  qBox.addEventListener("click", (e) => {
    if (e.target.closest("[data-queue-save]")) { saveQueuePlaylist(); return; }
    if (e.target.closest("[data-queue-add]")) { addManyToPlaylist(Q, e); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) { const i = +rm.dataset.rm; Q.splice(i, 1); if (i < radioStart) radioStart--; renderQueue(); saveSession(true); return; }
    if (e.target.closest("[data-clearq]")) { Q = Q.slice(0, qi + 1); radioStart = -1; renderQueue(); saveSession(true); return; }
    const it = e.target.closest(".q-item:not(.now)");
    if (it) { qi = +it.dataset.qi; startTrack(); }
  });
  qBox.addEventListener("dragstart", (e) => {
    const it = e.target.closest(".q-item");
    if (!it) return;
    dragQi = +it.dataset.qi;
    dragPath = Q[dragQi] || null;
    dragFromPlaylist = null;
    dragPlaylistId = null;
    it.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  qBox.addEventListener("dragover", (e) => {
    const it = e.target.closest(".q-item:not(.now)");
    if (dragQi === null || !it) return;
    e.preventDefault();
    $$(".q-item.over", qBox).forEach((x) => x.classList.remove("over"));
    it.classList.add("over");
  });
  qBox.addEventListener("drop", (e) => {
    const it = e.target.closest(".q-item:not(.now)");
    if (dragQi === null || !it) return;
    e.preventDefault();
    const to = +it.dataset.qi;
    const [p] = Q.splice(dragQi, 1);
    Q.splice(to > dragQi ? to - 1 : to, 0, p);
    dragQi = null;
    renderQueue();
    saveSession(true);
  });
  qBox.addEventListener("dragend", () => { dragQi = null; dragPath = null; renderQueue(); });
}
