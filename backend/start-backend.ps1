# Backend Startup Script
Write-Host "Starting Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Activate virtual environment
if (Test-Path ".venv\Scripts\Activate.ps1") {
    .\.venv\Scripts\Activate.ps1
    Write-Host "Virtual environment activated" -ForegroundColor Green
} else {
    Write-Host "ERROR: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Run: python -m venv .venv" -ForegroundColor Yellow
    exit 1
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found. Creating default..." -ForegroundColor Yellow
    @"
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
PORT=3001
"@ | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "Created .env file with default values" -ForegroundColor Green
    Write-Host "Please update CONTRACT_ADDRESS with your deployed contract address!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting uvicorn server on port 3001..." -ForegroundColor Cyan
Write-Host "Backend will be available at: http://localhost:3001" -ForegroundColor Green
Write-Host "API docs at: http://localhost:3001/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start uvicorn using python -m (more reliable)
python -m uvicorn app:app --reload --port 3001 --host 0.0.0.0

