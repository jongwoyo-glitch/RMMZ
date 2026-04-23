@echo off
chcp 65001 >nul
echo.
echo ■ 백업 생성 + 검증 + 자동 수리
echo.
node "%~dp0validate.js" --backup --fix
echo.
pause
