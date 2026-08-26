'use strict';

// Ersatz für die Electron-Brücke, wenn die Anzeige in einem normalen Browser
// läuft (Raspberry Pi: Chromium im Kiosk-Modus, bedient von pi/server.js).
//
// Wird preload.js geladen, existiert window.api bereits - dann tut diese Datei
// nichts. So bleibt eine einzige Fassung von player.html/js für beide Wege.

if (!window.api) {
  const hole = async (pfad, optionen) => {
    const antwort = await fetch(pfad, optionen);
    if (!antwort.ok) throw new Error(pfad + ' -> HTTP ' + antwort.status);
    return antwort.json();
  };

  let zuletzt = 0;
  const beobachter = [];

  // Der Dienst meldet Änderungen über ein Ereignis; fällt die Verbindung aus,
  // wird sie automatisch neu aufgebaut.
  function lauschen() {
    try {
      const quelle = new EventSource('/api/events');
      quelle.addEventListener('config', (e) => {
        try {
          const cfg = JSON.parse(e.data);
          zuletzt = Date.now();
          beobachter.forEach(fn => fn(cfg));
        } catch (err) { /* kaputte Nachricht überspringen */ }
      });
      quelle.onerror = () => {
        quelle.close();
        setTimeout(lauschen, 3000);
      };
    } catch (err) {
      setTimeout(lauschen, 5000);
    }
  }
  lauschen();

  function loeschen(art, datei) {
    return fetch('/api/loeschen?art=' + encodeURIComponent(art) +
                 '&name=' + encodeURIComponent(datei), { method: 'POST' })
      .then(r => r.json()).then(a => !!(a && a.ok)).catch(() => false);
  }

  window.api = {
    paths: () => hole('/api/paths'),
    zeitStatus: () => hole('/api/zeit'),
    fernInfo: () => hole('/api/fern'),
    getConfig: () => hole('/api/config'),
    saveConfig: (cfg) => hole('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    }),
    onConfigChanged: (cb) => beobachter.push(cb),

    // Im Browser gibt es keine Dateiauswahl und kein Fenster-Handling.
    // Diese Wege laufen über die Einstellungsseite des Dienstes.
    openSettings: async () => { window.location.href = '/einstellungen'; },
    closeSettings: async () => {},
    quit: async () => {},
    listDisplays: () => hole('/api/displays').catch(() => []),
    identifyDisplays: () => fetch('/api/displays/nummerieren', { method: 'POST' })
      .then(r => r.json()).then(a => (a && a.anzahl) || 0).catch(() => 0),
    getAutostart: async () => true,
    setAutostart: async () => true,
    // Dateien kommen hier nicht aus einem Systemdialog, sondern aus der
    // Dateiauswahl des Handys - siehe upload.js. Die Rückgabewerte sind
    // dieselben wie unter Electron, das Einstellungsfenster merkt nichts davon.
    addMedia: (aufMeldung) => window.barDisplayUpload.ablauf('media', aufMeldung),
    listMedia: () => hole('/api/media'),
    deleteMedia: (datei) => loeschen('media', datei),
    openMediaFolder: async () => {},
    canConvert: () => hole('/api/canconvert'),
    convertMedia: async () => ({ ok: false, fehler: 'Umwandeln geht nur am Rechner.' }),
    onConvertProgress: () => {},

    addPhoto: async (aufMeldung) => {
      const fertig = await window.barDisplayUpload.ablauf('photo', aufMeldung);
      return fertig.length ? fertig[0].file : null;
    },
    deletePhoto: (datei) => loeschen('photo', datei),
    openPhotoFolder: async () => {},
    cleanupPhotos: () => fetch('/api/aufraeumen?art=photos', { method: 'POST' })
      .then(r => r.json()).then(a => (a && a.ok) ? a.weg : 0).catch(() => 0),

    addLogo: async (aufMeldung) => {
      const fertig = await window.barDisplayUpload.ablauf('logo', aufMeldung);
      return fertig.length ? fertig[0].file : null;
    },
    removeLogo: (datei) => loeschen('logo', datei),
    addFont: async (aufMeldung) => {
      const fertig = await window.barDisplayUpload.ablauf('font', aufMeldung);
      return fertig.length ? fertig[0].file : null;
    },
    removeFont: (datei) => loeschen('font', datei),

    // PIN-Schutz der Bedienseite
    zugangStatus: () => hole('/api/status'),
    anmelden: (pin) => fetch('/api/anmelden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    }).then(r => r.json().catch(() => ({ ok: false, fehler: 'Keine Antwort.' }))),
    exportTimetable: async () => 0,
    importTimetable: async () => null,
    exportConfig: async () => false,
    importConfig: async () => null
  };
}
