# Nhạc

Trình phát nhạc cho Windows: phát thư viện nhạc trong máy, tìm và nghe từ YouTube/SoundCloud,
lời bài hát chạy theo nhạc (LRCLIB), dạng sóng, EQ, chuyển bài mượt, playlist.

App chạy hoàn toàn trên máy của từng người: không có server, không có tài khoản.

## Cài cho người dùng

1. Tải `NhacSetup-x.y.z.exe` mới nhất ở trang [Releases](https://github.com/peo1108/music/releases) rồi chạy.
   Không cần quyền admin.
2. Lần đầu mở, nếu máy thiếu **ffmpeg** hoặc **Deno**, app sẽ báo và có nút cài bằng winget.
   Thiếu hai thứ này thì không phát được YouTube, không có dạng sóng và không lưu được mp3.
3. Khi có bản mới, app tự báo. Bấm **Cập nhật** là xong.

Gỡ cài đặt: *Cài đặt > Ứng dụng > Nhạc*. Dữ liệu cá nhân (playlist, yêu thích, lượt nghe) nằm ở
`%APPDATA%\NhacPlayer` và vẫn được giữ lại sau khi gỡ. Mỗi ngày app tự sao lưu `state.json` vào thư mục `backups\`.

Khi báo lỗi, hãy gửi kèm file log: *bảng Âm thanh (E) > Nhật ký lỗi > Mở thư mục*.

## Phát triển

```bat
pip install -r requirements-dev.txt
python player.py                         :: chạy thử từ mã nguồn (thư viện = thư mục out\)
python -m unittest discover -s tests     :: chạy test
```

| Thành phần | Vai trò |
|---|---|
| `player.py` | Cửa sổ (pywebview/WebView2) và server nội bộ `127.0.0.1:47816` phục vụ giao diện và file nhạc |
| `online.py` | Tìm kiếm, đọc link playlist, bài liên quan, phát và lưu từ YouTube/SoundCloud qua yt-dlp |
| `downloads.py` | Hàng tải nhạc về thư viện (2 bài cùng lúc, huỷ, thử lại, nhớ hàng chờ) |
| `ytdlp_update.py` | Tự cập nhật yt-dlp từ PyPI, không cần phát hành bản app mới |
| `core.py` | Phiên bản, thư mục dữ liệu, log, tìm ffmpeg/Deno |
| `updater.py` | Kiểm tra và cài bản mới của app từ GitHub Releases |
| `web/` | Giao diện: `index.html`, `player.css`, `js/*.js` (nạp theo thứ tự trong `index.html`) |
| `installer/` | Script Inno Setup tạo bộ cài |
| `nhac_app.py`, `tai_audio.py` | Công cụ tải nhạc và sửa tag cũ (`TaiNhac.bat`) |

Server nội bộ chỉ nhận request từ chính app: kiểm tra Host, kiểm tra Origin với POST,
và yêu cầu header `X-Nhac` với `/api/`. Nhờ vậy trang web lạ mở trong trình duyệt không gọi được vào app.

### Phát hành bản mới

Cần [Inno Setup 6](https://jrsoftware.org/isinfo.php) (`winget install JRSoftware.InnoSetup`) và `gh` đã đăng nhập.

1. Tăng `VERSION` trong `core.py`, rồi commit và push.
2. `python build.py --release`: chạy test, đóng gói, tạo bộ cài và đăng lên GitHub Releases.
3. App của mọi người sẽ báo có bản mới trong vòng vài giờ.

`python build.py --install` (hoặc `CaiDatPlayer.bat`): đóng gói rồi cài luôn vào máy mình để thử.

YouTube hay đổi cách phát, nên khi YouTube bị lỗi, cách sửa thường là cập nhật yt-dlp
(`pip install -U yt-dlp yt-dlp-ejs`) rồi phát hành một bản mới.
