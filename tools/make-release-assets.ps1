# Collects the Windows installer + portable exe, the Linux packages and the macOS zips of the CURRENT version (from package.json) into
# release-assets\ with GitHub-friendly names (no spaces), and writes SHA256SUMS.txt next to them.
#   .\tools\make-release-assets.ps1
# Build the three platforms first (npm run dist, npm run build:linux, npm run build:mac).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$v = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$out = Join-Path $root 'release-assets'
if (Test-Path $out) { Get-ChildItem $out -File | Remove-Item -Force } else { New-Item -ItemType Directory $out | Out-Null }

# the Windows files are in release\ (npm run dist) or release-new\ (when release\ was locked by a running app)
$winDir = if (Test-Path (Join-Path $root "release\BNC Docs Setup $v.exe")) { 'release' } else { 'release-new' }

# source file (as built) -> name on GitHub
$map = [ordered]@{
  "$winDir\BNC Docs Setup $v.exe"                      = "BNC-Docs-Setup-$v-windows-x64.exe"
  "$winDir\BNC Docs Portable $v.exe"                   = "BNC-Docs-Portable-$v-windows-x64.exe"
  "release-linux\BNC-Docs-$v-amd64.deb"                = "BNC-Docs-$v-linux-amd64.deb"
  "release-linux\BNC-Docs-$v-x86_64.AppImage"          = "BNC-Docs-$v-linux-x86_64.AppImage"
  "release-mac\BNC-Docs-$v-mac-arm64.zip"              = "BNC-Docs-$v-mac-arm64.zip"
  "release-mac\BNC-Docs-$v-mac-x64.zip"                = "BNC-Docs-$v-mac-x64.zip"
}

$missing = @()
foreach ($src in $map.Keys) {
  $from = Join-Path $root $src
  if (-not (Test-Path -LiteralPath $from)) { $missing += $src; continue }
  Copy-Item -LiteralPath $from -Destination (Join-Path $out $map[$src])
}
if ($missing.Count) {
  throw ("These builds for version $v were not found (rebuild them, or check the version in package.json):`n  " + ($missing -join "`n  "))
}

$lines = foreach ($f in Get-ChildItem $out -File | Sort-Object Name) { '{0}  {1}' -f (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower(), $f.Name }
# LF line endings and no BOM so `sha256sum -c` works everywhere
[IO.File]::WriteAllText((Join-Path $out 'SHA256SUMS.txt'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))

Write-Host "Release assets for version $v in $out :"
Get-ChildItem $out -File | Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } } | Format-Table -AutoSize | Out-String | Write-Host
Get-Content (Join-Path $out 'SHA256SUMS.txt') | Write-Host
