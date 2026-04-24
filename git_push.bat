@echo off
cd /d "C:\Users\USER\RMMZ"

if exist ".git\index.lock" del /f ".git\index.lock"

git add -A
git commit -m "feat: deity buttons + example skills + max 500"
git pull --rebase origin main
git push origin main

pause
