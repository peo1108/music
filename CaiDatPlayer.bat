@echo off
rem Dong goi va cai Nhac vao may nay (go cai: Cai dat > Ung dung > Nhac)
cd /d "%~dp0"
python build.py --install %*
pause
