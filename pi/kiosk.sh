#!/usr/bin/env bash
#
# Startet die Vollbildanzeige: wartet auf den Webdienst und uebergibt dann an
# cage mit Chromium.
#
# Warum ein eigenes Skript und kein ExecStartPre in der Unit:
# Die Unit setzt TTYVHangup=yes, damit tty1 sauber uebernommen wird. systemd
# haengt dabei vor dem Start alle Prozesse von tty1 ab - und ein ExecStartPre
# haengt wegen StandardInput=tty selbst an tty1. Es bekam also SIGHUP und der
# Dienst scheiterte mit "Control process exited, code=killed, status=1/HUP",
# in einer Endlosschleife. Ohne Kontrollprozess gibt es nichts abzuhaengen.
#
# Zweiter Vorteil: die Chromium-Optionen liegen damit im Repository statt in
# einer einmal geschriebenen Unit - "bar-display-update" holt Aenderungen mit.

set -u

PORT="${PORT:-8080}"
CACHE="${CACHE:-/run/bar-display-cache}"

# Chromium heisst je nach Fassung anders
CHROMIUM="${CHROMIUM:-}"
if [ -z "$CHROMIUM" ]; then
  for k in chromium chromium-browser; do
    if command -v "$k" >/dev/null 2>&1; then CHROMIUM="$(command -v "$k")"; break; fi
  done
fi
if [ -z "$CHROMIUM" ]; then
  echo "Chromium nicht gefunden - bitte nachinstallieren." >&2
  exit 1
fi

CAGE="${CAGE:-$(command -v cage || true)}"
if [ -z "$CAGE" ]; then
  echo "cage nicht gefunden - bitte nachinstallieren." >&2
  exit 1
fi

# Auf den Webdienst warten, aber nicht ewig. Laeuft er nicht, sagen wir warum,
# statt stumm im Neustartkreisel zu haengen.
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/api/config" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -sf "http://localhost:$PORT/api/config" >/dev/null 2>&1; then
  echo "Der Webdienst antwortet nicht auf Port $PORT." >&2
  echo "Nachsehen mit: journalctl -u bar-display -n 50" >&2
  exit 1
fi

mkdir -p "$CACHE" 2>/dev/null || true

# Was hier oft klemmt, steht sonst nirgends. Einmal ins Protokoll, damit man bei
# einem Fehlstart nicht raten muss.
echo "Starte Anzeige: cage=$CAGE chromium=$CHROMIUM port=$PORT"
# Bewusst genau hinsehen: ein blosses /dev/dri/cardN reicht nicht, das kann ein
# reiner Render-Knoten ohne Bildausgabe sein. cage braucht ein Geraet mit
# Anschluessen - die stehen als card*-* unter /sys/class/drm.
if ! ls -d /sys/class/drm/card*-* >/dev/null 2>&1; then
  echo "FEHLER: Kein Grafikgeraet mit Bildausgabe gefunden." >&2
  if [ ! -d /dev/dri ]; then
    echo "  /dev/dri gibt es gar nicht - der Grafiktreiber ist nicht geladen." >&2
  fi
  echo "  Haeufigste Ursache: eine Zeile gpu_mem= in der config.txt. Die stammt" >&2
  echo "  vom alten Grafiktreiber und blockiert den heutigen. Entfernen mit:" >&2
  echo "      sudo sed -i '/^gpu_mem=/d' /boot/firmware/config.txt && sudo reboot" >&2
  echo "  Pruefen laesst es sich danach mit: ls /dev/dri/" >&2
  exit 1
fi
if ! id -nG | grep -qw video; then
  echo "Warnung: Benutzer $(id -un) ist nicht in der Gruppe 'video'." >&2
fi

# exec, damit cage der Hauptprozess des Dienstes wird - sonst haelt systemd
# dieses Skript fuer die Anzeige und merkt ihr Ende nicht.
exec "$CAGE" -d -- "$CHROMIUM" \
  --kiosk "http://localhost:$PORT/" \
  --ozone-platform=wayland \
  --autoplay-policy=no-user-gesture-required \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --disable-pinch --overscroll-history-navigation=0 \
  --force-device-scale-factor=1 --disable-smooth-scrolling \
  --enable-low-end-device-mode \
  --renderer-process-limit=1 --process-per-site \
  --disk-cache-dir="$CACHE" --disk-cache-size=33554432 --media-cache-size=16777216 \
  --disable-features=Translate,TranslateUI,MediaRouter \
  --check-for-update-interval=31536000 --disable-component-update \
  --disable-breakpad --disable-crash-reporter --disable-sync \
  --no-first-run --no-default-browser-check --disable-background-networking
