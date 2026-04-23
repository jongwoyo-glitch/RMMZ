@echo off
chcp 65001 >nul
echo.
echo ■ 백업 생성 + 무결성 검증
echo.
node "%~dp0validate.js" --backup
echo.
pause
