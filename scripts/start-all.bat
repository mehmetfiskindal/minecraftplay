@echo off
setlocal enabledelayedexpansion

set "JAVA=%~dp0..\tools\jdk-25*\bin\java.exe"
for /f "delims=" %%J in ('dir /b /s "%JAVA%" 2^>nul') do set "JAVA=%%J"

if not defined JAVA (
    echo [HATA] JDK 25 bulunamadi: %~dp0..\tools\jdk-25*
    echo Lutfen JDK 25'i tools/ klasorune cikarin.
    pause
    exit /b 1
)

if not exist "%~dp0..\server\paper.jar" (
    echo [HATA] server\paper.jar yok.
    pause
    exit /b 1
)

echo [1/3] Paper sunucusu baslatiliyor...
if not exist "%~dp0..\server\stdout.log" (
    "%JAVA%" -Xmx2G -jar "%~dp0..\server\paper.jar" nogui
) else (
    echo   Sunucu zaten calisiyor (stdout.log mevcut).
)

echo [2/3] Sunucu hazir laniyor...
:wait
findstr /C:"Done (" "%~dp0..\server\stdout.log" >nul 2>&1
if errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto wait
)
echo   Sunucu hazir.

echo [3/3] Bot MCP sunucusu baslatiliyor...
echo   'node C:\Users\salih\minecraftplay\bot\index.js' calisacak.
echo   opencode'u bu klasorde baslatin (MCP otomatik baglanir).
echo.
echo   Test icin:  cd bot ^&^& node index.js
pause
