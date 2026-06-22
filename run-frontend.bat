@echo off
SET NODE_PATH=%USERPROFILE%\Downloads\node-portable\node-v20.18.1-win-x64
SET PATH=%NODE_PATH%;%PATH%
echo Starting frontend ...
cd /d "%~dp0frontend"
npm run dev
pause
