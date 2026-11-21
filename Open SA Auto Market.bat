@echo off
title SA Auto Market - Launcher
start "SA Auto Market API" cmd /k "cd /d C:\Users\sbhee\sa-auto-market\api && npm start"
start "SA Auto Market Web" cmd /k "cd /d C:\Users\sbhee\sa-auto-market\frontend && npm run dev"
timeout /t 6 /nobreak >nul
start http://localhost:5273
exit
