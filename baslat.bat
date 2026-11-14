@echo off
rem Baglama Akort - yerel sunucu baslatici
rem Python varsa http://localhost:8000 adresinde yerel sunucu acar ve tarayiciyi baslatir.
setlocal
cd /d "%~dp0"
set "PORT=8000"
set "PY="

py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
  python3 --version >nul 2>nul && set "PY=python3"
)

if not defined PY goto nopython

echo.
echo  Baglama Akort baslatiliyor...
echo  Adres: http://localhost:%PORT%
echo  Kapatmak icin bu pencereyi kapatin veya Ctrl+C basin.
echo.
rem Sunucu ayaga kalksin diye 2 sn bekleyip tarayiciyi ac
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%/"
%PY% -m http.server %PORT% --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo  Sunucu baslatilamadi. %PORT% portu baska bir program tarafindan kullaniliyor olabilir.
  echo  Bu pencereyi kapatip tekrar deneyin ya da index.html dosyasini dogrudan acin.
  pause
)
goto end

:nopython
echo.
echo  Python bulunamadi.
echo.
echo  Secenekler:
echo   1) index.html dosyasina cift tiklayarak programi dogrudan acin.
echo      (Chrome ve Edge'de mikrofon genelde calisir; izin istenirse "Izin ver" deyin.)
echo   2) Mikrofon calismazsa Python'u https://www.python.org adresinden kurun
echo      ("Add python.exe to PATH" secenegini isaretleyin) ve baslat.bat'i tekrar calistirin.
echo.
choice /c EH /n /m " index.html simdi acilsin mi? [E]vet / [H]ayir: "
if errorlevel 2 goto end
start "" "%~dp0index.html"

:end
endlocal
