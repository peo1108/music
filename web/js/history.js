"use strict";

// =====================================================================================
// Nhật ký nghe (để DJ hiểu thói quen + trang Nhìn lại), 👍/👎, hẹn giờ tắt nhạc
// =====================================================================================
let playLog = null; // lượt đang nghe: {uri, t, sec, dur, via, lastPos}
let lastLogTick = 0;
const djPicked = new Set(); // bài do DJ xếp -> đánh dấu "dj" trong nhật ký

const viaOf = (path, index) => (djPicked.has(path) ? "dj" : radioStart >= 0 && index >= radioStart ? "radio" : "user");

function entryOf(l, closing) {
  const t = T(l.uri) || {};
  const dur = l.dur || t.duration || 0;
  const done = dur > 0 && (l.lastPos >= dur - Math.max(6, (S.settings.crossfade || 0) + 3) || l.sec >= dur * 0.85);
  // Tắt app giữa bài không phải "bỏ qua"; chuyển bài khi mới nghe < 30 giây mới tính
  const skip = !closing && !done && l.sec < 30 && (!dur || l.sec < dur * 0.5);
  return { t: l.t, uri: l.uri, title: t.title || "", artist: t.artist || "", src: isOnline(l.uri) ? l.uri.slice(0, 2) : "local",
    via: l.via, sec: Math.round(l.sec * 10) / 10, dur: Math.round(dur), skip, done };
}
// noSkip: không tính là bỏ qua (đang tạm dừng / tắt app); beacon: gửi lúc trang đóng
function flushLog(noSkip = false, beacon = false) {
  const l = playLog;
  playLog = null;
  if (!l || l.sec < 2) return;
  const body = JSON.stringify([entryOf(l, noSkip)]);
  if (beacon) navigator.sendBeacon("/api/history/log", body);
  else api("/api/history/log", { method: "POST", body }).catch(() => {});
}
function logTick() {
  const now = Date.now(), d = cur(), el = d.el;
  const playing = intendPlay && !el.paused && !!d.path;
  if (playing && (!playLog || playLog.uri !== d.path)) {
    // Chỉ tính "bỏ qua" khi chuyển bài lúc bài cũ đang phát; dừng nhạc rồi lát sau chọn bài khác thì không
    flushLog(playLog ? !playLog.live : false);
    playLog = { uri: d.path, t: Math.floor(now / 1000), sec: 0, dur: 0, lastPos: 0, via: viaOf(d.path, qi), live: true };
  }
  if (playLog && playing && lastLogTick) playLog.sec += Math.min(2, (now - lastLogTick) / 1000);
  if (playLog && d.path === playLog.uri) playLog.live = playing;
  if (playLog && d.path === playLog.uri) {
    playLog.lastPos = el.currentTime || playLog.lastPos;
    if (isFinite(el.duration)) playLog.dur = el.duration;
  }
  lastLogTick = now;
}
setInterval(logTick, 250);
addEventListener("pagehide", () => flushLog(true, true));

// ---------- 👍 / 👎 ----------
let feedbackMap = {}; // uri -> {v: 1 | -1}
async function loadFeedback() {
  try { feedbackMap = (await (await api("/api/history/feedback")).json()) || {}; } catch {}
}
const feedbackOf = (uri) => (feedbackMap[uri] && feedbackMap[uri].v) || 0;
async function setFeedback(uri, v) {
  const t = T(uri) || {};
  const nv = feedbackOf(uri) === v ? 0 : v; // bấm lại lần nữa = bỏ đánh giá
  try { feedbackMap = await postJson("/api/history/feedback", { uri, v: nv, title: t.title || "", artist: artistOf(t) }); } catch { return; }
  toast(nv === 1 ? "Ghi nhận: hợp gu 👍" : nv === -1 ? "Ghi nhận: không hợp gu 👎 - DJ sẽ tránh" : "Đã bỏ đánh giá");
  if (nv === -1 && curPath() === uri && intendPlay) next(); // 👎 bài đang phát thì qua bài luôn
  renderDj();
}

// ---------- Hẹn giờ tắt nhạc ----------
let sleepAt = 0; // thời điểm tắt (ms), 0 = không hẹn
let sleepAfterTrack = false; // tắt khi hết bài đang phát
let sleepFading = false;
function setSleep(minutes, endOfTrack = false) {
  sleepAt = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  sleepAfterTrack = !sleepAt && !!endOfTrack;
  sleepFading = false;
  if (cur().gain && intendPlay) ramp(cur(), 1, 0.3);
  syncSleep();
  toast(sleepAt ? `Sẽ tắt nhạc sau ${minutes} phút 🌙` : sleepAfterTrack ? "Sẽ tắt nhạc khi hết bài này 🌙" : "Đã huỷ hẹn giờ tắt nhạc");
  return { ok: true, minutes: sleepAt ? minutes : 0, endOfTrack: sleepAfterTrack };
}
const sleepLeftMin = () => (sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)) : 0);
function syncSleep() {
  const chip = $("#sleepChip");
  chip.hidden = !sleepAt && !sleepAfterTrack;
  chip.querySelector("span").textContent = sleepAt ? `${sleepLeftMin()}'` : "hết bài";
  $$("#sleepChips button").forEach((b) => b.classList.toggle("on",
    b.dataset.sleep === "track" ? sleepAfterTrack : +b.dataset.sleep === 0 ? !sleepAt && !sleepAfterTrack : false));
}
setInterval(() => {
  if (!sleepAt) return;
  const left = sleepAt - Date.now();
  if (left <= 20000 && !sleepFading && intendPlay && cur().gain) { // 20 giây cuối nhỏ dần
    sleepFading = true;
    ramp(cur(), 0, Math.max(1, left / 1000));
  }
  if (left <= 0) {
    sleepAt = 0;
    sleepFading = false;
    pause(0.3);
    toast("Đã tắt nhạc theo hẹn giờ. Ngủ ngon 🌙", 5000);
  }
  syncSleep();
}, 1000);
$("#sleepChip").addEventListener("click", () => setSleep(0));
$("#sleepChips").innerHTML = [["0", "Tắt"], ["15", "15'"], ["30", "30'"], ["60", "1 giờ"], ["track", "Hết bài"]]
  .map(([v, l]) => `<button data-sleep="${v}">${l}</button>`).join("");
$("#sleepChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sleep]");
  if (b) setSleep(b.dataset.sleep === "track" ? 0 : +b.dataset.sleep, b.dataset.sleep === "track");
});
