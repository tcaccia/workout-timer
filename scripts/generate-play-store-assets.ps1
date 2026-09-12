Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "play-store-assets"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$fontTitle = New-Object System.Drawing.Font("Arial", 54, [System.Drawing.FontStyle]::Bold)
$fontH1 = New-Object System.Drawing.Font("Arial", 44, [System.Drawing.FontStyle]::Bold)
$fontH2 = New-Object System.Drawing.Font("Arial", 32, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font("Arial", 25, [System.Drawing.FontStyle]::Regular)
$fontSmall = New-Object System.Drawing.Font("Arial", 20, [System.Drawing.FontStyle]::Bold)
$fontTiny = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Regular)
$fontTime = New-Object System.Drawing.Font("Arial", 96, [System.Drawing.FontStyle]::Bold)

$bg = [System.Drawing.Color]::FromArgb(20, 20, 20)
$panel = [System.Drawing.Color]::FromArgb(30, 30, 30)
$panelSoft = [System.Drawing.Color]::FromArgb(38, 38, 38)
$line = [System.Drawing.Color]::FromArgb(61, 61, 61)
$text = [System.Drawing.Color]::FromArgb(246, 244, 236)
$muted = [System.Drawing.Color]::FromArgb(188, 184, 174)
$accent = [System.Drawing.Color]::FromArgb(77, 211, 151)
$rest = [System.Drawing.Color]::FromArgb(90, 166, 255)
$purple = [System.Drawing.Color]::FromArgb(179, 157, 219)
$purpleSoft = [System.Drawing.Color]::FromArgb(237, 231, 246)

function New-Bitmap($width, $height, $color) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear($color)
  return @($bitmap, $graphics)
}

function Save-Png($bitmap, $path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

function Brush($color) {
  return New-Object System.Drawing.SolidBrush($color)
}

function Pen($color, $width = 1) {
  $pen = New-Object System.Drawing.Pen($color, $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  return $pen
}

function Draw-Text($g, $textValue, $font, $color, $x, $y, $width = 900, $height = 120, $align = "Near") {
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::$align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $rect = New-Object System.Drawing.RectangleF($x, $y, $width, $height)
  $g.DrawString($textValue, $font, (Brush $color), $rect, $format)
}

function Draw-RoundRect($g, $x, $y, $w, $h, $radius, $fill, $stroke = $null) {
  if ($radius -le 0) {
    $rect = New-Object System.Drawing.RectangleF([single]$x, [single]$y, [single]$w, [single]$h)
    $g.FillRectangle((Brush $fill), $rect)
    if ($stroke) { $g.DrawRectangle((Pen $stroke 2), $x, $y, $w, $h) }
    return
  }
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc((New-Object System.Drawing.RectangleF([single]$x, [single]$y, [single]$d, [single]$d)), 180, 90)
  $path.AddArc((New-Object System.Drawing.RectangleF([single]($x + $w - $d), [single]$y, [single]$d, [single]$d)), 270, 90)
  $path.AddArc((New-Object System.Drawing.RectangleF([single]($x + $w - $d), [single]($y + $h - $d), [single]$d, [single]$d)), 0, 90)
  $path.AddArc((New-Object System.Drawing.RectangleF([single]$x, [single]($y + $h - $d), [single]$d, [single]$d)), 90, 90)
  $path.CloseFigure()
  $g.FillPath((Brush $fill), $path)
  if ($stroke) { $g.DrawPath((Pen $stroke 2), $path) }
}

function Draw-AppIcon($g, $x, $y, $size, $withBackground = $true) {
  if ($withBackground) {
    Draw-RoundRect $g $x $y $size $size 106 ([System.Drawing.Color]::FromArgb(248, 248, 248)) $null
  }
  $cx = $x + ($size * 0.52)
  $cy = $y + ($size * 0.54)
  $r = $size * 0.28
  $stroke = [Math]::Max(14, $size * 0.075)
  $g.DrawArc((Pen $purple $stroke), $cx - $r, $cy - $r, $r * 2, $r * 2, 25, 310)
  $g.FillEllipse((Brush $purpleSoft), $cx - ($r * 0.72), $cy - ($r * 0.72), $r * 1.44, $r * 1.44)
  Draw-RoundRect $g ($cx - $size * 0.08) ($y + $size * 0.12) ($size * 0.16) ($size * 0.14) 14 $purple $null
  $g.DrawLine((Pen $purple ($stroke * 0.45)), $cx, $cy, $cx + $r * 0.45, $cy - $r * 0.38)
  $g.FillEllipse((Brush $purple), $cx - $stroke * 0.32, $cy - $stroke * 0.32, $stroke * 0.64, $stroke * 0.64)
  $dash = Pen $purple ($stroke * 0.5)
  $g.DrawLine($dash, $x + $size * 0.1, $cy - $size * 0.04, $x + $size * 0.29, $cy - $size * 0.04)
  $g.DrawLine($dash, $x + $size * 0.07, $cy + $size * 0.08, $x + $size * 0.29, $cy + $size * 0.08)
  $g.DrawLine($dash, $x + $size * 0.1, $cy + $size * 0.2, $x + $size * 0.29, $cy + $size * 0.2)
}

function Draw-PhoneFrame($g, $x, $y, $w, $h) {
  Draw-RoundRect $g $x $y $w $h 44 ([System.Drawing.Color]::FromArgb(12, 12, 12)) ([System.Drawing.Color]::FromArgb(70, 70, 70))
  Draw-RoundRect $g ($x + 20) ($y + 20) ($w - 40) ($h - 40) 30 $bg $null
}

function Draw-AppHeader($g, $x, $y, $w, $activeTab) {
  Draw-Text $g "WORKOUT TIMER" $fontSmall $accent ($x + 48) ($y + 44) ($w - 120) 30
  Draw-Text $g "Workout Timer" $fontTitle $text ($x + 48) ($y + 78) ($w - 180) 80
  Draw-RoundRect $g ($x + $w - 126) ($y + 56) 72 72 0 $panelSoft $line
  Draw-Text $g "ON" $fontTiny $text ($x + $w - 126) ($y + 82) 72 32 "Center"

  $tabY = $y + 176
  $tabW = ($w - 96) / 2
  $tabs = @("Simple", "Workout", "Saved", "About")
  for ($i = 0; $i -lt 4; $i++) {
    $tx = $x + 48 + (($i % 2) * $tabW)
    $ty = $tabY + ([Math]::Floor($i / 2) * 74)
    $selected = $tabs[$i] -eq $activeTab
    $fill = if ($selected) { $accent } else { [System.Drawing.Color]::FromArgb(21, 21, 21) }
    $fg = if ($selected) { [System.Drawing.Color]::FromArgb(6, 19, 13) } else { $muted }
    $g.FillRectangle((Brush $fill), $tx, $ty, $tabW, 72)
    $g.DrawRectangle((Pen $line 1), $tx, $ty, $tabW, 72)
    Draw-Text $g $tabs[$i] $fontBody $fg $tx ($ty + 20) $tabW 34 "Center"
  }
}

function Draw-TimerDial($g, $cx, $cy, $r, $time, $caption) {
  $g.DrawEllipse((Pen $accent 36), $cx - $r, $cy - $r, $r * 2, $r * 2)
  Draw-Text $g $time $fontTime $text ($cx - 220) ($cy - 74) 440 120 "Center"
  Draw-Text $g $caption $fontBody $muted ($cx - 220) ($cy + 40) 440 60 "Center"
}

function Draw-Button($g, $label, $x, $y, $w, $h, $primary = $false) {
  $fill = if ($primary) { $accent } else { $panelSoft }
  $fg = if ($primary) { [System.Drawing.Color]::FromArgb(6, 19, 13) } else { $text }
  $g.FillRectangle((Brush $fill), $x, $y, $w, $h)
  $g.DrawRectangle((Pen $line 1), $x, $y, $w, $h)
  Draw-Text $g $label $fontBody $fg $x ($y + 25) $w 40 "Center"
}

function Draw-Card($g, $x, $y, $w, $h, $title, $body, $tag = $null) {
  $g.FillRectangle((Brush $panel), $x, $y, $w, $h)
  $g.DrawRectangle((Pen $line 1), $x, $y, $w, $h)
  if ($tag) { Draw-Text $g $tag $fontTiny $accent ($x + 28) ($y + 24) ($w - 56) 24 }
  Draw-Text $g $title $fontH2 $text ($x + 28) ($y + 54) ($w - 56) 52
  Draw-Text $g $body $fontBody $muted ($x + 28) ($y + 118) ($w - 56) ($h - 132)
}

# App icon.
$pair = New-Bitmap 512 512 ([System.Drawing.Color]::Transparent)
$icon = $pair[0]; $g = $pair[1]
Draw-AppIcon $g 0 0 512 $true
Save-Png $icon (Join-Path $out "app-icon-512.png")

# Feature graphic.
$pair = New-Bitmap 1024 500 $bg
$feature = $pair[0]; $g = $pair[1]
$g.FillRectangle((Brush ([System.Drawing.Color]::FromArgb(18, 34, 29))), 0, 0, 1024, 500)
Draw-AppIcon $g 64 96 280 $true
Draw-Text $g "Workout Timer" $fontTitle $text 398 108 560 78
Draw-Text $g "Flexible workouts with sound cues." $fontH2 $muted 400 190 540 100
Draw-Button $g "Simple" 400 332 150 62 $true
Draw-Button $g "Workout" 570 332 172 62 $false
Draw-Button $g "Saved" 762 332 150 62 $false
Save-Png $feature (Join-Path $out "feature-graphic-1024x500.png")

function New-Screenshot($name, $activeTab, $screenKind) {
  $pair = New-Bitmap 1080 1920 ([System.Drawing.Color]::FromArgb(9, 32, 32))
  $bitmap = $pair[0]; $g = $pair[1]
  Draw-PhoneFrame $g 80 40 920 1840
  $x = 100; $y = 60; $w = 880
  Draw-AppHeader $g $x $y $w $activeTab

  if ($screenKind -eq "simple") {
    Draw-Text $g "Ready" $fontBody ([System.Drawing.Color]::FromArgb(6, 19, 13)) ($x + 64) 410 220 48 "Center"
    $g.FillRectangle((Brush $accent), $x + 64, 398, 220, 58)
    Draw-Text $g "Round 1 of 10" $fontBody $muted ($x + 48) 490 500 42
    Draw-TimerDial $g 540 860 290 "00:40" "10 rounds, 20s rest"
    Draw-Button $g "Start" 148 1250 390 90 $true
    Draw-Button $g "Reset" 572 1250 390 90 $false
    Draw-Card $g 120 1400 840 300 "Sequence" "Rounds: 10`nWork: 40 seconds`nRest: 20 seconds" "SIMPLE TIMER"
  }

  if ($screenKind -eq "workout") {
    $g.FillRectangle((Brush $accent), $x + 64, 398, 220, 58)
    Draw-Text $g "Ready" $fontBody ([System.Drawing.Color]::FromArgb(6, 19, 13)) ($x + 64) 410 220 48 "Center"
    Draw-Text $g "Exercise 1 - Cardio" $fontH2 $muted ($x + 48) 492 700 48
    Draw-TimerDial $g 540 860 290 "01:00" "Cardio Sequence 1"
    Draw-Button $g "Start" 148 1250 390 90 $true
    Draw-Button $g "Reset" 572 1250 390 90 $false
    Draw-Card $g 120 1400 840 340 "Workout Easy" "Create any number of exercises, work/rest blocks, and ABCD rounds." "FULL PLAN"
  }

  if ($screenKind -eq "saved") {
    Draw-Card $g 120 398 840 230 "Workout Easy" "3 exercises - Cardio, Body, Abs`nTap Load to start or edit the plan." "LIBRARY"
    Draw-Card $g 120 660 840 230 "Morning Intervals" "8 rounds - 40s work, 20s rest`nSaved on this device." "SAVED WORKOUT"
    Draw-Card $g 120 922 840 230 "Core Session" "ABCD blocks with 60s rest`nReady for the next training day." "SAVED WORKOUT"
  }

  if ($screenKind -eq "about") {
    Draw-Card $g 120 398 840 440 "About Workout Timer" "Workout Timer is an offline interval timer for configurable workout plans.`n`nNo account is required. Workout plans are stored on this device. The app does not collect personal data, use analytics, or send workout data to a server." "PRIVACY"
  }

  Save-Png $bitmap (Join-Path $out $name)
}

New-Screenshot "phone-01-simple-timer.png" "Simple" "simple"
New-Screenshot "phone-02-workout-plan.png" "Workout" "workout"
New-Screenshot "phone-03-saved-workouts.png" "Saved" "saved"
New-Screenshot "phone-04-privacy-about.png" "About" "about"

Write-Host "Play Store assets generated in $out"
