<#
.SYNOPSIS
  把 Outlook 日历中「正文体积很大」的约会批量转换为纯文本，从而去掉导出的
  X-ALT-DESC（Word HTML）冗余。等价于在 Outlook 里手动：打开事件 → 点正文 →
  设置文本格式 → 更多命令 → 格式 → 邮件格式 → 纯文本 → 保存。

.说明
  - 仅适用于【中文界面 Outlook】桌面版（依赖这些中文菜单名）。必须用 Windows
    PowerShell 5.1 运行（powershell.exe），因为需要 UIAutomation 组件；pwsh 7 不行。
  - 默认只「列出候选」，不修改任何事件；加 -Apply 才真正转换。
  - 只处理 RTF 正文超过 -RtfThreshold、且实际导出里 X-ALT-DESC 超过 -AltThreshold
    的事件；其余（正常小事件）不碰。转换只丢格式，不改正文文字。
  - 个别窗口对 UI 自动化不暴露工具栏时会失败，脚本会标记「需手动」，按上面的
    手动步骤处理即可。转换是真实写回 Outlook，会同步到云端与其它设备。

.用法
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\outlook-plaintext.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\outlook-plaintext.ps1 -Apply
  可选：-RtfThreshold 20000  -AltThreshold 2000
#>
param(
  [int]$RtfThreshold = 20000,
  [int]$AltThreshold = 2000,
  [switch]$Apply
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public class OLW {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,int d,UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  public static void Click(int x,int y){ SetCursorPos(x,y); System.Threading.Thread.Sleep(120); mouse_event(0x0002,0,0,0,UIntPtr.Zero); System.Threading.Thread.Sleep(60); mouse_event(0x0004,0,0,0,UIntPtr.Zero); }
}
"@
$AE = [System.Windows.Automation.AutomationElement]
$CT = [System.Windows.Automation.ControlType]

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
$cal = $ns.GetDefaultFolder(9)
$tmpBase = Join-Path $env:TEMP ('olplain-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmpBase | Out-Null

function Get-AltDescLen([string]$path) {
  if (-not (Test-Path $path)) { return -1 }
  $lines = Get-Content -LiteralPath $path
  $u = New-Object System.Collections.Generic.List[string]
  foreach ($l in $lines) { if ($l -match '^[ \t]' -and $u.Count -gt 0) { $u[$u.Count-1] += $l.Substring(1) } else { $u.Add($l) } }
  $a = 0; foreach ($x in $u) { if ($x -match '^X-ALT-DESC[;:]') { $a = $x.Length } }
  return $a
}
function Measure-Alt($item, [int]$idx) {
  $p = Join-Path $tmpBase ("m$idx.ics")
  try { $item.SaveAs($p, 8) } catch { return -1 }
  $r = Get-AltDescLen $p
  Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
  return $r
}
function Get-InspWin($inspector, $item) {
  try {
    if ($ol.ActiveInspector().CurrentItem.EntryID -ne $item.EntryID) { return $null }
    $window = $AE::FromHandle([OLW]::GetForegroundWindow())
    if ($window.Current.Name -eq $inspector.Caption) { return $window }
  } catch {}
  return $null
}

# 候选：RTF 正文较大者
$cands = @()
foreach ($x in $cal.Items) {
  try {
    $rtfLen = ([string]$x.RTFBody).Length
    if ($rtfLen -gt $RtfThreshold) { $cands += ,@{ Item = $x; Rtf = $rtfLen } }
  } catch {}
}

Write-Host ("候选（RTF 正文 > " + $RtfThreshold + "）：" + $cands.Count + " 条")
$converted = 0; $skipped = 0; $failed = @()

foreach ($c in $cands) {
  $it = $c.Item
  $subject = [string]$it.Subject
  $alt = Measure-Alt $it ([guid]::NewGuid().GetHashCode())
  if ($alt -le $AltThreshold) { $skipped++; continue }   # 实际导出已很小，跳过
  Write-Host ("  待转: " + $subject + " | " + ([string]$it.Start) + " | RTF=" + $c.Rtf + " X-ALT-DESC=" + $alt)
  if (-not $Apply) { continue }

  $beforeBody = [string]$it.Body
  $insp = $it.GetInspector; $insp.Display(); Start-Sleep -Milliseconds 2000
  $win = Get-InspWin $insp $it
  if (-not $win) { $failed += ($subject + '（窗口未找到）'); try { $insp.Close(1) } catch {}; continue }
  try {
    $nh = [IntPtr]$win.Current.NativeWindowHandle
    if ($nh -ne [IntPtr]::Zero) { [OLW]::ShowWindow($nh, 9) | Out-Null; [OLW]::SetForegroundWindow($nh) | Out-Null; [OLW]::BringWindowToTop($nh) | Out-Null }
  } catch {}
  Start-Sleep -Milliseconds 700
  $doc = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $CT::Document)))
  if ($doc) { try { $doc.SetFocus() } catch {} }
  $tabCond = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '设置文本格式')),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $CT::TabItem)))
  $tab = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tabCond)
  if (-not $tab) { $failed += ($subject + '（工具栏读不到）'); try { $insp.Close(1) } catch {}; continue }
  try { ($tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)).Select() } catch {}
  Start-Sleep -Milliseconds 800
  $win = Get-InspWin $insp $it
  if (-not $win) { $failed += ($subject + '（窗口已切换）'); try { $insp.Close(1) } catch {}; continue }
  $more = $null
  foreach ($e in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) { try { if ($e.Current.Name -like '更多命令*设置文本格式*') { $more = $e; break } } catch {} }
  if (-not $more) { foreach ($e in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) { try { if ($e.Current.ControlType.ProgrammaticName -match 'MenuItem' -and $e.Current.Name -like '更多命令*') { $more = $e; break } } catch {} } }
  if (-not $more) { $failed += ($subject + '（找不到“更多命令”）'); try { $insp.Close(1) } catch {}; continue }
  try { ($more.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand() } catch {}
  Start-Sleep -Milliseconds 900
  $mc = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $CT::MenuItem)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $win.Current.ProcessId)))
  $mf = $null; foreach ($m in $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $mc)) { try { if ($m.Current.Name -eq '邮件格式') { $mf = $m; break } } catch {} }
  if (-not $mf) { $failed += ($subject + '（找不到“邮件格式”）'); [System.Windows.Forms.SendKeys]::SendWait('{ESC}'); try { $insp.Close(1) } catch {}; continue }
  try { ($mf.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand() } catch {}
  Start-Sleep -Milliseconds 900
  $pt = $null; foreach ($m in $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $mc)) { try { if ($m.Current.Name -eq '纯文本') { $pt = $m; break } } catch {} }
  if (-not $pt) { $failed += ($subject + '（找不到“纯文本”）'); [System.Windows.Forms.SendKeys]::SendWait('{ESC}'); try { $insp.Close(1) } catch {}; continue }
  try {
    if (-not (Get-InspWin $insp $it)) { throw '窗口已切换' }
    $r = $pt.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Width -le 0 -or $r.Height -le 0) { throw '菜单不可见' }
    [OLW]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
  } catch { $failed += ($subject + '（点击失败）'); try { $insp.Close(1) } catch {}; continue }
  Start-Sleep -Milliseconds 1400
  # 只确认由当前约会窗口拥有的前台对话框。
  $dialog = [OLW]::GetForegroundWindow()
  $owner = [OLW]::GetWindow($dialog, 4) # GW_OWNER
  foreach ($w in $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    try {
      if ($owner -ne $nh -or [IntPtr]$w.Current.NativeWindowHandle -ne $dialog) { continue }
      $btns = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $CT::Button)))
      $names = @(); foreach ($b in $btns) { try { if ($b.Current.Name) { $names += $b.Current.Name } } catch {} }
      if (($names -contains '是') -and ($names -contains '否')) { foreach ($b in $btns) { try { if ($b.Current.Name -eq '是') { ($b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke(); break } } catch {} }; Start-Sleep -Milliseconds 500; break }
    } catch {}
  }
  try {
    if ([string]$it.Body -cne $beforeBody) { throw '正文文字已变化' }
    $it.Save()
  } catch {
    $failed += ($subject + '（正文校验或保存失败）')
    try { $insp.Close(1) } catch {}
    continue
  }
  try { $insp.Close(1) } catch {}
  Start-Sleep -Milliseconds 300
  $it2 = $null
  try { $it2 = $ns.GetItemFromID($it.EntryID, $cal.StoreID) } catch {}
  $afterRtf = if ($it2) { ([string]$it2.RTFBody).Length } else { -1 }
  if ($afterRtf -ge 0 -and $afterRtf -lt $RtfThreshold) { $converted++; Write-Host ("    已转: RTF " + $c.Rtf + " -> " + $afterRtf + "，文字一致=" + ($beforeBody -eq [string]$it2.Body)) }
  else { $failed += ($subject + '（转换后仍偏大，请手动）') }
}

try { Remove-Item -LiteralPath $tmpBase -Recurse -Force -ErrorAction SilentlyContinue } catch {}
Write-Host ''
Write-Host ("完成：候选 " + $cands.Count + "，已转 " + $converted + "，已很小跳过 " + $skipped + "，需手动 " + $failed.Count)
if ($failed.Count) { $failed | ForEach-Object { Write-Host ("  - " + $_) } }
if (-not $Apply) { Write-Host '当前为预览模式（未修改任何事件）。加 -Apply 才会转换。' }
