# verify_backend.ps1
$baseUrl = "http://localhost:3000"
$loginUrl = "$baseUrl/api/auth/login"
$inventoryUrl = "$baseUrl/api/inventory/stats"
$reportUrl = "$baseUrl/api/reports/state"

# Credentials from seed
$body = @{
    phone = "8888320669"
    password = "123456"
} | ConvertTo-Json

Write-Host "1. Logging in..." -ForegroundColor Cyan
try {
    $loginResponse = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
    $token = $loginResponse.accessToken
    Write-Host "   Login Successful! Token received." -ForegroundColor Green
    if (-not $token) {
        Write-Host "   WARNING: Token is empty! Response keys: $($loginResponse | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Login Failed!" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    exit
}

$headers = @{
    Authorization = "Bearer $token"
}

Write-Host "`n2. Verifying Inventory Stats..." -ForegroundColor Cyan
try {
    $inventoryResponse = Invoke-RestMethod -Uri $inventoryUrl -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "   Inventory Stats Request Successful!" -ForegroundColor Green
    Write-Host "   Data Sample:" -ForegroundColor Gray
    $inventoryResponse | ConvertTo-Json -Depth 2 | Select-Object -First 10 | Write-Host
} catch {
    Write-Host "   Inventory Request Failed!" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host "`n3. Verifying Reports (State Report)..." -ForegroundColor Cyan
try {
    $reportResponse = Invoke-RestMethod -Uri $reportUrl -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "   Report Request Successful!" -ForegroundColor Green
    Write-Host "   Data Sample:" -ForegroundColor Gray
    $reportResponse | ConvertTo-Json -Depth 2 | Select-Object -First 10 | Write-Host
} catch {
    Write-Host "   Report Request Failed!" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host "`n--- Verification Complete ---" -ForegroundColor Cyan
