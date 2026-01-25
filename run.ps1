# Script untuk menjalankan Coup Game Server
# PowerShell Script

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   COUP GAME - Server Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "[!] Virtual environment not found!" -ForegroundColor Yellow
    Write-Host "[*] Creating virtual environment..." -ForegroundColor White
    python -m venv venv
    Write-Host "[+] Virtual environment created" -ForegroundColor Green
    Write-Host ""
}

# Activate virtual environment
Write-Host "[*] Activating virtual environment..." -ForegroundColor White
& ".\venv\Scripts\Activate.ps1"

# Check if requirements are installed
Write-Host "[*] Checking dependencies..." -ForegroundColor White
try {
    $null = & pip show fastapi 2>&1
    Write-Host "[+] Dependencies OK" -ForegroundColor Green
} catch {
    Write-Host "[!] Dependencies not installed" -ForegroundColor Yellow
    Write-Host "[*] Installing requirements..." -ForegroundColor White
    pip install -r requirements.txt
    Write-Host "[+] Dependencies installed" -ForegroundColor Green
}
Write-Host ""

# Check Supabase configuration
Write-Host "[*] Checking Supabase configuration..." -ForegroundColor White
python -c "from supabase_client import supabase; print('[+] Supabase connected!' if supabase else '[!] Supabase connection failed')"
Write-Host ""

# Start server
Write-Host "[*] Starting FastAPI server..." -ForegroundColor White
Write-Host "[i] Server will run at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "[i] Press Ctrl+C to stop the server" -ForegroundColor Cyan
Write-Host ""
uvicorn backend.main:app --reload --host 0.0.0.0 --port 3000
