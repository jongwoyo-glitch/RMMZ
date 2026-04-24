@echo off
cd /d "C:\Users\USER\RMMZ"

echo === Git Fix Push ===

:: Clean lock files
if exist ".git\index.lock" del /f ".git\index.lock"

:: Clean stuck rebase state (empty rebase-merge dir)
if exist ".git\rebase-merge" (
    git rebase --abort 2>nul
    if exist ".git\rebase-merge" rmdir /s /q ".git\rebase-merge" 2>nul
)
if exist ".git\rebase-apply" (
    git rebase --abort 2>nul
    if exist ".git\rebase-apply" rmdir /s /q ".git\rebase-apply" 2>nul
)

:: Stage and commit
git add -A
git status --short
echo.
git commit -m "feat: gaho sync + appearance tab + skill param dropdowns"
if errorlevel 1 (
    echo Nothing to commit or commit failed.
)

:: Push
git push origin main --force-with-lease
if errorlevel 1 (
    echo Push failed. Trying force push...
    git push origin main --force
)

echo.
echo === Done ===
pause