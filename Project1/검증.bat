@echo off
chcp 65001 >nul
echo.
echo ■ RMMZ 프로젝트 무결성 검증
echo.
node "%~dp0validate.js"
echo.
pause
