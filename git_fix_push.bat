@echo off
cd /d "C:\Users\USER\RMMZ"
if exist ".git\index.lock" del /f ".git\index.lock"
git rebase --abort
git add -A
git commit -m "refactor: canvas 64px cells + navigator/modal split for inventory grid & item image editor"
git push origin main --force-with-lease
pau