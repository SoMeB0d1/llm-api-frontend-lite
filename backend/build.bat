@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo Building unified server exe to project root
echo ========================================

:: 检查 Go 环境
where go >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Go is not installed or not in PATH
    exit /b 1
)

:: 设置 CGO 启用（SQLite 需要 CGO）
set CGO_ENABLED=1

:: 编译到根目录
set OUTPUT=..\llm-server.exe

echo Compiling...
go build -ldflags="-s -w" -o "%OUTPUT%" .

if %ERRORLEVEL% neq 0 (
    echo.
    echo BUILD FAILED!
    exit /b 1
)

echo.
echo ========================================
echo BUILD SUCCEEDED
echo Output: %OUTPUT%
echo ========================================
echo.
echo Run the server with:
echo   llm-server.exe
echo.
echo Make sure .env and frontend/ folder are in the same directory.
endlocal