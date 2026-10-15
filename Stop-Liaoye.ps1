$ErrorActionPreference = 'Stop'
$taskStateFile = Join-Path $PSScriptRoot 'artifacts\server-state.json'
if (-not (Test-Path -LiteralPath $taskStateFile)) { Write-Host 'No managed Liaoye process found.'; exit 0 }
$taskState = Get-Content -LiteralPath $taskStateFile -Raw -Encoding UTF8 | ConvertFrom-Json
$taskProcess = Get-Process -Id $taskState.ProcessId -ErrorAction SilentlyContinue
if (-not $taskProcess) { Write-Host 'Liaoye is already stopped.'; exit 0 }
$taskEntry = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server\index.mjs'))
$taskDetails = Get-CimInstance Win32_Process -Filter "ProcessId = $($taskState.ProcessId)"
$taskExpectedStart = ([datetime]$taskState.StartedAt).ToUniversalTime()
if ($taskState.Entry -ne $taskEntry -or $taskProcess.StartTime.ToUniversalTime().Ticks -ne $taskExpectedStart.Ticks -or -not $taskDetails.CommandLine.Contains($taskEntry)) {
  throw 'Process identity does not match this project; refusing to stop it.'
}
Stop-Process -Id $taskProcess.Id
Write-Host 'Liaoye stopped. All saved content is retained in data/.'
