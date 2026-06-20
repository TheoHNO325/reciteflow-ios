$ErrorActionPreference = "Stop"

$dist = Join-Path $PSScriptRoot "..\\dist"

if (-not (Test-Path $dist)) {
  throw "dist directory not found. Run expo export first."
}

Copy-Item (Join-Path $PSScriptRoot "..\\privacy.html") (Join-Path $dist "privacy.html") -Force
Copy-Item (Join-Path $PSScriptRoot "..\\terms.html") (Join-Path $dist "terms.html") -Force
Copy-Item (Join-Path $dist "index.html") (Join-Path $dist "404.html") -Force
Set-Content -Path (Join-Path $dist ".nojekyll") -Value ""
