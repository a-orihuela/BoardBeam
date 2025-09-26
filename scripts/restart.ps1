param(
  [string]$ComposeFile = ""
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
  $ComposeFile = Join-Path $RepoRoot "docker-compose.dev.yml"
}

Write-Host "==> Restarting BoardBeam..."
docker compose -f $ComposeFile down --remove-orphans
docker compose -f $ComposeFile build
docker compose -f $ComposeFile up -d
docker compose -f $ComposeFile ps
