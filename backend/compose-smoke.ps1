$ErrorActionPreference = 'Stop'
$emsRoot = (Resolve-Path (Join-Path $PSScriptRoot '../')).Path
$envPath = Join-Path $emsRoot 'backend/build/compose-smoke.env'
if (Test-Path -LiteralPath $envPath) {
 $existing = Get-Content -LiteralPath $envPath | ConvertFrom-StringData
 $adminPassword = $existing.ADMIN_INITIAL_PASSWORD
} else {
$adminPassword = [guid]::NewGuid().ToString('N')
$dbPassword = [guid]::NewGuid().ToString('N')
$rootPassword = [guid]::NewGuid().ToString('N')
$jwtSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
@(
 'DB_NAME=ems'
 'DB_USERNAME=ems_smoke'
 "DB_PASSWORD=$dbPassword"
 "DB_ROOT_PASSWORD=$rootPassword"
 "JWT_SECRET=$jwtSecret"
 'ADMIN_LOGIN_ID=SMOKEADMIN'
 "ADMIN_INITIAL_PASSWORD=$adminPassword"
) | Set-Content -LiteralPath $envPath -Encoding utf8
}
& docker compose --project-name ems-backend-smoke --env-file $envPath -f (Join-Path $emsRoot 'docker-compose.yml') up --build -d mysql backend
if ($LASTEXITCODE -ne 0) { throw 'Compose up failed' }
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
 try {
  $login = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/v1/auth/login' -ContentType 'application/json' -Body (@{loginId='SMOKEADMIN';password=$adminPassword} | ConvertTo-Json)
  $ready = $true
  break
 } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { throw 'Backend did not become ready within 120 seconds' }
$headers = @{Authorization="Bearer $($login.accessToken)"}
$employees = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/employees' -Headers $headers
if ($employees.totalElements -ne 31) { throw 'Expected 31 seeded employees' }
$departments = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/departments' -Headers $headers
$positions = Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/positions' -Headers $headers
Write-Output "COMPOSE_SMOKE_PASS employees=$($employees.totalElements) departments=$($departments.Count) positions=$($positions.Count)"
& docker compose --project-name ems-backend-smoke --env-file $envPath -f (Join-Path $emsRoot 'docker-compose.yml') ps
