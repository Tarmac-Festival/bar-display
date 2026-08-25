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

  window.api = {
    paths: () => hole('/api/paths'),
    zeitStatus: () => hole('/api/zeit'),
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
    listDisplays: async () => [],
    identifyDisplays: async () => 0,
    getAutostart: async () => true,
    setAutostart: async () => true,
    addMedia: async () => [],
    listMedia: () => hole('/api/media'),
    deleteMedia: async () => false,
    openMediaFolder: async () => {},
    canConvert: () => hole('/api/canconvert'),
    convertMedia: async () => ({ ok: false, fehler: 'Umwandlung läuft nur am Rechner.' }),
    onConvertProgress: () => {},
    addPhoto: async () => null,
    deletePhoto: async () => false,
    openPhotoFolder: async () => {},
    cleanupPhotos: async () => 0,
    addLogo: async () => null,
    removeLogo: async () => false,
    addFont: async () => null,
    removeFont: async () => false,
    exportTimetable: async () => 0,
    importTimetable: async () => null,
    exportConfig: async () => false,
    importConfig: async () => null
  };
}
