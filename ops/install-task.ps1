# Registers the Task Scheduler task "Engineering Hub bots": starts ops/supervise.js hidden at logon and checks every
# 15 minutes that it's still running (the supervisor exits at once if a copy is already up).
#   powershell -File ops\install-task.ps1                     hidden via conhost --headless
#   powershell -File ops\install-task.ps1 -PowerShellLaunch   fallback, if a window ever shows
param([switch]$PowerShellLaunch)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$script = Join-Path $repo 'ops\supervise.js'

if ($PowerShellLaunch) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $repo `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"Start-Process -WindowStyle Hidden -FilePath '$node' -ArgumentList '\`"$script\`"' -WorkingDirectory '$repo'`""
} else {
  $action = New-ScheduledTaskAction -Execute 'conhost.exe' -WorkingDirectory $repo -Argument "--headless `"$node`" `"$script`""
}

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
# Interactive: only while you're logged on, because G: (Google Drive) belongs to your session.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'Engineering Hub bots' -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description 'Runs both Engineering Study Hub PC bots hidden (discord-sync-bot\ops\supervise.js).' -Force | Out-Null
Write-Host "Registered 'Engineering Hub bots'."

# Retire the old way: stop the visible start-bot.bat loops and keep their Startup shortcuts as a backup.
Get-CimInstance Win32_Process -Filter "name='cmd.exe'" | Where-Object { $_.CommandLine -like '*start-bot.bat*' } |
  ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null; Write-Host "Stopped old loop $($_.ProcessId)" }
$startup = [Environment]::GetFolderPath('Startup')
$old = Join-Path $PSScriptRoot 'old-startup'
New-Item -ItemType Directory -Force $old | Out-Null
Get-ChildItem $startup -Filter 'Engineering Study Hub*.lnk' | ForEach-Object { Move-Item $_.FullName $old -Force; Write-Host "Moved $($_.Name) to ops\old-startup" }
Remove-Item (Join-Path $repo 'pc\data\bot.lock'), (Join-Path $repo 'community\data\bot.lock') -ErrorAction SilentlyContinue

Start-ScheduledTask 'Engineering Hub bots'
Start-Sleep 20
Get-ScheduledTask 'Engineering Hub bots' | Select-Object TaskName, State | Format-Table -AutoSize
Write-Host 'Logs: pc\data\logs\ and community\data\logs\ (restarts.log lists every start and exit).'
