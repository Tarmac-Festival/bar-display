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
sage "Uhrzeit aus dem Netz beziehen"
# Ein Raspberry Pi hat keine batteriegepufferte Uhr. Ohne Abgleich startet er mit
# der Zeit des letzten Herunterfahrens - das sieht plausibel aus und ist trotzdem
# falsch. Daran haengt hier alles: Timetable, Zeitfenster der Clips, Ruhezeit und
# die geplanten Durchsagen.
sudo apt-get install -y --no-install-recommends systemd-timesyncd fake-hwclock \
  || warne "Zeitpakete liessen sich nicht installieren - bitte von Hand nachholen."

# Neben den oeffentlichen Servern auch das eigene Netz fragen. Auf einem
# Flugplatz ohne Internetzugang beantwortet oft der WLAN-Router die Zeitanfrage,
# und das ist immer noch besser als gar kein Abgleich.
GATEWAY="$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')"
sudo mkdir -p /etc/systemd/timesyncd.conf.d
sudo tee /etc/systemd/timesyncd.conf.d/bar-display.conf >/dev/null <<ZEIT
[Time]
NTP=${GATEWAY:+$GATEWAY }pool.ntp.org
FallbackNTP=time.cloudflare.com time.google.com
ZEIT

sudo systemctl enable --now systemd-timesyncd >/dev/null 2>&1 || true
sudo timedatectl set-ntp true >/dev/null 2>&1 || true

# fake-hwclock merkt sich die Zeit beim Herunterfahren. Kommt der Strom zurueck
# und es ist kein Netz da, startet der Pi wenigstens nicht im Jahr 1970.
sudo systemctl enable fake-hwclock >/dev/null 2>&1 || true
sudo fake-hwclock save >/dev/null 2>&1 || true

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
After=network-online.target time-sync.target
Wants=network-online.target
# Absichtlich nur After= und kein Requires= auf time-sync.target: ohne Netz
# wuerde die Anzeige sonst gar nicht erst starten. Lieber eine laufende Anzeige
# mit Warnhinweis als ein schwarzer Bildschirm.

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
# Chromium-Zwischenspeicher ins RAM. Die SD-Karte ist im Dauerbetrieb das
# schwaechste Glied - je weniger darauf geschrieben wird, desto besser. Den
# Ordner legt systemd selbst unter /run an (RuntimeDirectory weiter unten),
# mit den richtigen Rechten und ohne in /run/user hineinzupfuschen.
CACHE="/run/bar-display-cache"
# cage ist ein winziger Wayland-Aufsatz: kein Desktop, kein Panel, nichts das
# Speicher frisst - auf einem Pi 3B mit 1 GB macht das einen spuerbaren
# Unterschied gegenueber einer vollen Arbeitsflaeche.
sudo install -m 0755 "$ZIEL/pi/kiosk.sh" /usr/local/bin/bar-display-kiosk

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
Environment=PORT=$PORT
Environment=CHROMIUM=$CHROMIUM
Environment=CACHE=$CACHE
RuntimeDirectory=bar-display-cache
RuntimeDirectoryPreserve=yes
# Bewusst kein ExecStartPre: TTYVHangup haengt vor dem Start alles von tty1 ab,
# und ein Kontrollprozess haengt wegen StandardInput=tty selbst daran. Er bekam
# SIGHUP, der Dienst scheiterte mit "code=killed, status=1/HUP" und startete
# endlos neu. Das Warten auf den Webdienst macht jetzt das Startskript selbst.
ExecStart=/usr/local/bin/bar-display-kiosk
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
KIOSK

sudo systemctl daemon-reload

# Bewusst ohne Abbruch: startet die Anzeige nicht, sollen die restlichen
# Einstellungen trotzdem gesetzt werden - sonst steht der Pi halb eingerichtet
# da und selbst "bar-display-update" fehlt.
DIENST_OK=ja
KIOSK_OK=ja
sudo systemctl enable --now bar-display.service || DIENST_OK=nein
sudo systemctl enable --now bar-display-kiosk.service || KIOSK_OK=nein

# ---------------------------------------------------------------------------
# Die Vollbildanzeige braucht tty1 fuer sich. Startet der Pi mit Arbeitsflaeche,
# sitzt die dort schon - dann kommen sich beide in die Quere.
ZIEL_JETZT="$(systemctl get-default 2>/dev/null || echo unbekannt)"
if [ "$ZIEL_JETZT" = "graphical.target" ]; then
  if [ "${KONSOLENSTART:-}" = "ja" ]; then
    sage "Auf Start ohne Arbeitsflaeche umstellen"
    sudo systemctl set-default multi-user.target >/dev/null
    KONSOLE_HINWEIS="Umgestellt auf Start ohne Arbeitsflaeche - wirkt nach dem Neustart."
  else
    KONSOLE_HINWEIS="ACHTUNG: Der Pi startet mit Arbeitsflaeche. Die Vollbildanzeige
  braucht tty1 fuer sich und kommt so nicht hoch. Umstellen mit:
      sudo systemctl set-default multi-user.target && sudo reboot
  Danach laeuft die Anzeige von allein; bedient wird ohnehin vom Handy.
  (Zurueck geht es mit: sudo systemctl set-default graphical.target)"
  fi
else
  KONSOLE_HINWEIS=""
fi

# ---------------------------------------------------------------------------
sage "System auf Dauerbetrieb trimmen"

# Ohne genug Speicher fuer die Grafikeinheit faellt der Pi bei 1080p auf
# Dekodierung im Hauptprozessor zurueck - und die schafft ein Pi 3B nicht.
BOOTCFG=""
for k in /boot/firmware/config.txt /boot/config.txt; do
  [ -f "$k" ] && { BOOTCFG="$k"; break; }
done
if [ -n "$BOOTCFG" ]; then
  if grep -q '^gpu_mem=' "$BOOTCFG"; then
    sudo sed -i 's/^gpu_mem=.*/gpu_mem=128/' "$BOOTCFG"
  else
    echo 'gpu_mem=128' | sudo tee -a "$BOOTCFG" >/dev/null
  fi
  sage "gpu_mem=128 in $BOOTCFG gesetzt (wirkt nach dem Neustart)"
else
  warne "config.txt nicht gefunden - gpu_mem bitte von Hand auf 128 setzen."
fi

# WLAN-Stromsparen verzoegert die Push-Verbindung zur Bedienseite: Durchsagen
# vom Handy kaemen sonst mit Verspaetung an.
sudo tee /etc/systemd/system/bar-display-wlan.service >/dev/null <<'WLAN'
[Unit]
Description=Bar Display - WLAN-Stromsparen abschalten
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'for d in /sys/class/net/wl*; do iw dev "$(basename "$d")" set power_save off || true; done'

[Install]
WantedBy=multi-user.target
WLAN
sudo systemctl enable --now bar-display-wlan.service >/dev/null 2>&1 || true

# Protokolle ins RAM statt auf die SD-Karte
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/bar-display.conf >/dev/null <<'JOURNAL'
[Journal]
Storage=volatile
RuntimeMaxUse=32M
JOURNAL
sudo systemctl restart systemd-journald >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
sage "Aktualisierungsbefehl anlegen"
sudo tee /usr/local/bin/bar-display-update >/dev/null <<'AKTUELL'
#!/usr/bin/env bash
set -euo pipefail
sudo git -C /opt/bar-display fetch --depth 1 origin main
sudo git -C /opt/bar-display reset --hard origin/main
# Das Startskript der Anzeige liegt ausserhalb des Repos und muss mit
sudo install -m 0755 /opt/bar-display/pi/kiosk.sh /usr/local/bin/bar-display-kiosk
sudo systemctl restart bar-display.service bar-display-kiosk.service
echo "Bar Display aktualisiert."
echo "Hinweis: Aendert sich einmal etwas an den Diensten selbst, hilft nur ein"
echo "erneuter Lauf des Einrichtungsskripts - das steht dann in den Hinweisen."
AKTUELL
sudo chmod +x /usr/local/bin/bar-display-update

# ---------------------------------------------------------------------------
ADRESSE="$(hostname -I 2>/dev/null | awk '{print $1}')"

# Kurz Zeit geben, der erste Abgleich braucht ein paar Sekunden
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = "yes" ] && break
  sleep 1
done
if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = "yes" ]; then
  ZEITLAGE="Uhrzeit aus dem Netz abgeglichen: $(date '+%d.%m.%Y %H:%M')"
else
  ZEITLAGE="ACHTUNG: Uhrzeit noch nicht abgeglichen ($(date '+%d.%m.%Y %H:%M')).
  Ohne richtige Uhr greifen Timetable, Zeitfenster, Ruhezeit und geplante
  Durchsagen zur falschen Stunde. Pruefen mit: timedatectl status"
fi

if [ "$DIENST_OK" = nein ] || [ "$KIOSK_OK" = nein ]; then
  LAGE="ACHTUNG: "
  [ "$DIENST_OK" = nein ] && LAGE="${LAGE}Der Webdienst ist nicht gestartet. "
  [ "$KIOSK_OK" = nein ] && LAGE="${LAGE}Die Vollbildanzeige ist nicht gestartet. "
  LAGE="${LAGE}
  Alles andere ist eingerichtet. Ursache ansehen mit:
      systemctl status bar-display.service --no-pager -l
      journalctl -u bar-display -n 50 --no-pager
      journalctl -u bar-display-kiosk -n 50 --no-pager"
else
  LAGE="Anzeige laeuft auf dem angeschlossenen Bildschirm."
fi

sage "Fertig"
cat <<ENDE

  $LAGE

  Bedienung vom Handy im selben WLAN:
      http://${ADRESSE:-<IP-des-Pi>}:$PORT/einstellungen

  Videos, Fotos und Logo gehoeren nach:
      ~/.config/Bar Display/media
      ~/.config/Bar Display/photos
      ~/.config/Bar Display/branding

  $ZEITLAGE
${KONSOLE_HINWEIS:+
  $KONSOLE_HINWEIS
}
  Nuetzliche Befehle:
      bar-display-update                       neue Fassung holen
      timedatectl status                       Uhrzeit und Abgleich pruefen

  Laeuft die Anzeige ruckelig, hilft im Reiter "Anzeige" der Sparmodus.
  Ob die Videodekodierung in Hardware laeuft, verraet in Chromium die
  Adresse chrome://gpu (Zeile "Video Decode").

  gpu_mem wirkt erst nach einem Neustart:
      sudo reboot
      sudo systemctl restart bar-display       Dienst neu starten
      journalctl -u bar-display -f             Protokoll ansehen
      journalctl -u bar-display-kiosk -f       Protokoll der Anzeige

ENDE
