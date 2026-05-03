Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$d = [System.Windows.Forms.Clipboard]::GetDataObject()
$result = @()

$result += "=== CLIPBOARD FORMATS ==="
$d.GetFormats() | ForEach-Object { $result += "  - $_" }

$result += ""
$result += "=== PNG ALPHA CHECK ==="
try {
    $pngStream = $d.GetData("PNG")
    if ($pngStream -ne $null) {
        $img = [System.Drawing.Image]::FromStream($pngStream)
        $result += "  Size: $($img.Width) x $($img.Height)"
        $result += "  PixelFormat: $($img.PixelFormat)"
        $hasAlpha = $img.PixelFormat.ToString().Contains("Alpha") -or $img.PixelFormat.ToString().Contains("Argb")
        if ($hasAlpha) {
            $result += "  [O] Alpha channel EXISTS"
            $bmp = New-Object System.Drawing.Bitmap($img)
            $transparentCount = 0
            $totalCount = 0
            $step = [Math]::Max(1, [Math]::Floor($bmp.Width / 20))
            for ($x = 0; $x -lt $bmp.Width; $x += $step) {
                for ($y = 0; $y -lt $bmp.Height; $y += $step) {
                    $pixel = $bmp.GetPixel($x, $y)
                    $totalCount++
                    if ($pixel.A -lt 255) { $transparentCount++ }
                }
            }
            $result += "  Sampled: $totalCount pixels, Transparent: $transparentCount pixels"
            if ($transparentCount -gt 0) {
                $result += "  RESULT: Transparent pixels EXIST - CSP writes alpha OK"
            } else {
                $result += "  RESULT: All pixels opaque - CSP is FLATTENING"
            }
            $bmp.Dispose()
        } else {
            $result += "  [X] No alpha channel in pixel format"
        }
        $img.Dispose()
    } else {
        $result += "  No PNG stream found"
    }
} catch {
    $result += "  Error: $($_.Exception.Message)"
}

$result | Out-File (Join-Path $PSScriptRoot "alpha_check.txt") -Encoding ascii
