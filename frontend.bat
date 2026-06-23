@echo off
rem Shortcut script to change directory to the frontend folder and configure Node/npm paths
SET NODE_PATH=%~dp0..\node_portable\node-v20.11.1-win-x64
SET PATH=%NODE_PATH%;%PATH%
cd /d "%~dp0frontend"
cmd /k
