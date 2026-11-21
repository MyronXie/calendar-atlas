$ErrorActionPreference='Stop'
$atlasRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$atlasServer=Join-Path $atlasRoot 'server/server.mjs'
try{$atlasHealth=Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 2}catch{Write-Output 'Calendar Atlas is not running, or port 8787 belongs to another service.';exit 0}
if($atlasHealth.app -ne 'calendar-atlas'){throw 'Refusing to stop an unrelated service.'}
$atlasProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$atlasHealth.pid)
if(-not $atlasProcess -or $atlasProcess.Name -ine 'node.exe' -or $atlasProcess.CommandLine.IndexOf($atlasServer,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'Refusing to stop a process outside this project.'}
Stop-Process -Id ([int]$atlasHealth.pid)
Write-Output 'Calendar Atlas stopped. Your data has not been changed.'
