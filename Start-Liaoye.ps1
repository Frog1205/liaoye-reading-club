param([int]$Port = 4317, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskNodeVersion = & $taskNode -p "process.versions.node"
if ([version]$taskNodeVersion -lt [version]'24.14.0') { throw 'Please install Node.js 24.14 or newer.' }
$taskUrl = "http://127.0.0.1:$Port"
try {
  $taskExisting = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 2
  if ($taskExisting.service -eq 'liaoye') {
    Write-Host "Liaoye is already running: $taskUrl"
    if (-not $NoOpen) { Start-Process $taskUrl }
    exit 0
  }
  throw "Port $Port belongs to another service."
} catch {
  if ($_.Exception.Message -like '*belongs to another*') { throw }
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist\index.html'))) {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Website build failed.' }
}
$taskArtifacts = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
$env:PORT = "$Port"
$taskEntry = Join-Path $PSScriptRoot 'server\index.mjs'
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskEntry + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskArtifacts 'server.stdout.log') -RedirectStandardError (Join-Path $taskArtifacts 'server.stderr.log') -PassThru
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
  try {
    $taskHealth = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 2
    if ($taskHealth.service -eq 'liaoye') {
      $taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskArtifacts 'server.pid') -Encoding UTF8
      @{ ProcessId=$taskProcess.Id; StartedAt=$taskProcess.StartTime.ToUniversalTime().ToString('o'); Entry=$taskEntry } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskArtifacts 'server-state.json') -Encoding UTF8
      Write-Host "Liaoye is ready: $taskUrl"
      if (-not $NoOpen) { Start-Process $taskUrl }
      exit 0
    }
  } catch {}
  if ($taskProcess.HasExited) { throw 'Server exited. Read artifacts/server.stderr.log.' }
  Start-Sleep -Milliseconds 200
}
throw 'Startup timed out. Read artifacts/server.stderr.log.'
