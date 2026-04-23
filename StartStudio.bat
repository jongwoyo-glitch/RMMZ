@echo off
title RMMZ Studio Server

set PROJECT=Project1
set PORT=8080

echo RMMZ Studio - %PROJECT% - http://localhost:%PORT%

:: 3s delay then open browser (background)
start /b "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:%PORT%"

:: Run server (foreground - closes when server stops)
python "%~dp0rmmz_server.py" %PROJECT% %PORT%
