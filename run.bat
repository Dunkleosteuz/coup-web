@echo off
REM Script untuk menjalankan Coup Game Server
REM Windows Batch Script

echo ========================================
echo    COUP GAME - Server Startup
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo [!] Virtual environment not found!
    echo [*] Creating virtual environment...
    python -m venv venv
    echo [+] Virtual environment created
    echo.
)

REM Activate virtual environment
echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

REM Check if requirements are installed
echo [*] Checking dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [!] Dependencies not installed
    echo [*] Installing requirements...
    pip install -r requirements.txt
    echo [+] Dependencies installed
) else (
    echo [+] Dependencies OK
)
echo.

REM Check Supabase configuration
echo [*] Checking Supabase configuration...
python -c "from supabase_client import supabase; print('[+] Supabase connected!' if supabase else '[!] Supabase connection failed')"
echo.

REM Start server
echo [*] Starting FastAPI server...
echo [i] Server will run at: http://localhost:3000
echo [i] Press Ctrl+C to stop the server
echo.
uvicorn backend.main:app --reload --host 0.0.0.0 --port 3000
