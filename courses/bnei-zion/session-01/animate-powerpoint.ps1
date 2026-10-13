# Native PowerPoint animation pass. Never animate the full-frame background.
param(
    [string]$DeckPath = 'output/bnei-zion-session-01/בינה מלאכותית בעבודה שלכם - מפגש ראשון.pptx',
    [string]$PlanPath = '.cache/course-build/motion-plan.json',
    [string]$OutputPath = '.cache/course-build/animated-candidate.pptx'
)
$ErrorActionPreference = 'Stop'
Add-Type -Path 'C:/Windows/assembly/GAC_MSIL/office/15.0.0.0__71e9bce111e9429c/OFFICE.DLL'
Add-Type -Path 'C:/Windows/assembly/GAC_MSIL/Microsoft.Office.Interop.PowerPoint/15.0.0.0__71e9bce111e9429c/Microsoft.Office.Interop.PowerPoint.dll'
$coursePlan = Get-Content -LiteralPath $PlanPath -Raw -Encoding utf8 | ConvertFrom-Json
$courseSourcePath = (Resolve-Path -LiteralPath $DeckPath).Path
$courseDestinationPath = Join-Path (Get-Location).Path $OutputPath
$courseWasOpen = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$courseApp = New-Object -ComObject PowerPoint.Application
$courseApp.DisplayAlerts = [Microsoft.Office.Interop.PowerPoint.PpAlertLevel]::ppAlertsNone
$courseAudit = @()
function Add-CourseEffect($sequence, $shape, [int]$kind, [int]$trigger, [double]$delay, [double]$duration, [bool]$words = $false) {
    $effect = $sequence.AddEffect($shape, $kind, 0, $trigger)
    if ($words) { $effect = $sequence.ConvertToTextUnitEffect($effect, 1) }
    $effect.Timing.Duration = $duration
    $effect.Timing.TriggerDelayTime = $delay
    $effect.Timing.SmoothStart = -1
    $effect.Timing.SmoothEnd = -1
    $effect.Exit = 0
    return $effect
}
try {
    $courseDeck = $courseApp.Presentations.Open($courseSourcePath, -1, 0, 0)
    $courseDeck.SlideShowSettings.ShowWithAnimation = -1
    foreach ($slide in $courseDeck.Slides) {
        $plan = $coursePlan[$slide.SlideIndex - 1]
        Write-Output ('Animate slide ' + $slide.SlideIndex + ': ' + $plan.transition)
        $sequence = $slide.TimeLine.MainSequence
        while ($sequence.Count -gt 0) { $sequence.Item(1).Delete() }
        $slide.SlideShowTransition.EntryEffect = [int][Enum]::Parse([Microsoft.Office.Interop.PowerPoint.PpEntryEffect], $plan.transition)
        $slide.SlideShowTransition.Duration = 0.35
        $slide.SlideShowTransition.AdvanceOnClick = -1
        $slide.SlideShowTransition.AdvanceOnTime = 0
        $slide.SlideShowTransition.SoundEffect.Type = 0
        $shapeIndex = 0
        $rowIndex = 0
        $markIndex = 0
        $backgroundCount = 0
        foreach ($shape in $slide.Shapes) {
            if ($shape.Width -gt $courseDeck.PageSetup.SlideWidth * .94 -and $shape.Height -gt $courseDeck.PageSetup.SlideHeight * .94) {
                $backgroundCount++
                continue
            }
            $hasText = $shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1
            $value = if ($hasText) { $shape.TextFrame.TextRange.Text.Trim() } else { '' }
            if ($hasText -and (($value -match '^\d{2}$' -and $shape.Top -gt 480 -and $shape.Width -lt 80) -or $value -match '^P\d{2}')) { continue }
            if ($hasText -and ($shape.Top -gt 455 -and $shape.Height -lt 45)) { continue } # Quiet links and copy hints.
            $shapeIndex++
            # Quiet fade, concurrent within an idea. Only teaching beats wait for clicks.
            $trigger = 2
            $kind = 10
            $delay = 0
            $duration = 0.42
            $byWord = $false
            if ($plan.layout -eq 'list' -and $hasText -and $shape.Top -gt 155 -and $shape.Top -lt 470) {
                $rowIndex++
                $trigger = 1
                $duration = 0.28
            } elseif ($plan.layout -eq 'compare' -and $shape.Left -lt 450) {
                if ($rowIndex -eq 0) { $trigger = 1; $rowIndex++ }
                $duration = 0.3
            }
            $null = Add-CourseEffect $sequence $shape $kind $trigger $delay $duration $byWord
        }
        $notes = $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange
        $notes.Text = ($notes.Text -replace '(?s)\r?\n\r?\nהנפשות:.*$', '')
        $notes.Text += "`r`rהנפשות: הכותרת והמסר נכנסים יחד בפייד עדין; אין התקרבות, עלייה או הופעה מילה אחר מילה. ברשימות, לחיצה חושפת בכל פעם רעיון נוסף; בהשוואה, לחיצה חושפת את הצד השני. לאחר חשיפת כל התוכן, הלחיצה הבאה מעבירה שקף. אין יציאות לאובייקטים ואין מעבר שקף מתוזמן."
        $courseAudit += [pscustomobject]@{slide=$slide.SlideIndex;layout=$plan.layout;transition=$plan.transition;effects=$sequence.Count;backgroundsStatic=$backgroundCount;clickRows=$rowIndex}
    }
    $courseDeck.SaveCopyAs($courseDestinationPath, 24)
    $courseDeck.Saved = -1
    $courseDeck.Close()
    $reopened = $courseApp.Presentations.Open($courseDestinationPath, -1, 0, 0)
    $verified = 0
    foreach ($slide in $reopened.Slides) {
        if ($slide.TimeLine.MainSequence.Count -lt 1) { throw ('No animation on slide ' + $slide.SlideIndex) }
        foreach ($effect in $slide.TimeLine.MainSequence) {
            if ($effect.Exit -eq -1) { throw 'Unexpected exit animation' }
            $verified++
        }
        if ($slide.SlideShowTransition.AdvanceOnTime -ne 0) { throw 'Unexpected automatic slide navigation' }
    }
    $reopened.Close()
    $courseAudit | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 '.cache/course-build/animation-audit.json'
    Write-Output ('Verified native animations on ' + $courseAudit.Count + ' slides, ' + $verified + ' effects')
} finally {
    if (-not $courseWasOpen) { $courseApp.Quit() }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($courseApp) | Out-Null
}
