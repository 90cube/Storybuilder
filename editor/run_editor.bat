@echo off
title Storybuilder Lore Graph Editor
echo =======================================================
echo  DNF Storybuilder Editor - Go Toolchain Launcher
echo =======================================================
echo.
echo  * Using Go compiler (go run) to start editor
echo    to avoid Windows SmartScreen warnings.
echo.

cd /d "%~dp0"

rem Check if Go is installed
where go >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Go is not installed or not in PATH.
    echo Please install Go from https://go.dev/dl/ and try again.
    pause
    exit /b 1
)

echo [INFO] Compiling and starting editor server...
go run cmd/serve/main.go -dsn ./build/data.db -schema ./schema

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] A problem occurred while running the editor server.
    pause
)
