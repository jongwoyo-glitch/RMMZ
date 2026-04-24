@echo off
cd /d "C:\Users\USER\RMMZ"
if exist ".git\index.lock" del /f ".git\index.lock"
git rebase --abort
git add -A
git commit -m "feat: D2-style equip/inventory UI + item image upload + in-game image rendering"
git push origin main --force-with-lease
pause
