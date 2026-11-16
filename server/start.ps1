param([switch]$UseMcp,[switch]$Open)
$ErrorActionPreference='Stop'
$serviceRoot=$PSScriptRoot
$nodePath=(Get-Command node -ErrorAction Stop).Source
$entryPath=Join-Path $serviceRoot 'http-server.mjs'
if($UseMcp){$env:BOOK_LOOKUP_USE_MCP='1'}
$existing=Get-NetTCPConnection -State Listen -LocalPort 8767 -ErrorAction SilentlyContinue
if(-not $existing){Start-Process -FilePath $nodePath -ArgumentList @('"'+$entryPath+'"') -WorkingDirectory $serviceRoot -WindowStyle Hidden | Out-Null}
if($Open){Start-Process 'http://127.0.0.1:8767/translations/'}
