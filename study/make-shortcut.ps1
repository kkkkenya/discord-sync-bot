# Makes a "Study Desk" shortcut (Start menu + desktop) with its own icon. It runs start.bat minimised, so one
# click starts the dashboard, or just opens it if it's already running. Pin it: right-click → Pin to taskbar.
# Run: powershell -File make-shortcut.ps1
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ico = Join-Path $here 'data\study-desk.ico'
New-Item -ItemType Directory -Force (Join-Path $here 'data') | Out-Null

# icon: orange ring with clock hands, like the dashboard's favicon
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$orange = [System.Drawing.Color]::FromArgb(255, 217, 72, 15)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 28, 29, 32))), 3, 3, 58, 58)
$pen = New-Object System.Drawing.Pen $orange, 7
$g.DrawEllipse($pen, 7, 7, 50, 50)
$hand = New-Object System.Drawing.Pen $orange, 6
$hand.StartCap = 'Round'; $hand.EndCap = 'Round'
$g.DrawLine($hand, 32, 32, 32, 17)
$g.DrawLine($hand, 32, 32, 42, 38)
$g.Dispose()
$fs = [System.IO.File]::Create($ico)
[System.Drawing.Icon]::FromHandle($bmp.GetHicon()).Save($fs)
$fs.Close()

$shell = New-Object -ComObject WScript.Shell
$places = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Study Desk.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Study Desk.lnk')
)
foreach ($path in $places) {
  $lnk = $shell.CreateShortcut($path)
  # through cmd.exe, so Windows lets you pin it to the taskbar
  $lnk.TargetPath = "$env:WINDIR\System32\cmd.exe"
  $lnk.Arguments = "/c `"$here\start.bat`""
  $lnk.WorkingDirectory = $here
  $lnk.WindowStyle = 7  # minimised
  $lnk.IconLocation = $ico
  $lnk.Description = 'Study dashboard and study DMs'
  $lnk.Save()
  Write-Host "Made $path"
}
