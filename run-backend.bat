@echo off
SET NODE_PATH=%~dp0..\node_portable\node-v20.11.1-win-x64
SET PATH=%NODE_PATH%;%PATH%
echo Starting backend on http://localhost:5001 ...
cd /d "%~dp0backend"
npm run dev
pause
