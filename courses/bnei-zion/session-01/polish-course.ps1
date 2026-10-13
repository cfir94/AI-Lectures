param(
    [string]$DeckPath='output/bnei-zion-session-01/בינה מלאכותית בעבודה שלכם - מפגש ראשון - מונפש.pptx',
    [string]$OutputPath='.cache/course-build/polished-layout.pptx'
)
$ErrorActionPreference='Stop'
$plans=Get-Content '.cache/course-build/motion-plan.json' -Raw -Encoding utf8 | ConvertFrom-Json
$alreadyOpen=@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$app=New-Object -ComObject PowerPoint.Application
try {
    $deck=$app.Presentations.Open((Resolve-Path -LiteralPath $DeckPath).Path,-1,0,0)
    foreach ($slide in $deck.Slides) {
        $plan=$plans[$slide.SlideIndex-1]
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -ne -1 -or $shape.TextFrame.HasText -ne -1) { continue }
            $text=$shape.TextFrame.TextRange.Text.Trim()
            $font=$shape.TextFrame2.TextRange.Font
            if ($plan.layout -eq 'list' -and $shape.Top -gt 155 -and $shape.Top -lt 470) {
                $shape.Left=67.5; $shape.Width=825; $shape.Height=57
                $font.Size=31.5
            } elseif ($plan.layout -eq 'exercise' -and $shape.Left -gt 300 -and $shape.Top -gt 240 -and $shape.Top -lt 430) {
                $shape.Top=249; $shape.Height=168; $font.Size=28.5
            } elseif ($plan.layout -eq 'hero' -and $shape.Top -ge 310 -and $shape.Top -lt 440) {
                $shape.Top=292.5; $shape.Height=150
                $font.Size=if (($text -split "`r|`n" | Where-Object {$_}).Count -eq 3) {36} else {30}
            } elseif ($plan.layout -eq 'closing' -and $text -eq 'cfir94@gmail.com') {
                $shape.Height=51; $font.Size=25.5
            } elseif ($plan.layout -eq 'closing' -and $text -eq '052-656-8094') {
                $shape.Top=455.25; $shape.Height=51; $font.Size=25.5
            }
            if ($slide.SlideIndex -eq 29 -and $text -eq 'Perplexity' -and $shape.Left -gt 450) {
                $shape.TextFrame.TextRange.Text=$plan.title
            }
        }
    }
    $deck.SaveCopyAs((Join-Path (Get-Location).Path $OutputPath),24)
    $deck.Saved=-1; $deck.Close()
    Write-Output 'Refined typography and alignment; preserved native editable text and artwork.'
} finally {
    if (-not $alreadyOpen) { $app.Quit() }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
