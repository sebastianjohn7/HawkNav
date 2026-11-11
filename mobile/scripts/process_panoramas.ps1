# Resize stitched 360 exports into app-ready panoramas and keep panorama_nodes.json in sync.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/process_panoramas.ps1
#   ... -Source C:\Pictures -Width 4096 -Quality 82
#
# Reads every *.jpg in -Source (originals are never modified), writes
#   mobile/assets/panoramas/<node-id>.jpg           full view  (-Width x -Width/2)
#   mobile/assets/panoramas/<node-id>_preview.jpg   1024 x 512 preview shown while the full image loads
# and adds a skeleton entry to mobile/assets/panoramas/panorama_nodes.json for any photo
# that has none yet. Existing entries are left alone so hand-edited fields survive re-runs.
param(
  [string]$Source = 'C:\Pictures',
  [string]$Out = (Join-Path $PSScriptRoot '..\assets\panoramas'),
  [int]$Width = 4096,
  [int]$PreviewWidth = 1024,
  [int]$Quality = 82,
  [string]$Building = 'Delta'
)

Add-Type -AssemblyName System.Drawing

# File names that do not follow the D<floor><room> pattern: base name -> node id, floor, label.
$special = @{
  'ConfA_B'   = @{ id = 'delta-l2-conf-1ab';      floor = 2; label = 'Conference 1A/1B'; refs = @('205A', '205B') }
  'Elevator'  = @{ id = 'delta-l2-elevator';      floor = 2; label = 'Elevator';         refs = @('T2007') }
  'Restroom'  = @{ id = 'delta-l2-restrooms';     floor = 2; label = 'Restrooms';        refs = @('217', '218') }
  'Staircase' = @{ id = 'delta-l2-stairs-center'; floor = 2; label = 'Center staircase'; refs = @('STAIR_1', 'STAIR_2') }
}

# refs are NAME values of units in the floor plan GeoJSON; fill_panorama_positions.mjs reads them for lat/lng.
# Names:  D<floor><room>              a room, e.g. D119            -> delta-l1-d119
#         <Kind>_L<floor>[_<Detail>]  anything else, e.g. Elevator_L1, Hall_L1_East -> delta-l1-elevator, delta-l1-hall-east
# The second form has no floor plan unit yet: set its floorPlanRef (or lat/lng) in panorama_nodes.json by hand.
#         Engineer<n> / Science<n>    floor 1 hallway spots, numbered on the printed plan (engineering side / science side)
#         MainEntrance, MainHallway, MainHallway2, SecondEntrance   floor 1 spots on the central hallway
#         Room<D>###, ConferenceRoom  inside a room (position = that room, not the hallway)
$floor1 = @{
  'Engineer1' = @('133', '130');   'Engineer2' = @('132', '125');   'Engineer3' = @('125')
  'Engineer4' = @('109');         'Engineer5' = @('109', '126A'); 'Engineer6' = @('128')
  'Science1'  = @('158A', '160');  'Science2'  = @('158B', '159');  'Science3'  = @('156', '158B')
  'Science4'  = @('155');          'Science5'  = @('150');          'Science6'  = @('140', '150')
  'Science7'  = @('139', '140');   'Science8'  = @('139');   'Science9'  = @('137')
  'MainEntrance' = @('136', '139'); 'MainHallway' = @('128', '137'); 'MainHallway2' = @('101')
  'SecondEntrance' = @('102', '158A')
}
function Get-NodeInfo([string]$base) {
  if ($special.ContainsKey($base)) { return $special[$base] }
  if ($floor1.ContainsKey($base)) {
    $slug = ($base -creplace '([a-z])([A-Z0-9])', '$1-$2').ToLower()
    return @{ id = "delta-l1-$slug"; floor = 1; label = ($base -creplace '([a-z])([A-Z0-9])', '$1 $2') + ' (floor 1)'; refs = $floor1[$base] }
  }
  if ($base -eq 'ConferenceRoom') { return @{ id = 'delta-l2-room-d236'; floor = 2; label = 'Inside room 236 (conference room)'; refs = @('236') } }
  if ($base -match '^RoomD?(\d)(\d\d)$') {
    return @{ id = "delta-l$($Matches[1])-room-d$($Matches[1])$($Matches[2])"; floor = [int]$Matches[1]; label = "Inside room $($Matches[1])$($Matches[2])"; refs = @("$($Matches[1])$($Matches[2])") }
  }
  if ($base -match '^D(\d)(\d\d)$') {
    return @{ id = "delta-l$($Matches[1])-d$($Matches[1])$($Matches[2])"; floor = [int]$Matches[1]; label = "Room $($Matches[1])$($Matches[2])"; refs = @("$($Matches[1])$($Matches[2])") }
  }
  if ($base -match '^([A-Za-z]+)_L(\d)(?:_(.+))?$') {
    $kind = $Matches[1].ToLower()
    $floor = [int]$Matches[2]
    $detail = $Matches[3]
    $slug = if ($detail) { '-' + ($detail.ToLower() -replace '[^a-z0-9]+', '-').Trim('-') } else { '' }
    $words = (Get-Culture).TextInfo.ToTitleCase($kind) + $(if ($detail) { ' ' + ($detail -replace '_', ' ') } else { '' })
    return @{ id = "delta-l$floor-$kind$slug"; floor = $floor; label = "$words (floor $floor)"; refs = @() }
  }
  return $null
}

function Save-Resized($img, [string]$path, [int]$w) {
  $h = [int]($w / 2)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose()
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $params = New-Object System.Drawing.Imaging.EncoderParameters 1
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([int64]$Quality)
  $bmp.Save($path, $enc, $params)
  $bmp.Dispose()
}

New-Item -ItemType Directory -Force $Out | Out-Null
$jsonPath = Join-Path $Out 'panorama_nodes.json'
$nodes = @()
if (Test-Path $jsonPath) { $nodes = @((Get-Content $jsonPath -Raw | ConvertFrom-Json).nodes) }
$added = $false

foreach ($file in Get-ChildItem -LiteralPath $Source -File -Filter *.jpg | Sort-Object Name) {
  $info = Get-NodeInfo $file.BaseName
  if (-not $info) { Write-Warning "Skipping $($file.Name): name is not D<floor><room> and has no entry in `$special"; continue }

  $img = [System.Drawing.Image]::FromFile($file.FullName)
  if ($img.Width -ne 2 * $img.Height) { Write-Warning "$($file.Name) is $($img.Width)x$($img.Height), not 2:1 equirectangular" }
  Save-Resized $img (Join-Path $Out "$($info.id).jpg") $Width
  Save-Resized $img (Join-Path $Out "$($info.id)_preview.jpg") $PreviewWidth
  $img.Dispose()

  if (-not ($nodes | Where-Object { $_.id -eq $info.id })) {
    $added = $true
    $nodes += [pscustomobject]@{
      id          = $info.id
      building    = $Building
      floor       = $info.floor
      label       = $info.label
      image       = "$($info.id).jpg"
      preview     = "$($info.id)_preview.jpg"
      floorPlanRef = @($info.refs)
      lat         = $null
      lng         = $null
      northOffset = $null
      links       = @()
    }
  }
  Write-Host "$($file.Name) -> $($info.id)"
}

if ($added -or -not (Test-Path $jsonPath)) {
  $json = [pscustomobject]@{ nodes = @($nodes) } | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($jsonPath, $json + "`n", (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Wrote $jsonPath ($($nodes.Count) nodes)"
}

# Metro needs literal require() paths, so the app reads images through this generated index.
$entries = foreach ($n in $nodes) {
  if ((Test-Path (Join-Path $Out $n.image)) -and (Test-Path (Join-Path $Out $n.preview))) {
    "  '$($n.id)': { image: require('./$($n.image)'), preview: require('./$($n.preview)') },"
  }
}
$index = "// Generated by mobile/scripts/process_panoramas.ps1. Do not edit by hand.`n" +
  "export const panoramaImages: Record<string, { image: number; preview: number }> = {`n" +
  ($entries -join "`n") + "`n};`n"
[IO.File]::WriteAllText((Join-Path $Out 'index.ts'), $index, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Wrote $(Join-Path $Out 'index.ts')"
