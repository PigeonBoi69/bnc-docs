#!/bin/bash
# Runs INSIDE a clean ubuntu container (see tools/linux-smoke.ps1): installs the .deb with apt, starts the app on a
# virtual display, opens a document given on the command line, and takes a screenshot.
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
DEB=$(ls /pkg/*.deb | head -1)

apt-get update -qq >/dev/null
apt-get install -y -qq "$DEB" xvfb imagemagick curl >/tmp/apt.log 2>&1 || { tail -20 /tmp/apt.log; echo "APT INSTALL FAILED"; exit 1; }

echo "== package"; dpkg -s bnc-docs | grep -E '^(Package|Version|Architecture|Depends|Recommends)'
echo "== files"; ls -l "/opt/BNC Docs/" | grep -E 'bnc-docs|chrome-sandbox|resources$'
echo "== desktop entry"; cat /usr/share/applications/bnc-docs.desktop
echo "== icon"; find /usr/share/icons -name 'bnc-docs*' 2>/dev/null | head -8
echo "== mime types"; ls /usr/share/mime/packages/ 2>/dev/null | head -5

Xvfb :99 -screen 0 1400x900x24 >/tmp/xvfb.log 2>&1 &
sleep 2
export DISPLAY=:99
APP=(bnc-docs)
if [ "${MODE:-}" = appimage ]; then APP=("$(ls /pkg/*.AppImage | head -1)" --appimage-extract-and-run); fi
"${APP[@]}" --no-sandbox --disable-gpu --remote-debugging-port=9333 "$@" >/tmp/app.log 2>&1 &
sleep 12
echo "== window"; curl -s localhost:9333/json | grep -E '"(title|url|type)"' | head -6
import -window root /out/linux-screenshot.png 2>/dev/null && echo "screenshot saved"
echo "== app log"; tail -15 /tmp/app.log
