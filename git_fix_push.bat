@echo off
cd /d "C:\Users\USER\RMMZ"
if exist ".git\index.lock" del /f ".git\index.lock"
git rebase --abort
git add -A
git commit -m "feat: DB max count + numbered list + resize handle + realtime zoom + region ID fix"
git push origin main --force-with-lease
pause
