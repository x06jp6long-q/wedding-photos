$ErrorActionPreference = "SilentlyContinue"
$Host.UI.RawUI.WindowTitle = "Wedding Photos Server"

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  Wedding Photo Upload - Starting..." -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

Set-Location $PSScriptRoot

# Start Node.js server
Write-Host "[1/2] Starting server..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot\server.log" -RedirectStandardError "$PSScriptRoot\server_err.log"
Start-Sleep -Seconds 3

# Start Cloudflare Tunnel
Write-Host "[2/2] Creating public URL, please wait ~10s..." -ForegroundColor Yellow
Start-Process -FilePath "cloudflared" -ArgumentList "tunnel","--url","http://localhost:3000" -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot\tunnel.log" -RedirectStandardError "$PSScriptRoot\tunnel_err.log"
Start-Sleep -Seconds 12

# Extract URL from log
$tunnelUrl = ""
$logContent = Get-Content "$PSScriptRoot\tunnel_err.log" -ErrorAction SilentlyContinue
foreach ($line in $logContent) {
    if ($line -match "(https://[a-z0-9\-]+\.trycloudflare\.com)") {
        $tunnelUrl = $Matches[1]
        break
    }
}

if (-not $tunnelUrl) {
    Write-Host ""
    Write-Host "  [Error] Could not get public URL" -ForegroundColor Red
    Write-Host "  Check tunnel_err.log for details" -ForegroundColor Red
    Write-Host "  Local access still works: http://localhost:3000" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
    exit
}

$qrUrl = "http://localhost:3000/qrcode?host=$tunnelUrl"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Public URL: $tunnelUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  QR Code:    $qrUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Opening QR Code in browser..." -ForegroundColor Yellow
Write-Host "  Keep this window open! Press Enter to stop." -ForegroundColor Yellow
Write-Host ""

Start-Process $qrUrl

Read-Host "Press Enter to stop the server"

Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
Write-Host "  Server stopped. Goodbye!" -ForegroundColor Magenta
