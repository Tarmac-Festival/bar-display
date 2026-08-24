#!/usr/bin/env bash
#
# Bar Display auf einem Raspberry Pi einrichten.
#
#   curl -fsSL https://raw.githubusercontent.com/Tarmac-Festival/bar-display/main/pi/install.sh | bash
#
# Getestet gedacht fuer Raspberry Pi OS (Bookworm) auf einem Pi 3B.
# Richtet zwei Dienste ein:
#   bar-display        - der kleine Webdienst (Anzeige + Bedienseite)
#   bar-display-kiosk  - Chromium im Vollbild, zeigt die Anzeige
#
set -euo pipefail

REPO="https://github.com/Tarmac-Festival/bar-display.git"
ZIEL="/opt/bar-display"
BENUTZER="${SUDO_USER:-$USER}"
PORT="${PORT:-8080}"

sage() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warne() { printf '\n\033[1;33m!!\033[0m %s\n' "$*"; }

if [ "$(id -u)" -eq 0 ] && [ -z "${SUDO_USER:-}" ]; then
  warne "Bitte nicht direkt als root ausfuehren, sondern mit sudo als normaler Benutzer."
  exit 1
fi

# ---------------------------------------------------------------------------
sage "Pakete installieren"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends git nodejs cage

# Chromium heisst je nach Fassung anders
CHROMIUM=""
for k in chromium chromium-browser; do
  if command -v "$k" >/dev/null 2>&1; then CHROMIUM="$(command -v "$k")"; break; fi
done
if [ -z "$CHROMIUM" ]; then
  sudo apt-get install -y --no-install-recommends chromium || sudo apt-get install -y --no-install-recommends chromium-browser
  for k in chromium chromium-browser; do
    if command -v "$k" >/dev/null 2>&1; then CHROMIUM="$(command -v "$k")"; break; fi
  done
fi
[ -n "$CHROMIUM" ] || { warne "Chromium nicht gefunden - Einrichtung abgebrochen."; exit 1; }

NODE_HAUPT="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_HAUPT" -lt 16 ]; then
  warne "Node.js ist zu alt (gefunden: $(node --version 2>/dev/null || echo keins))."
  warne "Bitte eine neuere Fassung installieren, z.B. ueber https://deb.nodesource.com"
  exit 1
fi

# ---------------------------------------------------------------------------
sage "Programm nach $ZIEL holen"
if [ -d "$ZIEL/.git" ]; then
  sudo git -C "$ZIEL" fetch --depth 1 origin main
  sudo git -C "$ZIEL" reset --hard origin/main
else
  sudo rm -rf "$ZIEL"
  sudo git clone --depth 1 "$REPO" "$ZIEL"
fi
sudo chown -R "$BENUTZER":"$BENUTZER" "$ZIEL"

# ---------------------------------------------------------------------------
sage "Dienst fuer die Anzeige einrichten"
sudo tee /etc/systemd/system/bar-display.service >/dev/null <<DIENST
[Unit]
Description=Bar Display - Anzeige und Bedienseite
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$BENUTZER
Environment=PORT=$PORT
ExecStart=$(command -v node) $ZIEL/pi/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
DIENST

# ---------------------------------------------------------------------------
sage "Vollbildanzeige einrichten"
# cage ist ein winziger Wayland-Aufsatz: kein Desktop, kein Panel, nichts das
# Speicher frisst - auf einem Pi 3B mit 1 GB macht das einen spuerbaren
# Unterschied gegenueber einer vollen Arbeitsflaeche.
sudo tee /etc/systemd/system/bar-display-kiosk.service >/dev/null <<KIOSK
[Unit]
Description=Bar Display - Vollbild
After=bar-display.service
Wants=bar-display.service

[Service]
Type=simple
User=$BENUTZER
PAMName=login
TTYPath=/dev/tty1
StandardInput=tty
StandardOutput=journal
TTYReset=yes
TTYVHangup=yes
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u "$BENUTZER")
ExecStartPre=/bin/sh -c 'until curl -sf http://localhost:$PORT/api/config >/dev/null; do sleep 1; done'
ExecStart=$(command -v cage) -d -- $CHROMIUM \\
  --kiosk http://localhost:$PORT/ \\
  --ozone-platform=wayland \\
  --autoplay-policy=no-user-gesture-required \\
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \\
  --disable-features=Translate,TranslateUI \\
  --check-for-update-interval=31536000 \\
  --enable-features=VaapiVideoDecoder \\
  --disable-pinch --overscroll-history-navigation=0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
KIOSK

sudo systemctl daemon-reload
sudo systemctl enable --now bar-display.service
sudo systemctl enable --now bar-display-kiosk.service

# ---------------------------------------------------------------------------
sage "Aktualisierungsbefehl anlegen"
sudo tee /usr/local/bin/bar-display-update >/dev/null <<'AKTUELL'
#!/usr/bin/env bash
set -euo pipefail
sudo git -C /opt/bar-display fetch --depth 1 origin main
sudo git -C /opt/bar-display reset --hard origin/main
sudo systemctl restart bar-display.service bar-display-kiosk.service
echo "Bar Display aktualisiert."
AKTUELL
sudo chmod +x /usr/local/bin/bar-display-update

# ---------------------------------------------------------------------------
ADRESSE="$(hostname -I 2>/dev/null | awk '{print $1}')"
sage "Fertig"
cat <<ENDE

  Anzeige laeuft auf dem angeschlossenen Bildschirm.

  Bedienung vom Handy im selben WLAN:
      http://${ADRESSE:-<IP-des-Pi>}:$PORT/einstellungen

  Videos, Fotos und Logo gehoeren nach:
      ~/.config/Bar Display/media
      ~/.config/Bar Display/photos
      ~/.config/Bar Display/branding

  Nuetzliche Befehle:
      bar-display-update                       neue Fassung holen
      sudo systemctl restart bar-display       Dienst neu starten
      journalctl -u bar-display -f             Protokoll ansehen
      journalctl -u bar-display-kiosk -f       Protokoll der Anzeige

ENDE
