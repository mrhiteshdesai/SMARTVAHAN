
try {
    Write-Host "Testing Login..."
    $loginBody = @{
        phone = "8888320669"
        password = "123456"
    } | ConvertTo-Json
    
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -ErrorAction Stop
    Write-Host "Login Success!"
    $token = $loginResponse.accessToken
    Write-Host "Token received."

    Write-Host "Testing Dealers List..."
    $headers = @{ Authorization = "Bearer $token" }
    $dealersResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/dealers" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "Dealers List Success! Count: $($dealersResponse.Count)"
} catch {
    Write-Host "Error Requesting API:"
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody"
    }
}
