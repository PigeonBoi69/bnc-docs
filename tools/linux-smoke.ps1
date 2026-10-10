# Installs release-linux\*.deb in a clean Ubuntu 24.04 container (Docker Desktop), starts the app on a virtual display
# and opens a sample document. Writes the screenshot to release-linux\linux-screenshot.png.
#   .\tools\linux-smoke.ps1 [-Document C:\path\to\file.docx] [-AppImage]
param([string]$Document, [switch]$AppImage) # -AppImage runs the AppImage instead of the installed .deb
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'release-linux'
$args2 = @('run', '--rm', '-e', $(if ($AppImage) { 'MODE=appimage' } else { 'MODE=deb' }), '-v', "${out}:/pkg:ro", '-v', "${root}\tools:/tools:ro", '--mount', "type=bind,source=${out},target=/out")
$docArg = ''
if ($Document) {
  $dir = Split-Path -Parent $Document
  $args2 += @('-v', "${dir}:/data:ro")
  $docArg = '/data/' + (Split-Path -Leaf $Document)
}
$args2 += @('ubuntu:24.04', 'bash', '/tools/linux-smoke.sh')
if ($docArg) { $args2 += $docArg }
docker @args2
