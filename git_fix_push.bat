@echo off
cd /d "C:\Users\USER\RMMZ"
if exist ".git\index.lock" del /f ".git\index.lock"
git rebase --abort
git add -A
git commit -m "fix: restore truncated HTML + gahorok nav + studio refresh"
git push origin main --force-with-lease
pause
