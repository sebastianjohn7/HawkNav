# Starts Cloudflare quick tunnel, writes EXPO_PUBLIC_API_URL into mobile/.env, runs Bun.
# Ctrl+C restores EXPO_PUBLIC_API_URL to localhost and stops the tunnel.

$ErrorActionPreference = "Stop"

$ApiDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ApiDir
$MobileEnv = Join-Path $Root "mobile\.env"
$BunPort = 8787
$LocalApiUrl = "http://localhost:$BunPort"
$OutFile = Join-Path $env:TEMP "hawknav-tunnel.out.log"
$ErrFile = Join-Path $env:TEMP "hawknav-tunnel.err.log"
$TunnelProc = $null

function Set-ApiUrl([string]$Url) {
  if (-not (Test-Path $MobileEnv)) {
    throw "Missing $MobileEnv"
  }

  $content = Get-Content -Raw -Path $MobileEnv
  if ($null -eq $content) { $content = "" }

  if ($content -match '(?m)^EXPO_PUBLIC_API_URL=.*$') {
    $content = [regex]::Replace($content, '(?m)^EXPO_PUBLIC_API_URL=.*$', "EXPO_PUBLIC_API_URL=$Url")
  }
  elseif ($content -match '(?m)^API_URL=.*$') {
    $content = [regex]::Replace($content, '(?m)^API_URL=.*$', "EXPO_PUBLIC_API_URL=$Url")
  }
  else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
      $content += "`r`n"
    }
    $content += "EXPO_PUBLIC_API_URL=$Url`r`n"
  }

  Set-Content -Path $MobileEnv -Value $content -NoNewline
}

function Stop-Tunnel {
  if ($null -ne $TunnelProc -and -not $TunnelProc.HasExited) {
    Write-Host ""
    Write-Host ("Shutting down Cloudflare tunnel (PID: {0})..." -f $TunnelProc.Id)
    try { Stop-Process -Id $TunnelProc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  try { Set-ApiUrl $LocalApiUrl } catch {}
  Write-Host ("Restored mobile/.env EXPO_PUBLIC_API_URL to {0}" -f $LocalApiUrl)
  Remove-Item -Force -ErrorAction SilentlyContinue $OutFile, $ErrFile
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Error 'cloudflared not found on PATH. Install it, then retry.'
  exit 1
}

if (-not (Test-Path $MobileEnv)) {
  $example = Join-Path $Root "mobile\.env.example"
  if (Test-Path $example) {
    Copy-Item $example $MobileEnv
    Write-Host 'Created mobile/.env from .env.example - fill SUPABASE_* if needed.'
  }
  else {
    Write-Error "Missing $MobileEnv"
    exit 1
  }
}

try {
  Remove-Item -Force -ErrorAction SilentlyContinue $OutFile, $ErrFile
  Write-Host ("Starting Cloudflare quick tunnel for port {0}..." -f $BunPort)

  $TunnelProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$BunPort") `
    -RedirectStandardOutput $OutFile `
    -RedirectStandardError $ErrFile `
    -PassThru `
    -WindowStyle Hidden

  Write-Host 'Waiting for tunnel URL...'
  $TunnelUrl = $null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $log = ""
    if (Test-Path $OutFile) {
      $log += (Get-Content -Raw -Path $OutFile -ErrorAction SilentlyContinue)
    }
    if (Test-Path $ErrFile) {
      $log += (Get-Content -Raw -Path $ErrFile -ErrorAction SilentlyContinue)
    }
    if ($log -match 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com') {
      $TunnelUrl = $Matches[0]
      break
    }
  }

  if (-not $TunnelUrl) {
    Write-Host 'Error: Timed out waiting for Cloudflare URL. Tunnel logs:'
    if (Test-Path $OutFile) { Get-Content $OutFile }
    if (Test-Path $ErrFile) { Get-Content $ErrFile }
    exit 1
  }

  Set-ApiUrl $TunnelUrl

  Write-Host '=================================================='
  Write-Host ("Tunnel Active: {0}" -f $TunnelUrl)
  Write-Host 'Wrote EXPO_PUBLIC_API_URL into mobile/.env'
  Write-Host 'Next (other terminal): cd mobile ; npx expo start'
  Write-Host '=================================================='

  Set-Location $ApiDir
  & bun run --hot src/index.ts
}
finally {
  Stop-Tunnel
}
