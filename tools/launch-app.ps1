param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$atlasRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$atlasServer=Join-Path $atlasRoot 'server/server.mjs'
$atlasUrl='http://127.0.0.1:8787/'
function Test-AtlasService {try{$atlasInfo=Invoke-RestMethod -Uri ($atlasUrl+'api/health') -TimeoutSec 2;return $atlasInfo.app -eq 'calendar-atlas'}catch{return $false}}
if(-not(Test-AtlasService)){
  if(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue){throw 'Port 8787 is occupied by another or older service. Close it before starting Calendar Atlas.'}
  $atlasNode=(Get-Command node -ErrorAction SilentlyContinue).Source
  if(-not $atlasNode){if(Test-Path -LiteralPath 'D:\nodejs\node.exe'){$atlasNode='D:\nodejs\node.exe'}else{throw 'Node.js was not found. Install Node.js or add it to PATH.'}}
  $atlasPortBefore=$env:PORT
  try{$env:PORT='8787';$atlasProcess=Start-Process -FilePath $atlasNode -ArgumentList ('"'+$atlasServer+'"') -WorkingDirectory $atlasRoot -WindowStyle Hidden -PassThru}finally{$env:PORT=$atlasPortBefore}
  $atlasDeadline=[DateTime]::UtcNow.AddSeconds(12)
  while(-not(Test-AtlasService)){
    $atlasProcess.Refresh()
    if($atlasProcess.HasExited){throw 'Calendar Atlas stopped during startup. Check atlas-data files and run node server.mjs to inspect the error.'}
    if([DateTime]::UtcNow -gt $atlasDeadline){throw 'The service did not become ready. Try node server.mjs in the project directory.'}
    Start-Sleep -Milliseconds 200
  }
}
if(-not $NoBrowser){Start-Process $atlasUrl}
Write-Output ('Calendar Atlas is ready: '+$atlasUrl)
