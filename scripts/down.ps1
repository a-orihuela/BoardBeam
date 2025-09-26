param(
  [string]$ComposeFile = ""
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
  $ComposeFile = Join-Path $RepoRoot "docker-compose.dev.yml"
}

Write-Host "==> Stopping BoardBeam..."
docker compose -f $ComposeFile down --remove-orphans
Write-Host "==> Done."
