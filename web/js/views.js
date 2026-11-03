"use strict";

// =====================================================================================
// Các trang (Trang chủ, Bài hát, Album, Ca sĩ, Yêu thích, Danh sách phát...)
// =====================================================================================
let view = { name: "home" };
const backStack = [];
const content = $("#content");

function go(v, remember = true) {
  if (remember && ["album", "artist", "auto", "link"].includes(v.name)) backStack.push(view);
  else if (remember) backStack.length = 0;
  view = v;
  renderView();
  content.scrollTop = 0;
}
function goBack() { go(backStack.pop() || { name: "home" }, false); }

let currentList = [];
const currentListPaths = () => currentList.map((t) => t.file);

function renderView(animate = true) {
  const v = view;
  let html = "";
  currentList = [];
  if (v.name === "home") html = homeHtml();
  else if (v.name === "songs") { currentList = library; html = headerHtml({ title: "Bài hát", stats: statsText(library), actions: library.length }) + songsHtml(library); }
  else if (v.name === "albums") html = headerHtml({ title: "Album" }) + gridHtml(albums().map(albumCard));
  else if (v.name === "artists") html = headerHtml({ title: "Ca sĩ" }) + gridHtml(artists().map(artistCard));
  else if (v.name === "album") html = albumHtml(v.key);
  else if (v.name === "artist") html = artistHtml(v.key);
  else if (v.name === "favorites") {
    currentList = S.favorites.map(T).filter(Boolean);
    html = headerHtml({ title: "Yêu thích", kind: "Danh sách", art: `<div class="big-art" style="background:linear-gradient(135deg,rgba(var(--accent-rgb),1),rgba(var(--c2),1))">${icon("heartFill")}</div>`, stats: statsText(currentList), actions: currentList.length })
      + (currentList.length ? songsHtml(currentList) : `<div class="empty">Bấm ♡ cạnh bài hát để thêm vào đây.</div>`);
  } else if (v.name === "recent") {
    currentList = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean).slice(0, 100);
    html = headerHtml({ title: "Nghe gần đây", stats: statsText(currentList), actions: currentList.length })
      + (currentList.length ? songsHtml(currentList) : `<div class="empty">Chưa nghe bài nào.</div>`);
  } else if (v.name === "playlist") html = playlistHtml(v.id);
  else if (v.name === "folder") html = folderHtml();
  else if (v.name === "playlists") html = playlistsHtml();
  else if (v.name === "auto") html = autoHtml(v.key);
  else if (v.name === "search") html = searchHtml(v.q);
  else if (v.name === "link") html = linkHtml(v.url);
  else if (v.name === "downloads") html = downloadsHtml();
  else if (v.name === "settings") html = settingsHtml();
  else if (v.name === "welcome") html = welcomeHtml();
  content.innerHTML = `<div class="view" ${animate ? "" : 'style="animation:none"'}>${html}</div>`;
  markNav();
  markPlaying();
}

function statsText(list) {
  const total = list.reduce((s, t) => s + (t.duration || 0), 0);
  return `${list.length} bài · ${fmtLong(total)}`;
}
function headerHtml({ title, kind = "", by = "", byView = "", stats = "", art = "", actions = false, extra = "", back = false }) {
  return `${back ? `<button class="back" data-back>${icon("left")}Quay lại</button>` : ""}
  <header class="vhead">${art}
    <div style="min-width:0">${kind ? `<div class="kind">${kind}</div>` : ""}<h1>${esc(title)}</h1>
      ${by ? `<div class="by" ${byView}>${esc(by)}</div>` : ""}
      ${stats ? `<div class="stats">${stats}</div>` : ""}
      ${actions ? `<div class="actions"><button class="pill accent" data-play-all>${icon("play")}Phát</button><button class="pill" data-shuffle-all>${icon("shuffle")}Ngẫu nhiên</button><button class="pill" data-add-all title="Thêm tất cả vào playlist">${icon("plus")}</button>${extra}</div>` : ""}
    </div></header>`;
}
function sourceBadge(t) {
  if (!isOnline(t.file)) return "";
  if (t.file.startsWith("yt:")) return `<span class="src yt">YouTube</span>`;
  if (t.file.startsWith("sc:")) return `<span class="src sc">SoundCloud</span>`;
  return "";
}
function songsHtml(list, { album = true, removable = false, offset = 0, offline = null } = {}) {
  return `<div class="songs">${list.map((t, i) => {
    const n = offset + i;
    const dup = offline && offline.has(t.file)
      ? `<span class="src off" title="Đã có trong thư viện">Có bản offline</span>` : "";
    return `
    <div class="srow ${album ? "" : "noalbum"}" draggable="true" data-p="${esc(t.file)}" data-i="${n}" data-n="${n + 1}" style="--i:${n}" ${removable ? "data-removable" : ""}>
      <div class="num"><span class="n">${n + 1}</span><span class="pbtn">${icon("play")}</span></div>
      <div class="thumb">${t.cover ? `<img loading="lazy" src="${coverUrl(t.file)}" alt="" draggable="false">` : icon("note")}</div>
      <div class="st"><span class="tname">${esc(t.title)}</span>${sourceBadge(t)}${dup}</div>
      <div class="sa" data-artist="${esc(plain(artistOf(t)))}">${esc(artistOf(t))}</div>
      ${album ? `<div class="sb" data-album="${esc(plain(t.album || t.title) + "|" + plain(artistOf(t)))}">${esc(t.album || "")}</div>` : ""}
      <button class="fav ${isFav(t.file) ? "on" : ""}" data-p="${esc(t.file)}">${icon(isFav(t.file) ? "heartFill" : "heart")}</button>
      <div class="dur">${fmt(t.duration)}</div>
    </div>`; }).join("")}</div>`;
}
function gridHtml(cards) { return cards.length ? `<div class="grid">${cards.join("")}</div>` : `<div class="empty">Chưa có gì ở đây.</div>`; }
function cardHtml({ art, title, sub, attrs, round = false, i = 0 }) {
  return `<div class="card ${round ? "round" : ""}" draggable="true" ${attrs} style="--i:${i}">
    <div class="art">${art}<button class="cplay glass" data-cplay>${icon("play")}</button></div>
    <div class="ct">${esc(title)}</div><div class="cs">${esc(sub)}</div></div>`;
}
const imgOr = (t, ic) => (t ? `<img loading="lazy" src="${coverUrl(t.file)}" alt="" draggable="false">` : icon(ic));
function albumCard(a, i) {
  return cardHtml({ art: imgOr(firstCover(a.tracks), "disc"), title: a.name, sub: a.single ? `${a.artist} · Đĩa đơn` : a.artist, attrs: `data-album="${esc(a.key)}"`, i });
}
function artistCard(a, i) {
  return cardHtml({ art: imgOr(firstCover(a.tracks), "mic"), title: a.name, sub: `${a.tracks.length} bài`, attrs: `data-artist="${esc(a.key)}"`, round: true, i });
}
function trackCard(t, i) {
  return cardHtml({ art: imgOr(t.cover ? t : null, "note"), title: t.title, sub: artistOf(t), attrs: `data-track="${esc(t.file)}"`, i });
}

function homeHtml() {
  const h = new Date().getHours();
  const hello = h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  if (!library.length) {
    return `<h1 class="greeting">${hello}</h1><div class="empty">Thư viện chưa có bài nào.<br>Tìm bài trên YouTube/SoundCloud ở ô tìm kiếm rồi chuột phải → “Lưu vào thư viện”,<br>hoặc mở một thư mục nhạc có sẵn ở thanh bên.</div>`;
  }
  const recent = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean).slice(0, 14);
  const most = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n).slice(0, 8)
    .map(([p, v]) => [T(p), v.n]).filter(([t]) => t);
  const fresh = library.slice().sort((a, b) => b.added - a.added).slice(0, 14);
  let html = `<h1 class="greeting">${hello}</h1>${djHomeHtml()}`;
  if (recent.length) html += `<section class="section"><h2>Nghe gần đây</h2><div class="row-scroll">${recent.map(trackCard).join("")}</div></section>`;
  if (most.length) {
    html += `<section class="section"><h2>Nghe nhiều nhất</h2><div class="top-list">${most.map(([t, n], i) => `
      <div class="top-item" data-track="${esc(t.file)}" style="--i:${i}"><div class="rank">${i + 1}</div>
      <div class="thumb">${imgOr(t.cover ? t : null, "note")}</div>
      <div style="min-width:0"><div class="tt">${esc(t.title)}</div><div class="ts">${esc(artistOf(t))}</div></div>
      <div class="cnt">${n} lượt</div></div>`).join("")}</div></section>`;
  }
  html += `<section class="section"><h2>Mới thêm</h2><div class="row-scroll">${fresh.map(trackCard).join("")}</div></section>`;
  const al = albums().slice(0, 14);
  if (al.length) html += `<section class="section"><h2>Album</h2><div class="row-scroll">${al.map(albumCard).join("")}</div></section>`;
  return html;
}
function albumHtml(key) {
  const a = albums().find((x) => x.key === key);
  if (!a) return `<div class="empty">Không tìm thấy album.</div>`;
  currentList = a.tracks;
  const year = (a.tracks.find((t) => t.year) || {}).year;
  return headerHtml({ back: true, title: a.name, kind: a.single ? "Đĩa đơn" : "Album", by: a.artist, byView: `data-artist="${esc(plain(a.artist))}"`,
    art: `<div class="big-art">${imgOr(firstCover(a.tracks), "disc")}</div>`, stats: [year, statsText(a.tracks)].filter(Boolean).join(" · "), actions: true })
    + songsHtml(a.tracks, { album: false });
}
function artistHtml(key) {
  const a = artists().find((x) => x.key === key);
  if (!a) return `<div class="empty">Không tìm thấy ca sĩ.</div>`;
  currentList = a.tracks;
  const al = albums(a.tracks);
  return headerHtml({ back: true, title: a.name, kind: "Ca sĩ", art: `<div class="big-art round">${imgOr(firstCover(a.tracks), "mic")}</div>`, stats: statsText(a.tracks), actions: true })
    + (al.length > 1 ? `<section class="section"><h2>Album</h2><div class="row-scroll">${al.map(albumCard).join("")}</div></section>` : "")
    + `<section class="section"><h2>Bài hát</h2>${songsHtml(a.tracks)}</section>`;
}
function playlistHtml(id) {
  const pl = S.playlists.find((x) => x.id === id);
  if (!pl) return `<div class="empty">Danh sách phát không còn.</div>`;
  currentList = pl.tracks.map(T).filter(Boolean);
  const art = `<div class="big-art">${playlistCover(currentList)}</div>`;
  const hasOnline = pl.tracks.some(isOnline);
  const extra = (pl.source ? `<button class="pill" data-action="refreshSource" data-id="${id}" title="Lấy thêm bài mới từ playlist gốc">${icon("repeat")}Cập nhật từ nguồn</button>` : "")
    + (hasOnline ? `<button class="pill" data-action="playlistDownload" data-id="${id}">${icon("download")}Tải về máy</button>` : "")
    + `<button class="pill" data-rename="${id}">${icon("pencil")}Đổi tên</button><button class="pill" data-pl-menu="${id}">${icon("more")}Khác</button>`;
  return headerHtml({ title: pl.name, kind: pl.source ? `Danh sách phát · từ ${/soundcloud/i.test(pl.source) ? "SoundCloud" : "YouTube"}` : "Danh sách phát", art, stats: statsText(currentList), actions: true, extra })
    + (currentList.length ? songsHtml(currentList, { removable: true }) : `<div class="empty">Chuột phải vào bài bất kỳ → “Thêm vào danh sách phát”.</div>`);
}
function folderHtml() {
  if (!openedFolder) return `<div class="empty">Chưa mở thư mục nào.</div>`;
  currentList = openedFolder.tracks;
  return headerHtml({ title: openedFolder.name, kind: "Thư mục", art: `<div class="big-art">${icon("folder")}</div>`, stats: esc(openedFolder.dir) + "<br>" + statsText(currentList), actions: currentList.length })
    + (currentList.length ? songsHtml(currentList) : `<div class="empty">Thư mục này không có file nhạc.</div>`);
}

function playlistCover(tracks) {
  const covers = [...new Set(tracks.map((t) => (t && t.cover ? t.file : null)).filter(Boolean))].slice(0, 4);
  if (!covers.length) return icon("list");
  if (covers.length < 4) return `<img loading="lazy" src="${coverUrl(covers[0])}" alt="">`;
  return `<div class="mosaic">${covers.map((p) => `<img loading="lazy" src="${coverUrl(p)}" alt="">`).join("")}</div>`;
}
function miniCover(pl) {
  const covers = [...new Set(pl.tracks.map(T).filter((t) => t && t.cover).map((t) => t.file))].slice(0, 4);
  if (!covers.length) return `<span class="plcover">${icon("list")}</span>`;
  if (covers.length < 4) return `<span class="plcover"><img loading="lazy" src="${coverUrl(covers[0])}" alt=""></span>`;
  return `<span class="plcover"><span class="pgrid">${covers.map((p) => `<img loading="lazy" src="${coverUrl(p)}" alt="">`).join("")}</span></span>`;
}
function uniqTracks(list) {
  const seen = new Set();
  return list.filter((t) => {
    if (!t || seen.has(t.file)) return false;
    seen.add(t.file);
    return true;
  });
}
function topArtistByPlays() {
  const counts = new Map();
  for (const [p, v] of Object.entries(S.plays)) {
    const t = T(p);
    if (!t) continue;
    const a = artistOf(t);
    if (a && a !== "Không rõ ca sĩ") counts.set(a, (counts.get(a) || 0) + (v.n || 1));
  }
  if (!counts.size) {
    for (const t of library) {
      const a = artistOf(t);
      if (a && a !== "Không rõ ca sĩ") counts.set(a, (counts.get(a) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}
function autoPlaylists() {
  const recent = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean);
  const most = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n).map(([p]) => T(p)).filter(Boolean);
  const fresh = library.slice().sort((a, b) => (b.added || 0) - (a.added || 0));
  const unplayed = library.filter((t) => !S.plays[t.file]);
  const online = uniqTracks([...S.favorites, ...S.playlists.flatMap((pl) => pl.tracks), ...Object.keys(S.plays)]
    .map(T).filter((t) => t && isOnline(t.file)));
  return [
    { key: "recent", name: "Nghe gần đây", icon: "clock", tracks: uniqTracks(recent).slice(0, 50) },
    { key: "most", name: "Nghe nhiều", icon: "spark", tracks: uniqTracks(most).slice(0, 40) },
    { key: "fresh", name: "Mới thêm", icon: "note", tracks: fresh.slice(0, 40) },
    { key: "unplayed", name: "Chưa nghe", icon: "disc", tracks: unplayed.slice(0, 50) },
    { key: "online", name: "Online đã lưu", icon: "globe", tracks: online },
  ].filter((a) => a.tracks.length);
}
function suggestPlaylists() {
  const recent = Object.entries(S.plays).sort((a, b) => b[1].last - a[1].last).map(([p]) => T(p)).filter(Boolean);
  const most = Object.entries(S.plays).filter(([, v]) => v.n > 0).sort((a, b) => b[1].n - a[1].n).map(([p]) => T(p)).filter(Boolean);
  const out = [];
  const top = topArtistByPlays();
  if (top) {
    const tracks = uniqTracks([...library, ...recent]).filter((t) => artistOf(t) === top).slice(0, 30);
    if (tracks.length >= 3) out.push({ key: "artist", name: `${top} tuyển tập`, hint: `${tracks.length} bài · gu của bạn`, tracks });
  }
  const forgotten = library.filter((t) => {
    const p = S.plays[t.file];
    return !p || Date.now() - p.last > 30 * 86400000;
  });
  if (forgotten.length >= 3) out.push({ key: "forgotten", name: "Bài bỏ quên", hint: `${forgotten.length} bài lâu chưa nghe`, tracks: forgotten.slice(0, 40) });
  const mix = uniqTracks([...recent.slice(0, 8), ...most.slice(0, 8)]).slice(0, 20);
  if (mix.length >= 5) out.push({ key: "mix", name: "Trộn gu của bạn", hint: "Gần đây + nghe nhiều", tracks: mix });
  return out.slice(0, 3);
}
function autoCard(a, i) {
  return cardHtml({ art: playlistCover(a.tracks), title: a.name, sub: `${a.tracks.length} bài`, attrs: `data-auto="${a.key}"`, i });
}
function suggCard(s, i) {
  return `<div class="card sugg" draggable="false" data-sugg="${s.key}" style="--i:${i}">
    <div class="art">${playlistCover(s.tracks)}<button class="cplay glass" data-cplay>${icon("play")}</button></div>
    <div class="ct">${esc(s.name)}</div><div class="cs">${esc(s.hint)}</div>
    <button class="pill accent sugg-save" data-save-sugg="${s.key}">${icon("plus")}Lưu</button></div>`;
}
function playlistCard(pl, i) {
  const tracks = pl.tracks.map(T).filter(Boolean);
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);
  return cardHtml({ art: playlistCover(tracks), title: pl.name, sub: `${pl.tracks.length} bài · ${fmtLong(total)}`, attrs: `data-playlist="${pl.id}"`, i });
}
function playlistsHtml() {
  const auto = autoPlaylists();
  const sugg = suggestPlaylists();
  let html = headerHtml({ title: "Playlist", kind: "Bộ sưu tập", stats: `${S.playlists.length} playlist · ${auto.length} tự động` });
  html += `<div class="sfilters"><button class="pill accent" data-new-playlist>${icon("plus")}Playlist mới</button>${auto.length || sugg.length ? `<button class="pill" data-materialize-all>${icon("spark")}Tạo từ gợi ý</button>` : ""}</div>`;
  if (auto.length) html += `<section class="section"><h2>Tự động</h2><div class="row-scroll">${auto.map(autoCard).join("")}</div></section>`;
  if (sugg.length) html += `<section class="section"><h2>Gợi ý cho bạn</h2><div class="row-scroll">${sugg.map(suggCard).join("")}</div></section>`;
  html += `<section class="section"><h2>Của bạn</h2>${S.playlists.length ? `<div class="row-scroll">${S.playlists.map(playlistCard).join("")}</div>` : `<div class="empty">Chưa có playlist. Bấm “Playlist mới” hoặc lưu hàng đợi.</div>`}</section>`;
  return html;
}
function autoHtml(key) {
  const a = autoPlaylists().find((x) => x.key === key);
  if (!a) return `<div class="empty">Playlist tự động này không còn dữ liệu.</div>`;
  currentList = a.tracks;
  return headerHtml({ back: true, title: a.name, kind: "Playlist tự động", art: `<div class="big-art">${playlistCover(a.tracks)}</div>`,
    stats: statsText(a.tracks), actions: true, extra: `<button class="pill" data-save-auto="${key}">${icon("plus")}Lưu thành playlist</button>` })
    + songsHtml(a.tracks);
}
function saveGroup(key, groups) {
  const g = groups.find((x) => x.key === key);
  if (!g) return;
  const pl = createPlaylist(g.name, g.tracks.map((t) => t.file));
  toast(`Đã tạo “${pl.name}”`);
  if (view.name === "playlists" || view.name === "auto") renderView(false);
}
function materializeAll() {
  const groups = [...autoPlaylists(), ...suggestPlaylists()];
  let n = 0;
  for (const g of groups) {
    createPlaylist(g.name, g.tracks.map((t) => t.file));
    n++;
  }
  toast(`Đã tạo ${n} playlist từ gợi ý`);
  if (view.name === "playlists") renderView(false);
}
