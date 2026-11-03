"use strict";

// ---------- Tìm kiếm hợp nhất: thư viện + YouTube + SoundCloud ----------
const searchState = { q: "", yt: [], sc: [], pending: new Set(), errors: {}, filter: "all", seq: 0, abort: null };
let onlineTimer = 0;

function searchNorm(t) {
  const name = String(t.title || "").split(/\s*[|｜]\s*/)[0];
  return plain(`${name} ${t.artist || ""}`)
    .replace(/[\(\[][^\)\]]*[\)\]]/g, " ")
    .replace(/\b(official|mv|m\/v|lyric|lyrics|audio|video|music|remaster(ed)?|visuali[sz]er|vietsub|engsub)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function offlineMatches() {
  const keys = new Map();
  for (const t of library) {
    const key = searchNorm(t);
    if (key && !keys.has(key)) keys.set(key, t);
  }
  const out = new Set();
  for (const t of [...searchState.yt, ...searchState.sc]) {
    const local = keys.get(searchNorm(t));
    if (local && (!local.duration || !t.duration || Math.abs(local.duration - t.duration) <= 6)) out.add(t.file);
  }
  return out;
}
function sourceSection(name, list, pending, error, offset, offline) {
  const note = pending
    ? `<div class="src-note">Đang tìm trên ${name}…</div>`
    : error ? `<div class="src-note">${esc(error)}</div>` : "";
  const body = list.length ? songsHtml(list, { offset, offline }) : "";
  if (!note && !body) return "";
  return `<section class="section"><h2>${name}</h2>${note}${body}</section>`;
}
function loadOnlineSearch(text, seq) {
  const ctrl = new AbortController();
  searchState.abort = ctrl;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 15000);
  const jobs = ["yt", "sc"].map((src) =>
    api(`/api/search?src=${src}&q=${enc(text)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (seq !== searchState.seq) return;
        if (Array.isArray(data)) {
          data.forEach((t) => known.set(t.file, t));
          searchState[src] = data;
          delete searchState.errors[src];
        } else {
          searchState[src] = [];
          searchState.errors[src] = (data && data.error) || "Không tìm được.";
        }
      })
      .catch(() => {
        if (seq !== searchState.seq) return;
        searchState[src] = [];
        searchState.errors[src] = timedOut ? "Hết thời gian tìm kiếm." : "Không kết nối được.";
      })
      .finally(() => {
        if (seq !== searchState.seq) return;
        searchState.pending.delete(src);
        if (!searchState.pending.size) {
          searchState.abort = null;
          clearTimeout(timer);
        }
        if (view.name === "search" && view.q.trim() === text) renderView(false);
      }));
  return Promise.allSettled(jobs);
}
function searchHtml(q) {
  const text = (q || "").trim();
  if (searchState.q !== text) {
    clearTimeout(onlineTimer);
    if (searchState.abort) searchState.abort.abort();
    searchState.q = text;
    searchState.filter = "all";
    searchState.yt = [];
    searchState.sc = [];
    searchState.pending = new Set();
    searchState.errors = {};
    searchState.seq += 1;
    if (text.length >= 2) {
      const seq = searchState.seq;
      searchState.pending = new Set(["yt", "sc"]);
      onlineTimer = setTimeout(() => loadOnlineSearch(text, seq), 450);
    }
  }
  const k = plain(text);
  const songs = text ? library.filter((t) => plain(`${t.title} ${t.artist} ${t.album}`).includes(k)) : [];
  const al = text ? albums().filter((a) => plain(a.name + " " + a.artist).includes(k) && !a.single) : [];
  const ar = text ? artists().filter((a) => plain(a.name).includes(k)) : [];
  const f = searchState.filter;
  const showLocal = f === "all" || f === "local";
  const showYt = f === "all" || f === "yt";
  const showSc = f === "all" || f === "sc";
  const offline = offlineMatches();
  const pref = !!S.settings.preferOffline;
  const hiddenDups = pref ? [...searchState.yt, ...searchState.sc].filter((t) => offline.has(t.file)).length : 0;
  const ytAll = pref ? searchState.yt.filter((t) => !offline.has(t.file)) : searchState.yt;
  const scAll = pref ? searchState.sc.filter((t) => !offline.has(t.file)) : searchState.sc;
  const localSongs = showLocal ? songs : [];
  const ytList = showYt ? ytAll : [];
  const scList = showSc ? scAll : [];
  currentList = [...localSongs, ...ytList, ...scList];
  const total = songs.length + ytAll.length + scAll.length;
  const chip = (id, label, n) =>
    `<button class="pill ${f === id ? "accent" : ""}" data-sfilter="${id}">${label}${n ? ` (${n})` : ""}</button>`;
  let html = headerHtml({
    title: `Kết quả cho “${q}”`,
    stats: `${currentList.length} bài · ${fmtLong(currentList.reduce((s, t) => s + (t.duration || 0), 0))}`,
    actions: currentList.length > 0,
  });
  html += `<div class="sfilters">${chip("all", "Tất cả", total)}${chip("local", "Thư viện", songs.length)}${chip("yt", "YouTube", ytAll.length)}${chip("sc", "SoundCloud", scAll.length)}<button class="pill ${pref ? "accent" : ""}" data-prefer-offline>Ưu tiên offline</button></div>`;
  if (hiddenDups) html += `<div class="src-note">Đã ẩn ${hiddenDups} bản online trùng với thư viện.</div>`;
  let hasResults = false;
  if (showLocal && ar.length) {
    hasResults = true;
    html += `<section class="section"><h2>Ca sĩ</h2><div class="row-scroll">${ar.map(artistCard).join("")}</div></section>`;
  }
  if (showLocal && al.length) {
    hasResults = true;
    html += `<section class="section"><h2>Album</h2><div class="row-scroll">${al.map(albumCard).join("")}</div></section>`;
  }
  if (showLocal && localSongs.length) {
    hasResults = true;
    html += `<section class="section"><h2>Bài hát</h2>${songsHtml(localSongs, { offset: 0, offline })}</section>`;
  }
  const ytSection = sourceSection("YouTube", ytList, showYt && searchState.pending.has("yt"), showYt ? searchState.errors.yt : "", localSongs.length, offline);
  if (ytSection) {
    hasResults = true;
    html += ytSection;
  }
  const scSection = sourceSection("SoundCloud", scList, showSc && searchState.pending.has("sc"), showSc ? searchState.errors.sc : "", localSongs.length + ytList.length, offline);
  if (scSection) {
    hasResults = true;
    html += scSection;
  }
  if (!hasResults && !searchState.pending.size) html += `<div class="empty">Không tìm thấy gì.</div>`;
  return html;
}

const prepared = new Map();
function prepareOnline(p) {
  if (!isOnline(p)) return Promise.resolve(true);
  if (!prepared.has(p)) {
    const job = api("/api/prepare?p=" + enc(p))
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok) {
          if (d.info) known.set(p, d.info);
          return true;
        }
        prepared.delete(p);
        return false;
      })
      .catch(() => { prepared.delete(p); return false; });
    prepared.set(p, job);
  }
  return prepared.get(p);
}
function prefetchNext() {
  const next = Q[qi + 1];
  if (isOnline(next)) prepareOnline(next);
}
// Lưu 1 bài: đưa vào hàng tải chung (trang "Tải về")
const saveOffline = (p) => queueDownloads([p]);
