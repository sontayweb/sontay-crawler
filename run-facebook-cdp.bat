@echo off
title Facebook Scraper Automation - Son Tay Crawler

echo =======================================================
echo     Tu Dong Khoi Dong Chrome Debug (Khong can tat Chrome cu)
echo =======================================================

echo.
echo [1/3] Dang tim duong dan Chrome...

set CHROME_PATH=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if exist "%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe"

if "%CHROME_PATH%"=="" (
    echo [ERROR] Khong tim thay Google Chrome tren may tinh!
    pause
    exit /b
)

echo Tim thay Chrome tai: "%CHROME_PATH%"
echo.
echo [2/3] Dang khoi dong mot cua so Chrome Debug doc lap...
echo (Luu y: Cua so nay se khong anh huong toi cac tab Chrome ban dang dung)
echo.

:: Tạo thư mục lưu profile debug nếu chưa có
if not exist "%~dp0data\chrome-debug" mkdir "%~dp0data\chrome-debug"

:: Khởi chạy Chrome với profile riêng biệt để kích hoạt cổng 9222
start "" "%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="%~dp0data\chrome-debug"

echo.
echo Dang cho 3 giay de Chrome khoi dong...
timeout /t 3 /nobreak >nul

echo.
echo =======================================================
echo LUU Y QUAN TRONG TRÊN CỬA SỔ CHROME MỚI HIỆN RA:
echo 1. Dang nhap Facebook cua ban.
echo 2. Di chuyen den Group hoac Bai viet Son Tay can quet.
echo =======================================================
echo.
echo NHẬP TỪ KHÓA CẦN QUÉT (ẤN ENTER ĐỂ QUÉT TẤT CẢ MẶC ĐỊNH):
set /p KEYWORD_INPUT="Tu khoa (hoac file .json/.csv): "
if "%KEYWORD_INPUT%"=="" set KEYWORD_INPUT=all
echo.
echo 3. Nhap vao cua so terminal nay va an PHIM BAT KY de quet...
pause

echo.
echo [3/3] Dang khoi dong tien trinh cao va ghi log...
echo Luu y: Log se duoc ghi truc tiep vao thu muc data/exports/
echo.

powershell -Command "$t = Get-Date -Format 'yyyyMMdd_HHmmss'; npm run scrape -- --source='facebook-cdp' --query='%KEYWORD_INPUT%' --out=\"data/exports/facebook_leads_$t.csv\" | Tee-Object -FilePath \"data/exports/facebook_leads_$t.log\""

echo.
echo =======================================================
echo [SUCCESS] Hoan thanh!
echo - File lead xuat ra: data/exports/facebook_leads_[timestamp].csv
echo - File log duoc luu tai: data/exports/facebook_leads_[timestamp].log
echo =======================================================
pause
