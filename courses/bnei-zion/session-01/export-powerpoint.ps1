# Optional native verification on the presenter's Windows computer.
param(
    [string]$DeckPath = 'output/bnei-zion-session-01/בינה מלאכותית בעבודה שלכם - מפגש ראשון.pptx',
    [string]$RenderDirectory = '.cache/course-build/native',
    [string]$PdfPath = 'output/bnei-zion-session-01/בינה מלאכותית בעבודה שלכם - מפגש 1.pdf'
)
$ErrorActionPreference = 'Stop'
$resolvedCourseDeck = (Resolve-Path -LiteralPath $DeckPath).Path
$courseNativeDirectory = Join-Path (Get-Location).Path $RenderDirectory
New-Item -ItemType Directory -Force -Path $courseNativeDirectory | Out-Null
$courseHadPowerPoint = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$coursePowerPointApp = New-Object -ComObject PowerPoint.Application
try {
    $coursePresentation = $coursePowerPointApp.Presentations.Open($resolvedCourseDeck, -1, 0, 0)
    $coursePresentation.Export($courseNativeDirectory, 'PNG', 1600, 900)
    $coursePdfPath = Join-Path (Get-Location).Path $PdfPath
    $coursePresentation.SaveAs($coursePdfPath, 32)
    $courseTextCount = 0
    $courseOverflows = @()
    foreach ($courseSlide in $coursePresentation.Slides) {
        foreach ($courseShape in $courseSlide.Shapes) {
            if ($courseShape.HasTextFrame -eq -1 -and $courseShape.TextFrame.HasText -eq -1) {
                $courseTextCount++
                if ($courseShape.TextFrame2.TextRange.BoundHeight -gt $courseShape.Height + 2) {
                    $courseOverflows += ('Slide ' + $courseSlide.SlideIndex + ': ' + $courseShape.TextFrame2.TextRange.Text)
                }
            }
        }
    }
    Write-Output ('Native PowerPoint: ' + $coursePresentation.Slides.Count + ' slides; ' + $courseTextCount + ' editable text boxes; ' + $courseOverflows.Count + ' vertical overflows')
    $courseOverflows | Write-Output
    $coursePresentation.Saved=-1
    $coursePresentation.Close()
} finally {
    if (-not $courseHadPowerPoint) { $coursePowerPointApp.Quit() }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($coursePowerPointApp) | Out-Null
}
