@echo off
cd /d "%~dp0..\server"
for /d %%D in ("%~dp0..\tools\jdk-25*") do set JAVA=%%D\bin\java.exe
"%JAVA%" -Xmx2G -jar paper.jar nogui
pause
