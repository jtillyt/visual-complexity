@echo off
echo Building project...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed.
    pause
    exit /b %ERRORLEVEL%
)
echo Starting local preview server...
npm run preview
pause
