param(
  [ValidateSet('Menu','Start','Stop','Status')][string]$Action='Menu'
)

$ErrorActionPreference='Stop'
$atlasRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$atlasServer=Join-Path $atlasRoot 'server\server.mjs'
$atlasPort=8787
$atlasUrl="http://127.0.0.1:$atlasPort/"
$atlasInteractive=$false

function Get-AtlasListener {
  Get-NetTCPConnection -LocalPort $atlasPort -State Listen -ErrorAction SilentlyContinue
}

function Get-AtlasProcess {
  $listeners=@(Get-AtlasListener)
  if(-not $listeners.Count){return}
  try{$health=Invoke-RestMethod -Uri ($atlasUrl+'api/health') -TimeoutSec 2}catch{return}
  if($health.app -ne 'calendar-atlas' -or $health.pid -notin $listeners.OwningProcess){return}
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$health.pid)
  $entry=[Regex]::Escape($atlasServer)
  if($process -and $process.Name -ieq 'node.exe' -and $process.CommandLine -match ('(?:^|\s)"?'+$entry+'"?($|\s)')){
    return $process
  }
}

if($Action -eq 'Menu'){
  Write-Host 'Calendar Atlas'
  Write-Host '[1] Open or start   [2] Stop   [3] Status   [0] Exit'
  switch(Read-Host 'Choose an action'){
    '1' {$Action='Start'}
    '2' {$Action='Stop'}
    '3' {$Action='Status'}
    '0' {return}
    default {throw 'Select 1, 2, 3 or 0.'}
  }
  $atlasInteractive=$true
}

$atlasProcess=Get-AtlasProcess
switch($Action){
  'Status' {
    if($atlasProcess){Write-Host "Calendar Atlas is running: $atlasUrl"}
    elseif(Get-AtlasListener){Write-Host 'Port 8787 is occupied by another process.'}
    else {Write-Host 'Calendar Atlas is stopped.'}
  }
  'Start' {
    if(-not $atlasProcess){
      if(Get-AtlasListener){throw 'Port 8787 is occupied. Close that service before starting this copy of Calendar Atlas.'}
      $atlasNode=(Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue).Source
      if(-not $atlasNode){throw 'Install Node.js 22 or newer and add it to PATH.'}
      $atlasPortBefore=$env:PORT
      try{
        $env:PORT=[string]$atlasPort
        $atlasChild=Start-Process -FilePath $atlasNode -ArgumentList ('"'+$atlasServer+'"') -WorkingDirectory $atlasRoot -WindowStyle Hidden -PassThru
      }finally{$env:PORT=$atlasPortBefore}
      $atlasDeadline=[DateTime]::UtcNow.AddSeconds(12)
      while(-not(Get-AtlasProcess)){
        $atlasChild.Refresh()
        if($atlasChild.HasExited -or [DateTime]::UtcNow -gt $atlasDeadline){
          throw 'Calendar Atlas did not start. Run npm start in this project to see the server output.'
        }
        Start-Sleep -Milliseconds 200
      }
    }
    Start-Process $atlasUrl
    Write-Host "Calendar Atlas is ready: $atlasUrl"
  }
  'Stop' {
    if($atlasProcess){
      Stop-Process -Id $atlasProcess.ProcessId
      Write-Host 'Calendar Atlas stopped.'
    }elseif(Get-AtlasListener){
      throw 'Port 8787 is occupied by another process. Stop it from the terminal or application that started it.'
    }else{
      Write-Host 'Calendar Atlas is already stopped.'
    }
  }
}
if($atlasInteractive -and $Action -ne 'Start'){[void](Read-Host 'Press Enter to close')}
