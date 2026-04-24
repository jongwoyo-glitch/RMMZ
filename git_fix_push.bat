@echo off
cd /d "C:\Users\USER\RMMZ"
if exist ".git\index.lock" del /f ".git\index.lock"
git rebase --abort
git add -A
git commit -m "feat: deity buttons + example skills + max 500"
git push origin main --force-with-lease
pause
