param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

try {
    $outlook = New-Object -ComObject Outlook.Application
    $session = $outlook.GetNamespace('MAPI')
} catch {
    exit 2
}

try {
    $calendar = $session.GetDefaultFolder(9) # olFolderCalendar
    $exporter = $calendar.GetCalendarExporter()
    $exporter.RestrictToWorkingHours = $false
    $exporter.CalendarDetail = 2 # olFullDetails
    $exporter.IncludeWholeCalendar = $true
    $exporter.IncludePrivateDetails = $true
    $exporter.IncludeAttachments = $false
    $exporter.SaveAsICal($OutputPath)
} catch {
    exit 3
}
