@echo off
SET NODE_PATH=%USERPROFILE%\Downloads\node-portable\node-v20.18.1-win-x64
SET PATH=%NODE_PATH%;%PATH%
echo Starting backend on http://localhost:5001 ...
cd /d "%~dp0backend"
npm run dev
pause
