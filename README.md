# Bar Display

Anzeigeprogramm für die Bildschirme an den Bars des Tarmac Festivals. Werbeclips laufen
in einer Endlosschleife, dazwischen erscheinen der aktuelle Timetable und die
Getränkepreise im Festival-Design.

![Timetable-Anzeige](docs/screenshots/anzeige-timetable.png)

---

## Inhalt

- [Was das Programm kann](#was-das-programm-kann)
- [Einrichten an der Bar](#einrichten-an-der-bar)
- [Bedienung](#bedienung)
- [Die Anzeige](#die-anzeige)
- [Die Einstellungen](#die-einstellungen)
- [Mehrere Bars ausstatten](#mehrere-bars-ausstatten)
- [Raspberry Pi](#raspberry-pi)
- [Unterstützte Formate](#unterstützte-formate)
- [Wo die Daten liegen](#wo-die-daten-liegen)
- [Wenn etwas klemmt](#wenn-etwas-klemmt)
- [Für Entwickler](#für-entwickler)

---

## Was das Programm kann

- **Endlosschleife** aus Videos und Standbildern, startet sofort im Vollbild, immer stumm.
- **Zeitsteuerung pro Beitrag** – „immer" oder beliebig viele Zeitfenster wie
  *Fr + Sa, 20:00–02:00*. Fenster über Mitternacht funktionieren.
- **Timetable** mit Datum, Uhrzeit, Act und optionalem Foto. Die Anzeige hebt den
  laufenden Act hervor und zeigt darunter die nächsten. Vergangenes verschwindet von selbst.
- **Getränkepreise** in Gruppen, mit Größe und Preis.
- **Spezialshot** – ein hervorgehobenes Band über die volle Breite unter den
  Preisspalten, mit eigener Überschrift, Preis und Beschreibungstext.
- **Häufigkeit einstellbar** – z. B. Timetable nach je 3 Beiträgen, Preise nach je 5.
- **Festival-Design** in Purpur, Neongrün und Signalorange, mit Josefin Sans.
  Farben, Titel, Muster und Titelfläche sind einstellbar.
- **Eigenes Logo**, mit dem L300-Logo als Standard.
- **Übergänge**: weiche Überblendung, harter Schnitt, Logo-Blende, Blob-Wisch.
- **Zweiter Monitor** – die Anzeige kann auf einem eigenen Bildschirm laufen, während
  die Einstellungen auf dem Hauptbildschirm geöffnet bleiben.
- **Jedes Bildschirmformat** – 16:9, 16:10, 4:3, Ultrawide und Hochformat.
- **Robust im Dauerbetrieb** – defekte Dateien werden übersprungen, hängende Wiedergabe
  wird erkannt, nicht abspielbare Videoformate lassen sich automatisch umwandeln.
- **Anzeige drehbar** — 90, 180 oder 270 Grad, direkt im Programm. Für hochkant
  montierte Bildschirme, ohne am Betriebssystem etwas einzustellen.
- **Durchsage** — ein Balken über die ganze Breite, vom Handy in Sekunden
  eingeblendet. Legt sich über alles, auch über laufende Videos, und blendet
  sich auf Wunsch nach 5 bis 60 Minuten von allein wieder aus.
- **Ruhezeit** — außerhalb der Öffnungszeiten bleibt der Bildschirm schwarz und
  die Schleife steht still. Schont das Gerät und spart Strom.
- **QR-Code** auf dem Timetable, der auf eure Festivalseite zeigt – abschaltbar,
  ohne dass die Adresse verloren geht.

---

## Einrichten an der Bar

Es gibt das Programm für Windows, Linux und macOS. Alle Fassungen sind funktionsgleich.
Die aktuellen Dateien liegen unter
[Releases](https://github.com/Tarmac-Festival/bar-display/releases/latest); `VERSION`
steht unten für die Versionsnummer des Releases, also z. B. `1.1.0`.

| System | Datei | Anmerkung |
|---|---|---|
| Windows | `Bar Display Setup VERSION.exe` | Installer mit Startmenü- und Desktop-Eintrag |
| Windows | `BarDisplay-portable-VERSION.exe` | ohne Installation, einfach in einen Ordner legen |
| Linux | `BarDisplay-VERSION-x86_64.AppImage` | ohne Installation, läuft auf jeder Distribution |
| Linux | `bar-display_VERSION_amd64.deb` | für Debian, Ubuntu, Mint und Verwandte |
| Linux | `bar-display-VERSION.tar.gz` | einfaches Archiv, falls die anderen beiden nicht passen |
| macOS | `BarDisplay-VERSION-arm64.dmg` | Apple Silicon (M1 und neuer) |
| macOS | `BarDisplay-VERSION-x64.dmg` | Intel-Macs |
| alle | `SHA256SUMS-windows.txt`, `-linux.txt`, `-mac.txt` | Prüfsummen, siehe [Reproduzierbare Releases](#reproduzierbare-releases) |

Raspberry Pi braucht keinen Download, siehe [Raspberry Pi](#raspberry-pi).

### Windows

Installer ausführen oder die portable `.exe` in einen Ordner legen und starten.

### Linux

AppImage einmalig ausführbar machen und starten:

```bash
chmod +x BarDisplay-*-x86_64.AppImage && ./BarDisplay-*-x86_64.AppImage
```

Oder das Debian-Paket installieren:

```bash
sudo apt install ./bar-display_*_amd64.deb
```

Beim `tar.gz` müssen Programm und ffmpeg von Hand ausführbar gemacht werden, weil das
Archiv unter Windows gepackt wurde und dabei keine Dateirechte mitkommen:

```bash
tar -xzf bar-display-*.tar.gz && chmod +x bar-display-*/bar-display bar-display-*/resources/ffmpeg/ffmpeg
```

### macOS

Das passende `.dmg` öffnen und das Programm in den Programme-Ordner ziehen.

Beim ersten Start meldet macOS, das Programm stamme von einem unbekannten
Entwickler oder sei beschädigt. Das liegt daran, dass es **nicht signiert** ist —
dafür bräuchte es ein kostenpflichtiges Apple-Entwicklerkonto. Einmalig umgehen:

Rechtsklick auf **Bar Display** im Programme-Ordner → **Öffnen** → im Dialog
nochmal **Öffnen**. Danach startet es künftig normal per Doppelklick.

Falls macOS es ganz verweigert („ist beschädigt und kann nicht geöffnet werden"),
hilft das Entfernen der Quarantäne-Markierung:

```bash
xattr -dr com.apple.quarantine "/Applications/Bar Display.app"
```

### Danach überall gleich

1. Programm starten. Es geht sofort im Vollbild auf.
2. **ESC** drücken, um in die Einstellungen zu kommen.
3. Unter *System* den Haken bei **Automatisch mit dem System starten** setzen.
4. Unter *Videos* die Clips und Plakate hinzufügen, unter *Timetable* das Programm
   eintragen, unter *Getränkepreise* die Karte pflegen.
5. **Speichern** – die Anzeige übernimmt die Änderungen sofort.

> Der Bar-PC braucht kein Node.js und keine Internetverbindung. Alles Nötige – auch die
> Schrift und ffmpeg – steckt im Programm.

---

## Bedienung

| Aktion | Wie |
|---|---|
| Einstellungen öffnen | **ESC**, oder Maus bewegen und oben rechts aufs Zahnrad klicken |
| Einstellungen (Notausgang) | **Strg + Alt + S** |
| Programm beenden | **Strg + Alt + Q**, oder in den Einstellungen unter *System* |
| Zurück zur Anzeige | Einstellungsfenster schließen |
| Speichern | Knopf oben rechts, oder **Strg + S** |

Ist unter *System* eine PIN hinterlegt, fragt die Anzeige vorher nach einem Zahlencode.
Das verhindert, dass jemand im Vorbeigehen die Preise ändert.

![PIN-Abfrage](docs/screenshots/anzeige-pin.png)

---

## Die Anzeige

### Timetable

Der gerade laufende Act steht als **JETZT**-Karte oben, mit großem Foto, Zeitspanne und
Zusatz wie „Live" oder „DJ-Set". Darunter folgen die nächsten Acts mit Miniaturfoto und
der Angabe HEUTE / MORGEN / Wochentag. Die Anzeige aktualisiert sich im laufenden Betrieb,
ohne dass jemand etwas anfassen muss.

![Timetable-Anzeige](docs/screenshots/anzeige-timetable.png)

### Getränkepreise

Die Gruppen stehen nebeneinander, die Anzahl der Spalten richtet sich nach dem Platz.
Passt die Karte nicht auf den Bildschirm, verkleinert sich die Schrift automatisch,
bis alles zu sehen ist – abgeschnitten wird nie.

Darunter liegt optional der **Spezialshot**: ein Band über die volle Breite in der
Signalfarbe, mit Überschrift, Name, Preis und einem Beschreibungstext. Gedacht für den
Shot des Abends oder eine Aktion, die nicht in der normalen Karte untergehen soll.

![Preis-Anzeige](docs/screenshots/anzeige-preise.png)

### Standbilder

Plakate laufen gleichberechtigt mit den Videos in der Schleife, formatfüllend und mit
eigener Standzeit.

![Standbild in der Schleife](docs/screenshots/anzeige-standbild.png)

### Durchsage

Ein Balken am unteren Bildrand, über alles gelegt — auch über ein laufendes Video.
Eingeschaltet wird er vom Handy oder vom Einstellungsfenster aus, er steht binnen
einer Sekunde auf jedem Bildschirm, der an derselben Konfiguration hängt, und
blendet sich auf Wunsch nach 5 bis 60 Minuten von allein wieder aus.

![Durchsage über einem laufenden Clip](docs/screenshots/anzeige-durchsage.png)

### QR-Code

Unten links auf dem Timetable kann ein QR-Code mit Beschriftung stehen — z. B. auf
die Festivalseite oder auf das ausführliche Line-up. Umlaute in der Adresse sind kein
Problem.

Der Code ist **optional**: unter *Anzeige → Beschriftung* gibt es den Haken
**QR-Code auf dem Timetable anzeigen**. Ohne Haken bleibt der Timetable frei, Adresse
und Beschriftung bleiben aber gespeichert — praktisch, wenn eine Bar den Code haben
will und die nächste nicht, oder wenn er nur an einzelnen Tagen erscheinen soll.
Ohne Adresse erscheint ebenfalls kein Code.

### Ruhezeit

Außerhalb der eingestellten Öffnungszeit bleibt der Bildschirm schwarz und die
Schleife steht still — das schont Gerät und Strom. Bewegt jemand die Maus,
erscheint kurz ein Hinweis, dass das Programm läuft und nur schläft; über die
Einstellungen kommt man weiterhin ganz normal rein.

### Gedrehte Anzeige

Für senkrecht aufgehängte Fernseher lässt sich die ganze Anzeige um 90, 180 oder
270 Grad drehen, samt Übergängen und PIN-Feld. Am Betriebssystem muss dafür nichts
eingestellt werden — praktisch besonders am Raspberry Pi.

![Timetable auf einem hochkant montierten Bildschirm](docs/screenshots/anzeige-drehung.png)

### Übergänge

Vier Varianten, einstellbar unter *Anzeige → Stil & Übergänge*:

| Übergang | Beschreibung |
|---|---|
| Weiche Überblendung | Beitrag blendet in den nächsten über (Standard) |
| Harter Schnitt | Ohne Überblendung |
| Logo-Blende | Eine Fläche mit dem Logo zieht auf und wieder weg |
| Blob-Wisch | Eine organische Form fährt mit dem Logo durchs Bild |

Ohne hinterlegtes Logo erscheint bei beiden Logo-Varianten der Bar-Name.

| Logo-Blende | Blob-Wisch |
|---|---|
| ![Logo-Blende](docs/screenshots/uebergang-logo.png) | ![Blob-Wisch](docs/screenshots/uebergang-wisch.png) |

---

## Die Einstellungen

### Durchsage

![Einstellungen Durchsage](docs/screenshots/einstellungen-durchsage.png)

Der erste Reiter, und am Handy gleich geöffnet — dafür kommt man meistens her.
Text eintippen, **Jetzt anzeigen** — der Balken steht binnen einer Sekunde auf
allen Bildschirmen, die an derselben Konfiguration hängen. **Ausblenden** nimmt
ihn wieder weg. Beide Knöpfe speichern sofort, ohne den Speichern-Knopf oben.

Optional blendet sich die Durchsage nach 5, 15, 30 oder 60 Minuten von allein
aus — praktisch für „Letzte Runde", damit niemand daran denken muss.

Im Browserbetrieb steht auf demselben Reiter eine **Vorschau**: so sehen
Timetable und Preise gerade aus, ohne zum Bildschirm zu laufen. Videos werden
darin weggelassen, damit die Vorschau den Pi nicht zusätzlich belastet.

### Videos

![Einstellungen Videos](docs/screenshots/einstellungen-videos.png)

Hier steht die Schleife. Die Reihenfolge in der Liste ist die Reihenfolge auf dem
Bildschirm, verschieben geht mit den Pfeilen links.

- **+ Videos & Bilder hinzufügen** kopiert die Dateien in den Medien-Ordner des
  Programms. Die Originale können danach weg.
- Das **Häkchen** schaltet einen Beitrag vorübergehend ab, ohne ihn zu löschen.
- **immer laufen lassen** / **nur zu bestimmten Zeiten**: Bei der zweiten Wahl erscheint
  ein Zeitfenster mit Wochentagen und Uhrzeiten. Mehrere Fenster pro Beitrag sind möglich,
  die Schnellwahl *Mo-Fr*, *Fr-So* und *alle* spart Klicks.
- Bei Bildern erscheint zusätzlich ein Feld **Standzeit** in Sekunden. Bleibt es leer,
  gilt die globale Vorgabe aus dem Reiter *Anzeige*.
- Das Fähnchen rechts zeigt live an, ob der Beitrag gerade läuft, pausiert oder
  deaktiviert ist – inklusive der Zeitfenster im Klartext.
- **Clips prüfen & umwandeln** testet alle Videos und bietet an, nicht abspielbare
  Formate nach MP4 umzurechnen.

### Timetable

![Einstellungen Timetable](docs/screenshots/einstellungen-timetable.png)

Eine Zeile pro Act: Datum, Von, Bis, Name und ein optionaler Zusatz. Der gerade laufende
Act ist in der Tabelle farbig hinterlegt, vergangene sind ausgegraut.

- **Foto**: Klick auf *+ Foto* wählt ein Bild, Klick auf die Miniatur tauscht es,
  das rote × entfernt es.
- **Nach Zeit sortieren** bringt die Liste in die richtige Reihenfolge.
- **Vergangene löschen** räumt nach dem Festival auf.
- **Unbenutzte Fotos aufräumen** löscht Bilder, die keinem Act mehr zugeordnet sind.
- **Timetable weitergeben / übernehmen**: siehe [Mehrere Bars ausstatten](#mehrere-bars-ausstatten).

Endet ein Act nach Mitternacht, einfach `23:00` bis `01:30` eintragen – das Programm
erkennt den Tageswechsel selbst.

### Getränkepreise

![Einstellungen Preise](docs/screenshots/einstellungen-preise.png)

Gruppen wie *Bier*, *Alkoholfrei* oder *Longdrinks*, darin je ein Getränk pro Zeile mit
Name, Größe und Preis. Die Größe darf leer bleiben. Die Reihenfolge der Gruppen lässt
sich mit den Pfeilen ändern.

Ganz unten steht die Karte **Spezialshot**. Einmal den Haken setzen, dann Überschrift,
Name, Größe, Preis und Beschreibung eintragen – fertig. Ohne Haken erscheint das Band
gar nicht. Die Überschrift ist frei wählbar, also auch *AKTION*, *HAPPY HOUR* oder was
sonst passt.

### Anzeige

![Einstellungen Anzeige](docs/screenshots/einstellungen-anzeige.png)

- **Info-Slides in der Schleife**: nach wie vielen Beiträgen Timetable und Preise
  erscheinen und wie lange sie stehen bleiben. `0` schaltet den jeweiligen Slide ab.
  Der Zähler läuft über die Runden hinweg weiter – „nach je 5 Beiträgen" greift also
  auch, wenn gerade nur 3 Clips aktiv sind.
- **Logo**: eigenes Logo wählen, auf das L300-Standardlogo zurücksetzen oder ganz
  abschalten. Die Höhe ist in Prozent der Bildschirmhöhe angegeben.
- **Beschriftung**: Bar-Name, Untertitel und die Titel beider Info-Slides. Lässt man den
  Bar-Namen leer, steht dort nur das Logo.
- **Stil & Übergänge**: Fläche hinter dem Seitentitel (Blob, Balken oder ohne),
  Hintergrundmuster (keins, dezente Punkte, Konfetti) und der Übergang.
- **Farben & Schrift**: Hintergrund-, Akzent- und Signalfarbe, zwei Voreinstellungen,
  optional eine eigene Schriftdatei.
- **Anzeige drehen**: 90, 180 oder 270 Grad. Gedacht für senkrecht montierte
  Bildschirme — der Fernseher wird gedreht aufgehängt, die Anzeige dreht mit.
  Wirkt sofort und gilt auf jedem System gleich, auch auf dem Raspberry Pi,
  wo die Drehung über das Betriebssystem umständlich ist.
- **Ruhezeit**: Von–Bis, außerhalb dessen bleibt der Bildschirm schwarz. Über
  Mitternacht hinweg funktioniert es wie bei den Clips, also auch 04:00 bis 14:00
  für eine Bar, die nachts läuft. Unbrauchbare Zeiten schalten die Ruhezeit ab,
  statt den Bildschirm dauerhaft schwarz zu lassen.
- **QR-Code**: Haken setzen, Adresse und Beschriftung eintragen — dann erscheint
  unten links auf dem Timetable ein Code. Ohne Haken bleiben die Felder ausgegraut
  und gespeichert, es erscheint aber nichts.

### System

![Einstellungen System](docs/screenshots/einstellungen-system.png)

- **Automatisch mit Windows starten**
- **PIN** für die Einstellungen (nur Ziffern, leer = kein Schutz)
- **Bildschirm**: auf welchem Monitor die Anzeige läuft. *Bildschirme nummerieren*
  blendet kurz eine große Ziffer auf jedem Schirm ein, damit die Zuordnung klar ist.
  Wird der gewählte Monitor abgezogen, wandert die Anzeige auf den Hauptbildschirm.
- **Konfiguration sichern / laden** als JSON-Datei
- **Programm beenden**

---

## Mehrere Bars ausstatten

**Einmal komplett einrichten, dann verteilen:**

1. An einem Rechner alles einstellen: Logo, Farben, Timetable, Preise.
2. *System → Konfiguration sichern* schreibt alles in eine JSON-Datei.
3. An der nächsten Bar dieselbe `.exe` installieren, die Datei über
   *Konfiguration laden* einspielen, dann nur noch Bar-Name und Preise anpassen.

**Line-up nachträglich ändern:**

*Timetable → Timetable weitergeben* schreibt eine einzelne Datei, in der die Acts
**samt Fotos** eingebettet sind. An den anderen Bars *Timetable übernehmen* – Preise und
Videos der jeweiligen Bar bleiben unangetastet. Damit lassen sich Programmänderungen
durchreichen, ohne dass an den einzelnen Bars etwas kaputtgeht.

Videodateien wandern nicht mit; die kommen per USB-Stick in den Medien-Ordner oder werden
an jeder Bar über *Videos & Bilder hinzufügen* eingelesen.

---

## Raspberry Pi

Auf einem Raspberry Pi läuft **nicht** die Electron-Fassung. Electron bringt sein
eigenes Chromium mit, und das nutzt die Hardware-Dekodierung des Pi nicht — 1080p
wäre damit auf einem Pi 3 unbrauchbar. Stattdessen läuft dort ein kleiner Dienst,
der dieselbe Anzeige ausliefert, und das Chromium von Raspberry Pi OS zeigt sie an.
**Die Anzeige selbst ist Zeile für Zeile dieselbe** — Design, Schleife, Zeitfenster,
Timetable, Spezialshot, alles identisch.

### Einrichten

Raspberry Pi OS flashen, ins Terminal, ein Befehl:

```bash
curl -fsSL https://raw.githubusercontent.com/Tarmac-Festival/bar-display/main/pi/install.sh | bash
```

Das Skript installiert Node.js, Chromium und `cage`, legt das Programm nach
`/opt/bar-display` und richtet zwei Dienste ein: einen für den Webdienst, einen für
die Vollbildanzeige. Nach dem Neustart läuft alles von allein.

### Bedienung vom Handy

Am Pi gibt es keine Tastatur. Die Einstellungen laufen deshalb über das Netzwerk —
im selben WLAN im Browser aufrufen:

```
http://<IP-des-Pi>:8080/einstellungen
```

Die Seite ist für schmale Bildschirme ausgelegt. Änderungen erscheinen **sofort** auf
der Anzeige, ohne Neustart. Was dort geht: Timetable, Preise, Spezialshot, alle Texte,
Farben, Häufigkeiten, Zeitfenster. Was **nicht** geht: Videos, Fotos, Logo und
Schriftart auswählen — dafür fehlt am Handy die Dateiauswahl. Die kopiert ihr in die
Ordner auf dem Pi:

```
~/.config/Bar Display/media      Videos und Standbilder
~/.config/Bar Display/photos     Act-Fotos
~/.config/Bar Display/branding   eigenes Logo
```

Praktisch: Die Konfigurationsdatei hat auf allen Systemen dasselbe Format. Ihr könnt
also am Rechner alles einrichten und `config.json` samt Ordnern auf den Pi kopieren.

### Was der Pi leisten muss

| | |
|---|---|
| Getestet gedacht für | Pi 3B mit 1 GB |
| Videos | H.264 in MP4, Hardware-Dekodierung über Chromium |
| Nicht empfohlen | Pi Zero 2 W — 512 MB sind für Chromium zu knapp |

Nützliche Befehle auf dem Pi:

```bash
bar-display-update
```

```bash
journalctl -u bar-display-kiosk -f
```

### Ehrlicher Hinweis

Der Dienst, die Anzeige im Browser, die Bedienseite und das Live-Nachladen sind
geprüft — allerdings auf einem PC, nicht auf einem Pi. Ob 1080p auf einem Pi 3B
wirklich flüssig läuft und ob der Speicher reicht, lässt sich nur am Gerät
feststellen. Wenn es klemmt, sind das die wahrscheinlichsten Stellschrauben:
Videos auf 720p herunterrechnen, das Punktmuster im Hintergrund abschalten und
die Überblendung auf harten Schnitt stellen.


## Unterstützte Formate

| Art | Formate |
|---|---|
| Video, direkt abspielbar | MP4 (H.264), WebM, OGV |
| Video, per Umwandlung | AVI, WMV, MKV, MOV, HEVC, ProRes und weitere |
| Bilder in der Schleife | JPG, PNG, WebP, GIF, AVIF, BMP |
| Act-Fotos | JPG, PNG, WebP, GIF, AVIF, BMP |
| Logo | PNG, SVG, JPG, WebP |
| Schrift | TTF, OTF, WOFF, WOFF2 |

Beim Hinzufügen prüft das Programm jedes Video und bietet die Umwandlung nach MP4 an,
wenn Windows es nicht direkt abspielen kann. Dafür ist ffmpeg mitgeliefert.

Act-Fotos werden mittig quadratisch beschnitten – ein etwa quadratischer Ausschnitt mit
dem Motiv in der Mitte sieht am besten aus, ab ungefähr 400 px Kantenlänge.

---

## Wo die Daten liegen

Unter Windows liegt alles in `%APPDATA%\Bar Display\`, unter Linux in
`~/.config/Bar Display/`, unter macOS in `~/Library/Application Support/Bar Display/`.

| Was | Datei bzw. Ordner |
|---|---|
| Einstellungen | `config.json` |
| Sicherungskopie | `config.backup.json` |
| Videos und Bilder | `media/` |
| Act-Fotos | `photos/` |
| Eigenes Logo | `branding/` |
| Eigene Schrift | `fonts/` |

Vor jedem Speichern legt das Programm eine Sicherungskopie der letzten Fassung an.

Der Autostart wird unter Windows im Anmelde-Autostart eingetragen, unter Linux als
`~/.config/autostart/bar-display.desktop`.

---

## Wenn etwas klemmt

| Problem | Lösung |
|---|---|
| Bildschirm bleibt schwarz | **Strg + Alt + S** öffnet die Einstellungen auch dann, wenn die Anzeige nicht reagiert |
| Ein Clip wird übersprungen | Format wird nicht unterstützt – *Videos → Clips prüfen & umwandeln* |
| Anzeige auf dem falschen Monitor | *System → Bildschirm*, vorher *Bildschirme nummerieren* |
| Preise/Timetable erscheinen nie | Im Reiter *Anzeige* steht die Häufigkeit auf `0` |
| Ein Clip läuft nie | Fähnchen im Reiter *Videos* prüfen: deaktiviert oder kein Zeitfenster gesetzt |
| Nach einem System-Update startet nichts mehr | Autostart unter *System* neu setzen |
| Bildschirm schwarz, Maus zeigt einen Hinweis | Ruhezeit ist aktiv – *Anzeige → Ruhezeit* |
| Durchsage hängt fest | *Durchsage → Ausblenden*, oder eine Ausblendzeit setzen |
| Anzeige steht auf dem Kopf oder quer | *Anzeige → Anzeige drehen* auf „Nicht drehen" |
| QR-Code fehlt auf dem Timetable | *Anzeige → Beschriftung*: Haken setzen und Adresse eintragen |
| macOS: „unbekannter Entwickler" oder „beschädigt" | Rechtsklick → Öffnen, siehe Abschnitt macOS. Das Programm ist unsigniert, nicht kaputt |
| Linux: Programm startet nicht | Ausführbar-Bit fehlt – `chmod +x` auf die AppImage bzw. auf `bar-display` und `resources/ffmpeg/ffmpeg` |
| Linux: Umwandlung nicht verfügbar | Sollte nicht vorkommen, ffmpeg liegt bei. Notfalls `sudo apt install ffmpeg` – das Programm nimmt auch ein systemweit installiertes |

---

## Für Entwickler

Node.js wird nur zum Bauen gebraucht, nicht auf dem Bar-PC.

```bash
npm install
```

Zum Testen starten:

```bash
npm start
```

Tests für die Zeitfenster- und Timetable-Logik:

```bash
npm test
```

Pakete bauen – die Ergebnisse landen in `dist/`:

```bash
npm run dist
```

```bash
npm run dist:linux
```

```bash
npm run dist:mac
```

Beim ersten Bauen holt das Projekt die ffmpeg-Binärdateien für alle Plattformen nach
`vendor/` (absichtlich nicht im Repository). Jeder Download wird gegen eine hinterlegte
SHA-256-Prüfsumme geprüft. Einzeln anstoßen:

```bash
npm run vendor:ffmpeg
```

Jede Plattform baut nur auf sich selbst: **AppImage und `.deb` brauchen Linux, `.dmg`
braucht macOS.** Deshalb baut der Ablauf auf GitHub alle drei parallel.

**AppImage und `.deb` lassen sich nur auf einem Linux-System bauen** – electron-builder
braucht dafür Linux-Werkzeuge. Unter Windows entsteht nur ein `tar.gz`, dem außerdem die
Ausführungsrechte fehlen. Der bequeme Weg ist der Ablauf in
`.github/workflows/release.yml`: einen Tag anlegen und schieben, dann baut GitHub alle
Pakete für Windows und Linux und hängt sie an das Release.

```bash
git tag v1.1.0 && git push origin v1.1.0
```

### Reproduzierbare Releases

Damit ein Release später aus demselben Stand nochmal gebaut werden kann:

- **Abhängigkeiten sind festgenagelt.** `package-lock.json` liegt im Repository, der
  Ablauf auf GitHub benutzt `npm ci` — nie `npm install`.
- **ffmpeg ist auf Prüfsumme festgelegt.** `scripts/fetch-ffmpeg.js` kennt für jede
  Plattform die erwartete SHA-256 und Dateigröße und bricht ab, wenn etwas nicht passt.
  Ein stillschweigend ausgetauschter Download fällt damit auf.
- **Tag und Version müssen zusammenpassen.** Der Ablauf vergleicht den Git-Tag mit der
  Version in `package.json` und bricht bei Abweichung ab, bevor irgendetwas gebaut wird.
- **Prüfsummen liegen dem Release bei.** Zu jeder Plattform gibt es eine
  `SHA256SUMS-*.txt`. Damit lässt sich eine heruntergeladene Datei gegenprüfen:

```bash
sha256sum -c SHA256SUMS-linux.txt
```

Ein Release entsteht ausschließlich über den Ablauf auf GitHub, nie von Hand:
Version in `package.json` setzen, committen, Tag anlegen und schieben.
Schlägt ein Lauf fehl, steht der Auszug aus dem Protokoll direkt in der
Zusammenfassung des Laufs.

### Aufbau

| Datei | Zweck |
|---|---|
| `main.js` | Fenster, Konfiguration, Medien-Import, Umwandlung, Bildschirmwahl, Autostart |
| `preload.js` | abgesicherte Brücke zwischen Fenster und System |
| `src/common.js` | Zeitfenster-Logik und Timetable-Berechnung, von beiden Fenstern genutzt |
| `src/player.*` | die Vollbild-Anzeige: Schleife, Übergänge, Slides |
| `src/settings.*` | das Einstellungsfenster |
| `src/fonts/` | Josefin Sans (Open Font License, Lizenztext liegt bei) |
| `src/branding/` | das mitgelieferte L300-Standardlogo |
| `test/schedule.test.js` | Tests |
| `pi/server.js` | Webdienst für den Raspberry Pi |
| `pi/install.sh` | Einrichtung auf dem Pi |
| `src/api-http.js` | Ersatz für die Electron-Brücke im Browserbetrieb |
| `src/qr.js` | QR-Erzeugung, mitgeliefert statt nachgeladen |
| `scripts/fetch-ffmpeg.js` | holt ffmpeg für Windows, Linux und macOS nach `vendor/`, mit Prüfsumme |
| `build/` | Programmsymbole, aus dem L300-Logo erzeugt |
| `.github/workflows/release.yml` | baut auf GitHub alle Pakete und hängt sie an ein Release |

### Mitgelieferte Fremdbestandteile

- **Josefin Sans** – SIL Open Font License 1.1, Lizenztext in `src/fonts/OFL.txt`
- **ffmpeg** – wird beim Bauen nach `vendor/` geholt, siehe `scripts/fetch-ffmpeg.js`
- **qrcode-generator** – MIT, als `src/qr.js` mitgeliefert
- **Electron** – Laufzeitumgebung
