@echo off
chcp 65001 >nul
echo.
echo ■ RMMZ 파일 감시 데몬 시작
echo   파일 변경 시 자동 검증 + 손상 시 자동 복원
echo   종료: Ctrl+C
echo.
node "%~dp0watch_integrity.js"
