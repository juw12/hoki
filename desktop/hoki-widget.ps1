<#
Hoki desktop widget: a waving lucky cat that sits on your Windows desktop.
Click it for a luck boost. Drag to move. Right-click for options.

Run:  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File hoki-widget.ps1
Needs cat.svg next to this file (or in ..\assets\). No install, no admin.

-Snapshot <png> renders one frame to a PNG and exits (used for automated checks;
it does not read or write your saved luck).
#>
param(
    [string]$Snapshot,
    [int]$SnapshotTaps = 0,
    [double]$SnapshotWave = 1,
    [ValidateSet('Small', 'Medium', 'Large')]
    [string]$SnapshotSize = 'Large'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xml

$Culture = [Globalization.CultureInfo]::InvariantCulture

# ---------- tuning (same values as js/app.js) ----------
$BaseWavesPerSec = 0.7
$MaxExtraWavesPerSec = 2.6
$BoostPerTap = 0.08
$BoostHalfLifeSec = 6
$Milestones = @(8, 28, 88, 168, 288, 888, 1688, 8888)
$WidgetWidths = @{ Small = 110; Medium = 150; Large = 210 }

# Chinese characters as code points so this file stays plain ASCII.
$Fu = [string][char]0x798F    # luck
$Fa = [string][char]0x53D1    # prosper
$Blessings = @($Fu, [string][char]0x8D22, [string][char]0x8FD0, [string][char]0x559C)

# ---------- saved state ----------
$StateDir = Join-Path $env:APPDATA 'Hoki'
$StatePath = Join-Path $StateDir 'state.json'

# The widget runs with a hidden console, so write any crash to a log file.
trap {
    New-Item -ItemType Directory -Force $StateDir | Out-Null
    "$(Get-Date -Format s)  $($_ | Out-String)" | Add-Content (Join-Path $StateDir 'error.log')
    break
}

function Get-TodayKey {
    (Get-Date).ToString('yyyy-MM-dd')
}

$state = [ordered]@{
    total   = 0
    today   = 0
    day     = (Get-TodayKey)
    sound   = $true
    topmost = $true
    size    = 'Medium'
    left    = $null
    top     = $null
}
if (-not $Snapshot -and (Test-Path $StatePath)) {
    try {
        $saved = Get-Content $StatePath -Raw | ConvertFrom-Json
        foreach ($key in @($state.Keys)) {
            if ($null -ne $saved.$key) {
                $state[$key] = $saved.$key
            }
        }
    } catch {
        # Corrupt state file: start fresh.
    }
}
$state.total = [int]$state.total
$state.today = [int]$state.today
if ($state.day -ne (Get-TodayKey)) {
    $state.day = Get-TodayKey
    $state.today = 0
}
if ($Snapshot) {
    $state.size = $SnapshotSize
    $state.sound = $false
}

function Save-State {
    if ($Snapshot) {
        return
    }
    New-Item -ItemType Directory -Force $StateDir | Out-Null
    ($state | ConvertTo-Json) | Set-Content -Encoding UTF8 $StatePath
}

# ---------- single instance ----------
if (-not $Snapshot) {
    $isFirstInstance = $false
    $script:mutex = New-Object Threading.Mutex($true, 'Local\HokiLuckyCatWidget', [ref]$isFirstInstance)
    if (-not $isFirstInstance) {
        exit
    }
}

# ---------- draw cat.svg with WPF shapes ----------
$svgPath = @(
    (Join-Path $PSScriptRoot 'cat.svg'),
    (Join-Path $PSScriptRoot '..\assets\cat.svg')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $svgPath) {
    throw 'cat.svg not found next to hoki-widget.ps1'
}
$svg = New-Object Xml.XmlDocument
$svg.Load((Resolve-Path $svgPath).Path)
$viewBox = $svg.DocumentElement.GetAttribute('viewBox').Split(' ') | ForEach-Object { [double]::Parse($_, $Culture) }
$vbX = $viewBox[0]
$vbY = $viewBox[1]
$vbW = $viewBox[2]
$vbH = $viewBox[3]
$svgRoot = $svg.DocumentElement
$pawPoint = $svgRoot.GetAttribute('data-paw').Split(' ') | ForEach-Object { [double]::Parse($_, $Culture) }
$counterBox = $svgRoot.GetAttribute('data-counter').Split(' ') | ForEach-Object { [double]::Parse($_, $Culture) }
$pivot = $svgRoot.GetAttribute('data-pivot').Split(' ') | ForEach-Object { [double]::Parse($_, $Culture) }
$wrist = $svgRoot.GetAttribute('data-wrist').Split(' ') | ForEach-Object { [double]::Parse($_, $Culture) }
$beckon = $svgRoot.GetAttribute('data-beckon').Split(' ') | ForEach-Object { [double]::Parse($_, $Culture) }

$BrushConverter = New-Object Windows.Media.BrushConverter

function Get-Num($element, [string]$name, [double]$default = 0) {
    $raw = $element.GetAttribute($name)
    if ([string]::IsNullOrEmpty($raw)) {
        return $default
    }
    return [double]::Parse($raw, $Culture)
}

function New-ArtShape($element) {
    $geometry = $null
    switch ($element.LocalName) {
        'path' {
            $geometry = [Windows.Media.Geometry]::Parse($element.GetAttribute('d'))
        }
        'circle' {
            $r = Get-Num $element 'r'
            $center = New-Object Windows.Point((Get-Num $element 'cx'), (Get-Num $element 'cy'))
            $geometry = New-Object Windows.Media.EllipseGeometry($center, $r, $r)
        }
        'ellipse' {
            $center = New-Object Windows.Point((Get-Num $element 'cx'), (Get-Num $element 'cy'))
            $geometry = New-Object Windows.Media.EllipseGeometry($center, (Get-Num $element 'rx'), (Get-Num $element 'ry'))
        }
        'text' {
            $family = New-Object Windows.Media.FontFamily('Microsoft YaHei UI, Microsoft YaHei, SimHei')
            $typeface = New-Object Windows.Media.Typeface(
                $family,
                [Windows.FontStyles]::Normal,
                [Windows.FontWeights]::Bold,
                [Windows.FontStretches]::Normal
            )
            $formatted = New-Object Windows.Media.FormattedText(
                $element.InnerText,
                $Culture,
                [Windows.FlowDirection]::LeftToRight,
                $typeface,
                (Get-Num $element 'font-size' 16),
                [Windows.Media.Brushes]::Black,
                1.0
            )
            $x = Get-Num $element 'x'
            if ($element.GetAttribute('text-anchor') -eq 'middle') {
                $x -= $formatted.Width / 2
            }
            $origin = New-Object Windows.Point($x, ((Get-Num $element 'y') - $formatted.Baseline))
            $geometry = $formatted.BuildGeometry($origin)
        }
        default {
            return $null
        }
    }

    $shape = New-Object Windows.Shapes.Path
    $shape.Data = $geometry
    $fill = $element.GetAttribute('fill')
    if ($fill -and $fill -ne 'none') {
        $shape.Fill = $BrushConverter.ConvertFromString($fill)
    }
    $stroke = $element.GetAttribute('stroke')
    if ($stroke -and $stroke -ne 'none') {
        $shape.Stroke = $BrushConverter.ConvertFromString($stroke)
        $shape.StrokeThickness = Get-Num $element 'stroke-width' 1
    }
    if ($element.GetAttribute('stroke-linecap') -eq 'round') {
        $shape.StrokeStartLineCap = 'Round'
        $shape.StrokeEndLineCap = 'Round'
    }
    if ($element.GetAttribute('stroke-linejoin') -eq 'round') {
        $shape.StrokeLineJoin = 'Round'
    }
    $shape.Opacity = Get-Num $element 'opacity' 1
    return $shape
}

$art = New-Object Windows.Controls.Canvas
$art.Width = $vbW
$art.Height = $vbH
$scene = New-Object Windows.Controls.Canvas
$scene.RenderTransform = New-Object Windows.Media.TranslateTransform(-$vbX, -$vbY)
[void]$art.Children.Add($scene)

# Gold glow behind the cat; brightens with the boost.
$glow = New-Object Windows.Shapes.Ellipse
$glow.Width = 230
$glow.Height = 230
$glowBrush = New-Object Windows.Media.RadialGradientBrush
$glowBrush.GradientStops.Add((New-Object Windows.Media.GradientStop(([Windows.Media.Color]::FromArgb(170, 245, 197, 66)), 0)))
$glowBrush.GradientStops.Add((New-Object Windows.Media.GradientStop(([Windows.Media.Color]::FromArgb(0, 245, 197, 66)), 1)))
$glow.Fill = $glowBrush
$glow.Opacity = 0
$glow.IsHitTestVisible = $false
[Windows.Controls.Canvas]::SetLeft($glow, 5)
[Windows.Controls.Canvas]::SetTop($glow, 20)
[void]$scene.Children.Add($glow)

$pawLayer = $null
$handLayer = $null
foreach ($group in $svg.DocumentElement.ChildNodes) {
    if ($group.LocalName -ne 'g') {
        continue
    }
    $layer = New-Object Windows.Controls.Canvas
    foreach ($element in $group.ChildNodes) {
        if ($element.NodeType -ne [Xml.XmlNodeType]::Element) {
            continue
        }
        $shape = New-ArtShape $element
        if ($shape) {
            [void]$layer.Children.Add($shape)
        }
    }
    # The paw beckons front-to-back like the web app: the forearm foreshortens from the shoulder
    # and the hand folds toward the viewer at the wrist (two matrices, see Set-PawWave).
    if ($group.GetAttribute('id') -eq 'hoki-paw') {
        $pawLayer = $layer
        $pawLayer.RenderTransform = New-Object Windows.Media.MatrixTransform
    }
    if ($group.GetAttribute('id') -eq 'hoki-hand') {
        $handLayer = $layer
        $handLayer.RenderTransform = New-Object Windows.Media.MatrixTransform
    }
    [void]$scene.Children.Add($layer)
}
# Same mapping as js/app.js beckonMatrices: wave +1 = paw raised, -1 = folded toward the viewer.
function Set-PawWave([double]$wave) {
    if ($null -eq $pawLayer -or $null -eq $handLayer) {
        return
    }
    $fold = (1 - $wave) / 2
    $armScale = 1 - $beckon[0] * $fold
    $handScale = 1 - $beckon[1] * $fold
    $handWiden = 1 + 0.05 * $fold
    $lift = $pivot[1] * (1 - $armScale)
    $pawLayer.RenderTransform.Matrix = New-Object Windows.Media.Matrix(1, 0, 0, $armScale, 0, $lift)
    $handLayer.RenderTransform.Matrix = New-Object Windows.Media.Matrix(
        $handWiden, 0, 0, ($armScale * $handScale),
        ($wrist[0] * (1 - $handWiden)), ($armScale * $wrist[1] * (1 - $handScale) + $lift))
}
Set-PawWave 1

# Today's count, written on the red cushion.
$counter = New-Object Windows.Controls.TextBlock
$counter.Width = $counterBox[2]
$counter.TextAlignment = 'Center'
$counter.FontFamily = New-Object Windows.Media.FontFamily('Palatino Linotype, Georgia, Microsoft YaHei UI')
$counter.FontWeight = 'SemiBold'
$counter.FontSize = 15
$counter.Foreground = $BrushConverter.ConvertFromString('#fff3df')
$counter.IsHitTestVisible = $false
[Windows.Controls.Canvas]::SetLeft($counter, $counterBox[0])
[Windows.Controls.Canvas]::SetTop($counter, $counterBox[1])
[void]$scene.Children.Add($counter)

# Floating "+1" layer.
$fx = New-Object Windows.Controls.Canvas
$fx.IsHitTestVisible = $false
[void]$scene.Children.Add($fx)

$viewbox = New-Object Windows.Controls.Viewbox
$viewbox.Stretch = 'Uniform'
$viewbox.Child = $art

function Update-Counter {
    $counter.Text = "$Fu $($state.today)"
}

# ---------- sound: a small synthesized bell, cached as WAV ----------
function New-BellWav([string]$path, [object[]]$partials, [double]$seconds) {
    $rate = 16000
    $count = [int]($rate * $seconds)
    $samples = New-Object 'Int16[]' $count
    $twoPi = 2 * [Math]::PI
    for ($i = 0; $i -lt $count; $i++) {
        $t = $i / $rate
        $value = 0.0
        foreach ($p in $partials) {
            $value += $p[1] * [Math]::Exp(-$t * 4.6 / $p[2]) * [Math]::Sin($twoPi * $p[0] * $t)
        }
        if ($t -lt 0.005) {
            $value *= $t / 0.005
        }
        $samples[$i] = [Int16]([Math]::Max(-1.0, [Math]::Min(1.0, $value)) * 30000)
    }
    $data = New-Object 'Byte[]' ($count * 2)
    [Buffer]::BlockCopy($samples, 0, $data, 0, $data.Length)
    $stream = [IO.File]::Create($path)
    $writer = New-Object IO.BinaryWriter($stream)
    $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF'))
    $writer.Write([int](36 + $data.Length))
    $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
    $writer.Write([int]16)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write([int]$rate)
    $writer.Write([int]($rate * 2))
    $writer.Write([int16]2)
    $writer.Write([int16]16)
    $writer.Write([Text.Encoding]::ASCII.GetBytes('data'))
    $writer.Write([int]$data.Length)
    $writer.Write($data)
    $writer.Close()
}

$script:bell = $null
$script:bigBell = $null
function Initialize-Sound {
    New-Item -ItemType Directory -Force $StateDir | Out-Null
    $smallPath = Join-Path $StateDir 'bell.wav'
    $bigPath = Join-Path $StateDir 'bell-big.wav'
    if (-not (Test-Path $smallPath)) {
        New-BellWav $smallPath @(@(1568, 0.3, 1.1), @(2349, 0.14, 0.7), @(3136, 0.06, 0.35)) 1.1
    }
    if (-not (Test-Path $bigPath)) {
        New-BellWav $bigPath @(@(1046.5, 0.35, 2.2), @(1568, 0.25, 1.6), @(2093, 0.15, 1.1), @(3136, 0.08, 0.6)) 2.2
    }
    $script:bell = New-Object Media.SoundPlayer($smallPath)
    $script:bell.Load()
    $script:bigBell = New-Object Media.SoundPlayer($bigPath)
    $script:bigBell.Load()
}

function Invoke-Bell([bool]$big) {
    if (-not $state.sound) {
        return
    }
    if (-not $script:bell) {
        Initialize-Sound
    }
    if ($big) {
        $script:bigBell.Play()
    } else {
        $script:bell.Play()
    }
}

# ---------- animation ----------
$clock = [Diagnostics.Stopwatch]::StartNew()
$script:lastFrame = 0.0
$script:phase = 0.0
$script:boost = 0.0

function Show-Float([string]$text, [double]$centerX, [double]$top, [double]$size) {
    $label = New-Object Windows.Controls.TextBlock
    $label.Text = $text
    $label.FontFamily = New-Object Windows.Media.FontFamily('Microsoft YaHei UI, Segoe UI')
    $label.FontWeight = 'ExtraBold'
    $label.FontSize = $size
    $label.Foreground = $BrushConverter.ConvertFromString('#f5c542')
    $shadow = New-Object Windows.Media.Effects.DropShadowEffect
    $shadow.Color = [Windows.Media.Color]::FromRgb(94, 8, 18)
    $shadow.BlurRadius = 3
    $shadow.ShadowDepth = 1.5
    $label.Effect = $shadow
    $label.Measure((New-Object Windows.Size([double]::PositiveInfinity, [double]::PositiveInfinity)))
    $label.Tag = $clock.Elapsed.TotalSeconds + 1.2
    [Windows.Controls.Canvas]::SetLeft($label, $centerX - $label.DesiredSize.Width / 2)
    [Windows.Controls.Canvas]::SetTop($label, $top)
    [void]$fx.Children.Add($label)

    $duration = New-Object Windows.Duration([TimeSpan]::FromMilliseconds(1100))
    $rise = New-Object Windows.Media.Animation.DoubleAnimation($top, ($top - 55), $duration)
    $rise.EasingFunction = New-Object Windows.Media.Animation.QuadraticEase
    $fade = New-Object Windows.Media.Animation.DoubleAnimation(1.0, 0.0, (New-Object Windows.Duration([TimeSpan]::FromMilliseconds(700))))
    $fade.BeginTime = [TimeSpan]::FromMilliseconds(400)
    $label.BeginAnimation([Windows.Controls.Canvas]::TopProperty, $rise)
    $label.BeginAnimation([Windows.UIElement]::OpacityProperty, $fade)
}

function Update-Frame {
    $now = $clock.Elapsed.TotalSeconds
    $dt = [Math]::Min(0.1, $now - $script:lastFrame)
    $script:lastFrame = $now
    $script:boost *= [Math]::Pow(0.5, $dt / $BoostHalfLifeSec)
    $speed = $BaseWavesPerSec + $script:boost * $MaxExtraWavesPerSec
    $script:phase += $dt * $speed * 2 * [Math]::PI
    Set-PawWave ([Math]::Sin($script:phase))
    $glow.Opacity = $script:boost * 0.8
    foreach ($child in @($fx.Children)) {
        if ($child.Tag -lt $now) {
            $fx.Children.Remove($child)
        }
    }
}

function Invoke-Tap {
    if ($state.day -ne (Get-TodayKey)) {
        $state.day = Get-TodayKey
        $state.today = 0
    }
    $state.today = [int]$state.today + 1
    $state.total = [int]$state.total + 1
    $script:boost = [Math]::Min(1.0, $script:boost + $BoostPerTap)
    $script:phase += [Math]::PI / 3
    Save-State
    Update-Counter

    $blessing = $Blessings[$state.total % $Blessings.Count]
    Show-Float "+1 $blessing" ($pawPoint[0] + (Get-Random -Minimum -12 -Maximum 12)) ($pawPoint[1] - 12) 22
    if ($Milestones -contains $state.today) {
        $script:boost = 1.0
        Show-Float "$($state.today) $Fa!" 150 14 34
        Invoke-Bell $true
    } else {
        Invoke-Bell $false
    }
}

Update-Counter

# ---------- snapshot mode (for checks) ----------
if ($Snapshot) {
    for ($i = 0; $i -lt $SnapshotTaps; $i++) {
        Invoke-Tap
    }
    Set-PawWave $SnapshotWave
    $glow.Opacity = $script:boost * 0.8
    $width = $WidgetWidths[$state.size]
    $height = [Math]::Round($width * $vbH / $vbW)
    $viewbox.Width = $width
    $viewbox.Height = $height
    $viewbox.Measure((New-Object Windows.Size($width, $height)))
    $viewbox.Arrange((New-Object Windows.Rect(0, 0, $width, $height)))
    $viewbox.UpdateLayout()
    $bitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap(($width * 2), ($height * 2), 192, 192, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($viewbox)
    $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $file = [IO.File]::Create($Snapshot)
    $encoder.Save($file)
    $file.Close()
    Write-Output "snapshot $Snapshot today=$($state.today) boost=$([Math]::Round($script:boost, 2))"
    exit
}

# ---------- window ----------
$window = New-Object Windows.Window
$window.Title = 'Hoki'
$window.WindowStyle = 'None'
$window.AllowsTransparency = $true
$window.Background = [Windows.Media.Brushes]::Transparent
$window.ResizeMode = 'NoResize'
$window.ShowInTaskbar = $false
$window.ShowActivated = $false
$window.Topmost = [bool]$state.topmost
$window.Content = $viewbox
$window.ToolTip = 'Click for luck. Drag to move. Right-click for options.'

function Set-WidgetSize([string]$name) {
    $state.size = $name
    $window.Width = $WidgetWidths[$name]
    $window.Height = [Math]::Round($WidgetWidths[$name] * $vbH / $vbW)
}
if (-not $WidgetWidths.ContainsKey([string]$state.size)) {
    $state.size = 'Medium'
}
Set-WidgetSize $state.size

function Move-ToDefaultCorner {
    # Right edge, raised above the bottom corner where apps keep their send/OK buttons.
    $area = [Windows.SystemParameters]::WorkArea
    $window.Left = $area.Right - $window.Width - 16
    $window.Top = $area.Bottom - $window.Height - 160
}
$screen = [Windows.Rect]::new(
    [Windows.SystemParameters]::VirtualScreenLeft,
    [Windows.SystemParameters]::VirtualScreenTop,
    [Windows.SystemParameters]::VirtualScreenWidth,
    [Windows.SystemParameters]::VirtualScreenHeight
)
if ($null -ne $state.left -and $screen.Contains([double]$state.left + 20, [double]$state.top + 20)) {
    $window.Left = [double]$state.left
    $window.Top = [double]$state.top
} else {
    Move-ToDefaultCorner
}

# Click = tap; press and drag = move.
$window.Add_MouseLeftButtonDown({
    $startLeft = $window.Left
    $startTop = $window.Top
    try {
        $window.DragMove()
    } catch {
        # DragMove throws if the button was already released.
    }
    if ([Math]::Abs($window.Left - $startLeft) -lt 2 -and [Math]::Abs($window.Top - $startTop) -lt 2) {
        Invoke-Tap
    } else {
        $state.left = $window.Left
        $state.top = $window.Top
        Save-State
    }
})

# ---------- right-click menu ----------
$StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Hoki.lnk'
function Set-Autostart([bool]$enabled) {
    if ($enabled) {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($StartupLink)
        $link.TargetPath = Join-Path $PSHOME 'powershell.exe'
        $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
        $link.WorkingDirectory = $PSScriptRoot
        $link.WindowStyle = 7
        $iconPath = Join-Path $PSScriptRoot 'hoki.ico'
        if (Test-Path $iconPath) {
            $link.IconLocation = $iconPath
        }
        $link.Save()
    } else {
        Remove-Item $StartupLink -ErrorAction SilentlyContinue
    }
}

function New-MenuItem([string]$header, [scriptblock]$onClick) {
    $item = New-Object Windows.Controls.MenuItem
    $item.Header = $header
    if ($onClick) {
        $item.Add_Click($onClick)
    }
    return $item
}

$menu = New-Object Windows.Controls.ContextMenu
$statsItem = New-MenuItem '' $null
$statsItem.IsEnabled = $false
[void]$menu.Items.Add($statsItem)
[void]$menu.Items.Add((New-Object Windows.Controls.Separator))

$soundItem = New-MenuItem 'Sound' {
    $state.sound = -not $state.sound
    $soundItem.IsChecked = $state.sound
    Save-State
}
$soundItem.IsChecked = [bool]$state.sound
[void]$menu.Items.Add($soundItem)

$topItem = New-MenuItem 'Always on top' {
    $state.topmost = -not $state.topmost
    $window.Topmost = $state.topmost
    $topItem.IsChecked = $state.topmost
    Save-State
}
$topItem.IsChecked = [bool]$state.topmost
[void]$menu.Items.Add($topItem)

$startItem = New-MenuItem 'Start with Windows' {
    Set-Autostart (-not (Test-Path $StartupLink))
    $startItem.IsChecked = Test-Path $StartupLink
}
[void]$menu.Items.Add($startItem)

$sizeMenu = New-MenuItem 'Size' $null
foreach ($sizeName in @('Small', 'Medium', 'Large')) {
    $sizeItem = New-MenuItem $sizeName {
        param($sender, $eventArgs)
        Set-WidgetSize $sender.Header
        Save-State
    }
    [void]$sizeMenu.Items.Add($sizeItem)
}
[void]$menu.Items.Add($sizeMenu)

[void]$menu.Items.Add((New-MenuItem 'Move to corner' {
    Move-ToDefaultCorner
    $state.left = $window.Left
    $state.top = $window.Top
    Save-State
}))
[void]$menu.Items.Add((New-MenuItem 'Open Hoki on the web' {
    Start-Process 'https://juw12.github.io/hoki/'
}))
[void]$menu.Items.Add((New-Object Windows.Controls.Separator))
[void]$menu.Items.Add((New-MenuItem 'Quit' {
    $window.Close()
}))

$menu.Add_Opened({
    $statsItem.Header = "Today $($state.today)  /  All time $($state.total)"
    $startItem.IsChecked = Test-Path $StartupLink
    foreach ($item in $sizeMenu.Items) {
        $item.IsChecked = ($item.Header -eq $state.size)
    }
})
$window.ContextMenu = $menu

# ---------- run ----------
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(33)
$timer.Add_Tick({
    Update-Frame
})
$timer.Start()

$window.Add_ContentRendered({
    if ($state.sound -and -not $script:bell) {
        Initialize-Sound
    }
})
$window.Add_Closed({
    $timer.Stop()
    Save-State
})

[void]$window.ShowDialog()
