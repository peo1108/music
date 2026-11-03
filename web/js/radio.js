"use strict";

// =====================================================================================
// Tự phát tiếp: gần hết hàng đợi thì thêm bài liên quan (YouTube Mix / SoundCloud Recommended).
// Chỉ chạy khi bật "Tự phát bài liên quan" và không bật Lặp (Lặp thì quay lại đầu danh sách như cũ).
// =====================================================================================
let radioStart = -1; // vị trí trong hàng đợi bắt đầu phần "Tự động phát"; -1 = chưa có
let radioLoading = null;
const RADIO_MAX = 15; // mỗi lần thêm tối đa chừng này bài

const radioEnabled = () => S.settings.autoplay !== false && S.settings.repeat === "off";

function extendRadio() {
  if (radioLoading) return radioLoading;
  const seed = curPath();
  if (!seed) return Promise.resolve(0);
  radioLoading = api("/api/radio?p=" + enc(seed))
    .then((r) => r.json())
    .then((d) => {
      if (!d || !d.ok) return 0;
      // Bỏ bài đã có trong hàng đợi, kể cả bản upload khác của cùng bài (so theo tên đã chuẩn hoá)
      const inQ = new Set(Q);
      const names = new Set(Q.map(T).filter(Boolean).map(searchNorm));
      const add = [];
      for (const t of d.tracks || []) {
        const name = searchNorm(t);
        if (inQ.has(t.file) || names.has(name)) continue;
        inQ.add(t.file);
        names.add(name);
        known.set(t.file, { ...(known.get(t.file) || {}), ...t });
        add.push(t.file);
        if (add.length >= RADIO_MAX) break;
      }
      if (!add.length) return 0;
      if (radioStart < 0 || radioStart > Q.length) radioStart = Q.length;
      Q.push(...add);
      if (origQ) origQ.push(...add); // đang trộn bài: tắt trộn vẫn còn các bài này
      renderQueue();
      saveSession(true);
      prefetchNext();
      return add.length;
    })
    .catch(() => 0)
    .finally(() => { radioLoading = null; });
  return radioLoading;
}

// Gọi mỗi khi chuyển bài: còn 2 bài là chuẩn bị trước, khỏi phải chờ lúc hết danh sách
function maybeExtendRadio() {
  if (radioEnabled() && curPath() && qi >= Q.length - 2) extendRadio();
}
