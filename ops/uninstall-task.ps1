# Removes the "Engineering Hub bots" task and stops the supervisor and both bots.
# Puts the old Startup shortcuts back (from ops\old-startup\), so the bots start the old way at the next logon.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Unregister-ScheduledTask -TaskName 'Engineering Hub bots' -Confirm:$false -ErrorAction SilentlyContinue
$lock = Join-Path $repo 'ops\data\supervise.lock'
if (Test-Path $lock) {
  $id = [int](Get-Content $lock)
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  Remove-Item $lock -ErrorAction SilentlyContinue
}
$old = Join-Path $PSScriptRoot 'old-startup'
if (Test-Path $old) { Get-ChildItem $old -Filter '*.lnk' | Move-Item -Destination ([Environment]::GetFolderPath('Startup')) -Force }
Write-Host 'Removed the task, stopped the bots and restored the Startup shortcuts.'
