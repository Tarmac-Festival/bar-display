# Änderungen

Was in einer Fassung dazugekommen ist. Die Dateien zum Herunterladen hängen an
den [Releases](https://github.com/Tarmac-Festival/bar-display/releases); ältere
Fassungen als die hier aufgeführten stehen dort ebenfalls.

## v1.4.0

Die erste Fassung nach einem echten Aufbau — vieles davon kommt aus dem Betrieb
zurück und nicht vom Reißbrett.

### Neu

- **Zeiten für starke Lichteffekte.** Eine eigene Liste, getrennt von den
  Spielzeiten: eine Lichtphase fängt mitten in einem Set an oder läuft über zwei
  Acts. Auf dem Timetable steht sie als eigene Spalte am rechten Rand — der
  Kasten sitzt zeitgenau in der Zeile, mit der Uhrzeit darin. Läuft gerade eine,
  steht sie als Balken über der Liste. Optional läuft eine eigene Seite fürs
  ganze Wochenende mit, nach Nächten geordnet.
- **Karte für einen Essensstand.** Jede Gruppe entscheidet selbst, wie sie
  aussieht: kompakt mit Punktlinie oder mit Foto und Beschreibung. Dazu ein
  Hervorgehobenes je Gruppe — das Tagesgericht neben dem Shot des Abends.
- **Karte auf mehrere Seiten.** Eine lange Karte läuft optional als mehrere
  Seiten direkt nacheinander, statt so klein zu werden, dass sie niemand liest.
- **Probezeit für den Aufbau.** Die Anzeige tut so, als wäre es 23 Uhr, damit
  sich der Abend am Nachmittag prüfen lässt. Die Uhr des Rechners bleibt
  unangetastet.
- **„nur noch 28 min"** — in der letzten halben Stunde steht beim laufenden Act,
  wie lange er noch spielt.
- **Zehn Übergänge**, zum Anhaken, abwechselnd oder der Reihe nach.
- **Häufigkeit wahlweise in Minuten** statt in Beiträgen.
- **Timetable weitergeben, samt Fotos** — eine Datei für alle Bars, am Rechner
  wie am Handy.
- **Datum und Uhrzeit tippen statt klicken.** `3.10.26` oder `031026` genügt.
- **Laufschrift für Durchsagen**, in drei Geschwindigkeiten.
- **Die Durchsage deckt nichts mehr zu.** Der Rest rückt zusammen: ein Video
  bekommt Ränder an der Seite, Timetable und Karte rechnen sich in die kleinere
  Fläche.
- **Anzeige auf weiteren Einplatinenrechnern**, etwa einem Odroid N2+ — mit oder
  ohne Arbeitsfläche.

### Behoben

- **Speichern setzte die Schleife auf Anfang.** Sie läuft jetzt weiter.
- **Nach dem Speichern ging Getipptes ins Leere.** Ein zweites Speichern hätte
  es stillschweigend verworfen, während es noch im Feld stand.
- **Handy und Rechner liefen auseinander.** Wer zuletzt speicherte, überschrieb
  den anderen kommentarlos; jetzt kommt eine Rückfrage.
- **iPhone: aus einer Cloud ließ sich nichts hinzufügen.** Der Typfilter legte
  den Dateianbieter lahm, und die Auswahl gab nach dreißig Sekunden auf — mitten
  im Suchen.
- **Fotos am Handy**: Vorschau blieb leer, frisch aufgenommene Bilder kamen
  nicht an.
- **Durchsagen liefen während einer Probezeit nicht.** Bedienseite und Anzeige
  rechneten mit verschiedenen Uhren.
- **Fotos aufräumen** hätte alle Speisen-Fotos gelöscht.
- **Eine vergangene Lichtphase** ließ das Warnzeichen am Act stehen.
- Dazu rund zwanzig kleinere Funde aus zwei Durchsuchungen des Bestands.

### Für Entwickler

- **Playwright** als Entwicklungswerkzeug — nicht im Programm, nur beim Bauen:
  214 Prüfungen an der laufenden Anzeige, dazu 430 Prüfungen ohne Browser.
