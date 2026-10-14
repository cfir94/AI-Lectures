param(
    [string]$DeckPath='.cache/course-focused/session-01-draft.pptx',
    [string]$SectionsPath='.cache/course-focused/sections.json',
    [string]$OutputPath='.cache/course-focused/sectioned-draft.pptx'
)
$ErrorActionPreference='Stop'
$sections=Get-Content -LiteralPath $SectionsPath -Raw -Encoding utf8 | ConvertFrom-Json
$wasOpen=@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$app=New-Object -ComObject PowerPoint.Application
try {
    $deck=$app.Presentations.Open((Resolve-Path -LiteralPath $DeckPath).Path,-1,0,0)
    $plan=Get-Content '.cache/course-focused/motion-plan.json' -Raw -Encoding utf8 | ConvertFrom-Json
    for ($index=1;$index -le $deck.Slides.Count;$index++) {
        $deck.Slides.Item($index).SlideShowTransition.Hidden=if($plan[$index-1].visibility -eq 'hidden'){-1}else{0}
    }
    foreach ($section in $sections) {
        $null=$deck.SectionProperties.AddBeforeSlide([int]$section.start,[string]$section.title)
    }
    if ($deck.SectionProperties.Count -ne $sections.Count) { throw 'Unexpected section count' }
    $deck.SaveCopyAs((Join-Path (Get-Location).Path $OutputPath),24)
    $deck.Saved=-1; $deck.Close()
    Write-Output ('Added '+$sections.Count+' native PowerPoint sections')
} finally {
    if (-not $wasOpen) { $app.Quit() }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
