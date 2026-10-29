@echo off
rem Local preview server for checking the page on this PC (close this window to stop)
cd /d %~dp0
start "" http://127.0.0.1:8749/
python -m http.server 8749 --bind 127.0.0.1
