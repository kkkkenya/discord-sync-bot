// Builds StudyDesk.exe, the installer friends download: Study Desk plus its own copy of Node, with no keys and no
// study data. Uses only what Windows has (tar to zip, IExpress to make the .exe), so nothing new to install.
// Run from study/:  node tools/make-installer.js   →  dist-installer/StudyDesk.exe
// The name has no "setup"/"install" in it on purpose: Windows asks for admin rights for those, and Study Desk installs
// only into the friend's own user folder (%LOCALAPPDATA%\StudyDesk).
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STUDY = resolve(import.meta.dirname, '..');
const ROOT = resolve(STUDY, '..');
const OUT = join(STUDY, 'dist-installer');
const STAGE = join(OUT, 'stage');
const APP = join(STAGE, 'app');
const run = (cmd, args, cwd = STUDY) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');

console.log('1/6 Building the dashboard…');
run('npx.cmd', ['vite', 'build']);

console.log('2/6 Copying Study Desk (no .env, no data)…');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(APP, 'study'), { recursive: true });
mkdirSync(join(APP, 'lib'));
mkdirSync(join(APP, 'node'));
for (const f of ['server', 'dist', 'node_modules']) cpSync(join(STUDY, f), join(APP, 'study', f), { recursive: true, filter: (src) => !/[\\/](\.env[^\\/]*|data)$/.test(src) });
for (const f of ['package.json', 'package-lock.json', 'setup.js', 'setup-friend.js', 'setup-lib.js', 'setup.bat', 'start.bat', 'GUIDE.md', 'FRIENDS-GUIDE.md', 'UNDERSTANDING.md']) if (existsSync(join(STUDY, f))) copyFileSync(join(STUDY, f), join(APP, 'study', f));
for (const f of ['config.js', 'db.js', 'units.json', 'threads.json']) copyFileSync(join(ROOT, 'lib', f), join(APP, 'lib', f));
copyFileSync(process.execPath, join(APP, 'node', 'node.exe'));
if (existsSync(join(STUDY, 'data', 'study-desk.ico'))) copyFileSync(join(STUDY, 'data', 'study-desk.ico'), join(APP, 'study-desk.ico'));

console.log('3/6 Dropping build-only packages…');
run('npm.cmd', ['prune', '--omit=dev', '--no-audit', '--no-fund'], join(APP, 'study'));

// never ship a secret or someone's data: stop if anything like that slipped in
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : [p, ...walk(p)]) : [p]; });
const leaks = walk(APP).filter((p) => /[\\/]\.env(\.|$)|[\\/]data[\\/]|study\.json$|library\.json$/.test(p) && !/\.env\.example$/.test(p));
if (leaks.length) { console.error('Refusing to build, these must not be shipped:\n', leaks.join('\n')); process.exit(1); }

console.log('4/6 Writing the launchers…');
writeFileSync(join(APP, 'Study Desk.cmd'), crlf(`@echo off
title Study Desk
cd /d "%~dp0study"
if not exist .env (
  echo First time: let's set up Study Desk.
  "%~dp0node\\node.exe" setup.js
  if not exist .env ( echo Setup didn't finish. Run "Study Desk setup" from the Start menu. & pause & exit /b 1 )
)
echo Study Desk is starting. Keep this window open while you study (close it to stop).
set PORT=5190
if exist .env for /f "tokens=2 delims==" %%p in ('findstr /b "PORT=" .env') do set PORT=%%p
start "" cmd /c "timeout /t 3 >nul & (start msedge --app=http://localhost:%PORT% 2>nul || start http://localhost:%PORT%)"
"%~dp0node\\node.exe" server\\index.js
pause
`));
writeFileSync(join(APP, 'Study Desk setup.cmd'), crlf(`@echo off
title Study Desk setup
cd /d "%~dp0study"
"%~dp0node\\node.exe" setup.js
pause
`));

console.log('5/6 Zipping…');
run('tar.exe', ['-a', '-c', '-f', 'app.zip', 'app'], STAGE);
rmSync(APP, { recursive: true, force: true });
// what the .exe runs after unpacking: install into the user's own folder (data and settings kept on an update),
// add shortcuts, and start setup the first time
writeFileSync(join(STAGE, 'install.cmd'), crlf(`@echo off
setlocal
set "DEST=%LOCALAPPDATA%\\StudyDesk"
echo Installing Study Desk to %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"
tar -xf "%~dp0app.zip" -C "%DEST%" --strip-components=1
if errorlevel 1 ( echo Could not unpack Study Desk. & pause & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $d = Join-Path $env:LOCALAPPDATA 'StudyDesk'; $ico = Join-Path $d 'study-desk.ico'; foreach ($p in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'))) { foreach ($n in @('Study Desk', 'Study Desk setup')) { if ($n -eq 'Study Desk setup' -and $p -notlike '*Start Menu*') { continue }; $l = $w.CreateShortcut((Join-Path $p ($n + '.lnk'))); $l.TargetPath = (Join-Path $d ($n + '.cmd')); $l.WorkingDirectory = $d; if (Test-Path $ico) { $l.IconLocation = $ico }; $l.Save() } }"
if exist "%DEST%\\study\\.env" (
  echo Study Desk was updated. Your study data and settings were kept.
  pause
) else (
  start "Study Desk setup" cmd /c ""%DEST%\\Study Desk.cmd""
)
`));

console.log('6/6 Making StudyDesk.exe with IExpress…');
const target = join(OUT, 'StudyDesk.exe');
writeFileSync(join(OUT, 'studydesk.sed'), crlf(`[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=Install Study Desk on this laptop?
DisplayLicense=
FinishMessage=
TargetName=${target}
FriendlyName=Study Desk
AppLaunched=cmd /c install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="app.zip"
FILE1="install.cmd"
[SourceFiles]
SourceFiles0=${STAGE}\\
[SourceFiles0]
%FILE0%=
%FILE1%=
`));
run('C:\\Windows\\System32\\iexpress.exe', ['/N', '/Q', join(OUT, 'studydesk.sed')], OUT);
if (!existsSync(target)) { console.error('IExpress did not produce StudyDesk.exe.'); process.exit(1); }
console.log(`\nDone: ${target} (${Math.round(statSync(target).size / 1048576)} MB). Upload it to Google Drive and share the link with FRIENDS-GUIDE.md.`);
