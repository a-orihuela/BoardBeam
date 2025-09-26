param(
  [string]$ComposeFile = ""
)

$ErrorActionPreference = "Stop"

# Resolve compose file relative to repo root (one level above /scripts)
$RepoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
  $ComposeFile = Join-Path $RepoRoot "docker-compose.dev.yml"
}

function Wait-Healthy($name, $url, $timeoutSec = 180) {
  Write-Host "==> Waiting for $name at $url ..."
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $url
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
        Write-Host "==> $name is healthy"
        return
      }
    } catch { Start-Sleep -Milliseconds 800 }
  }
  throw "Service $name did not become healthy in $timeoutSec seconds"
}

Write-Host "==> Building images..."
docker compose -f $ComposeFile build

Write-Host "==> Starting services (detached)..."
docker compose -f $ComposeFile up -d

Write-Host "==> Checking health endpoints..."
Wait-Healthy "updater" "http://localhost:8088/healthz" 180
Wait-Healthy "server"  "http://localhost:8080/healthz" 180
Wait-Healthy "web"     "http://localhost:5173/"        180

Write-Host "==> All services are up. Open http://localhost:5173/"
docker compose -f $ComposeFile ps
