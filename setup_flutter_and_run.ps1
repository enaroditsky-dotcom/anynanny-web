# AnyNanny + Flutter SDK setup for Windows
# Run from this folder:  powershell -ExecutionPolicy Bypass -File .\setup_flutter_and_run.ps1
$ErrorActionPreference = "Stop"
$FlutterDir = "C:\src\flutter"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptDir

Write-Host "Project: $ProjectRoot" -ForegroundColor Cyan

function Ensure-FlutterOnPath {
  if (Get-Command flutter -ErrorAction SilentlyContinue) { return }
  $bin = "$FlutterDir\bin"
  if (Test-Path "$bin\flutter.bat") {
    if ($env:Path -notlike "*$bin*") {
      [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$bin", "User")
      $env:Path += ";$bin"
      Write-Host "Added $bin to user PATH. If a new terminal still lacks 'flutter', sign out/in once." -ForegroundColor Green
    }
    return
  }
  throw "Flutter not found at $FlutterDir. Install Git and re-run, or add Flutter bin to PATH manually."
}

Write-Host "`n=== Flutter SDK (stable under C:\src\flutter) ===" -ForegroundColor Cyan
if (Get-Command flutter -ErrorAction SilentlyContinue) {
  Write-Host "Flutter on PATH:" (Get-Command flutter).Source
  flutter --version
} elseif (Test-Path "$FlutterDir\bin\flutter.bat") {
  Ensure-FlutterOnPath
  & "$FlutterDir\bin\flutter.bat" --version
} else {
  New-Item -ItemType Directory -Force -Path "C:\src" | Out-Null
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host @"
Git is required for the automatic Flutter install.
1) Install Git: https://git-scm.com/download/win
2) Re-open PowerShell and run this script again.

Alternatively download the Flutter SDK zip from:
https://docs.flutter.dev/get-started/install/windows
Extract to C:\src\flutter (so that C:\src\flutter\bin\flutter.bat exists).
"@ -ForegroundColor Yellow
    exit 1
  }
  Write-Host "Cloning Flutter stable (several minutes, ~1GB)..." -ForegroundColor Yellow
  git clone https://github.com/flutter/flutter.git -b stable $FlutterDir
  Ensure-FlutterOnPath
  flutter doctor
}

Ensure-FlutterOnPath

Write-Host "`n=== flutter doctor ===" -ForegroundColor Cyan
flutter doctor -v

Write-Host "`n=== pub get ===" -ForegroundColor Cyan
Set-Location $ProjectRoot
flutter pub get

Write-Host "`n=== Run in Chrome (Welcome / onboarding screen) ===" -ForegroundColor Cyan
Write-Host "For Android device or emulator use: flutter devices   then   flutter run -d <id>" -ForegroundColor DarkGray
flutter run -d chrome
