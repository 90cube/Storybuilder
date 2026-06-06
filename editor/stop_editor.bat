@echo off
echo Stopping backend processes on port 8765...

for /f "tokens=5" %%a in ('netstat -aon ^| find "LISTENING" ^| find ":8765"') do (
    echo Killing PID %%a...
    taskkill /F /PID %%a
)

echo.
echo Process terminated.
pause
