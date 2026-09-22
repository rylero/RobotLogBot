# Sync wpilogs from Google Drive for Desktop into a local folder (faster for ClaudeScope).
# Requires: rclone on PATH, Drive Desktop mounted at G:\
#
# Usage:
#   .\scripts\sync-logs.ps1
#   $env:RCLONE_SOURCE = "G:/Shared drives/..."; $env:RCLONE_DEST = "D:\logs"; .\scripts\sync-logs.ps1

$ErrorActionPreference = "Stop"

$Source = if ($env:RCLONE_SOURCE) {
  $env:RCLONE_SOURCE
} else {
  "G:/Shared drives/Popcorn Penguins/RobotLogs/2026-Rebuilt"
}

$Dest = if ($env:RCLONE_DEST) {
  $env:RCLONE_DEST
} else {
  Join-Path $PSScriptRoot "..\data\logs"
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$Dest = (Resolve-Path $Dest).Path

Write-Host "rclone sync"
Write-Host "  from: $Source"
Write-Host "  to:   $Dest"

rclone sync $Source $Dest --fast-list -v --stats 30s
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$n = (Get-ChildItem $Dest -Recurse -Filter *.wpilog -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Done. $n .wpilog file(s) in $Dest"
