# TEST TOOL ONLY: pretends to be the door kiosk so you can scan a member's QR token.
# Usage (Terminal 2, from the backend folder): .\scripts\kiosk-test.ps1 -Token "<paste token>"
param(
    [Parameter(Mandatory = $true)][string]$Token,
    [string]$BaseUrl = "http://localhost:3000"
)

$envFile = Join-Path $PSScriptRoot "..\.env"
$line = Get-Content $envFile | Where-Object { $_ -match '^KIOSK_KEY=' } | Select-Object -First 1
if (-not $line) { Write-Host "KIOSK_KEY not found in backend\.env"; exit 1 }
$key = $line.Substring('KIOSK_KEY='.Length).Trim()

try {
    $res = Invoke-RestMethod -Method Post -Uri "$BaseUrl/checkins" `
        -Headers @{ "x-kiosk-key" = $key } `
        -ContentType "application/json" `
        -Body (@{ token = $Token } | ConvertTo-Json)
    $res | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Kiosk rejected the scan:"
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message } else { Write-Host $_.Exception.Message }
}