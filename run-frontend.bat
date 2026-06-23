@echo off
SET NODE_PATH=%~dp0..\node_portable\node-v20.11.1-win-x64
SET PATH=%NODE_PATH%;%PATH%
echo Starting frontend ...
cd /d "%~dp0frontend"
npm run dev
pause
