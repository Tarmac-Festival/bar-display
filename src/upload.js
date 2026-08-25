'use strict';

// Dateiauswahl und Hochladen im Browserbetrieb (Bedienseite am Handy).
//
// Am Rechner öffnet Electron einen echten Dateidialog; im Browser gibt es das
// nicht, also bauen wir uns einen aus einem versteckten <input type="file">.
// Die Rückgabewerte sind bewusst dieselben wie in der Electron-Fassung, damit
// das Einstellungsfenster darüber nichts von dem Unterschied merkt.

// Stellt nur Werkzeuge bereit. Ob sie benutzt werden, entscheidet api-http.js -
// unter Electron uebernimmt den ganzen Teil der Hauptprozess.
(function () {
  const ARTEN = {
    media: { accept: 'video/*,image/*', mehrere: true },
    photo: { accept: 'image/*', mehrere: false },
    logo:  { accept: '.png,.svg,.jpg,.jpeg,.webp', mehrere: false },
    font:  { accept: '.ttf,.otf,.woff,.woff2', mehrere: false }
  };

  // ------------------------------------------------------------------ Auswahl
  function dateienWaehlen(art) {
    const regeln = ARTEN[art];
    return new Promise((fertig) => {
      const feld = document.createElement('input');
      feld.type = 'file';
      feld.accept = regeln.accept;
      feld.multiple = regeln.mehrere;
      feld.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(feld);

      // "change" kommt nicht, wenn jemand den Dialog abbricht. Damit die
      // Zusage nicht ewig offen bleibt, hängen wir uns zusätzlich an den
      // nächsten Fokus des Fensters.
      let erledigt = false;
      const schliessen = (dateien) => {
        if (erledigt) return;
        erledigt = true;
        window.removeEventListener('focus', beiFokus);
        feld.remove();
        fertig(dateien);
      };
      const beiFokus = () => setTimeout(() => schliessen([]), 800);

      feld.addEventListener('change', () => schliessen(Array.from(feld.files || [])));
      window.addEventListener('focus', beiFokus);
      feld.click();
    });
  }

  // ------------------------------------------------------- Bilder verkleinern
  // Ein Handyfoto hat gern 12 Megapixel und 6 MB. Act-Fotos werden auf der
  // Anzeige quadratisch auf wenige hundert Pixel beschnitten - das in voller
  // Größe über WLAN zu schicken ist reine Wartezeit. Also vorher im Browser
  // verkleinern; das dauert Millisekunden und spart Minuten.
  const KANTE = { photo: 900, logo: 1200 };

  function verkleinern(datei, art) {
    const max = KANTE[art];
    if (!max || !/^image\//.test(datei.type) || /svg/.test(datei.type)) return Promise.resolve(datei);
    if (datei.size < 300 * 1024) return Promise.resolve(datei);

    return new Promise((fertig) => {
      const url = URL.createObjectURL(datei);
      const bild = new Image();
      bild.onload = () => {
        try {
          const faktor = Math.min(1, max / Math.max(bild.width, bild.height));
          if (faktor >= 1) { URL.revokeObjectURL(url); return fertig(datei); }

          const leinwand = document.createElement('canvas');
          leinwand.width = Math.round(bild.width * faktor);
          leinwand.height = Math.round(bild.height * faktor);
          leinwand.getContext('2d').drawImage(bild, 0, 0, leinwand.width, leinwand.height);
          leinwand.toBlob((klein) => {
            URL.revokeObjectURL(url);
            if (!klein || klein.size >= datei.size) return fertig(datei);
            klein.name = datei.name.replace(/\.[^.]+$/, '') + '.jpg';
            fertig(klein);
          }, 'image/jpeg', 0.88);
        } catch (e) {
          URL.revokeObjectURL(url);
          fertig(datei);
        }
      };
      bild.onerror = () => { URL.revokeObjectURL(url); fertig(datei); };
      bild.src = url;
    });
  }

  // ----------------------------------------------------------------- Hochladen
  function hochladen(datei, art, name, fortschritt) {
    return new Promise((fertig, fehler) => {
      const anfrage = new XMLHttpRequest();
      anfrage.open('POST', '/api/upload?art=' + encodeURIComponent(art) +
                           '&name=' + encodeURIComponent(name));
      anfrage.setRequestHeader('Content-Type', 'application/octet-stream');

      if (anfrage.upload && fortschritt) {
        anfrage.upload.onprogress = (e) => {
          if (e.lengthComputable) fortschritt(e.loaded / e.total);
        };
      }
      anfrage.onload = () => {
        let antwort = null;
        try { antwort = JSON.parse(anfrage.responseText); } catch (e) { /* gleich */ }
        if (anfrage.status === 401) return fehler(new Error('PIN'));
        if (!antwort || !antwort.ok) {
          return fehler(new Error((antwort && antwort.fehler) || 'Hochladen fehlgeschlagen.'));
        }
        fertig(antwort);
      };
      anfrage.onerror = () => fehler(new Error('Verbindung zum Bar-Rechner verloren.'));
      anfrage.onabort = () => fehler(new Error('Abgebrochen.'));
      anfrage.send(datei);
    });
  }

  // ------------------------------------------------------------------ Balken
  function balkenZeigen() {
    let kasten = document.getElementById('uploadBalken');
    if (!kasten) {
      kasten = document.createElement('div');
      kasten.id = 'uploadBalken';
      kasten.innerHTML = '<div class="uText"></div><div class="uSpur"><div class="uFuell"></div></div>';
      document.body.appendChild(kasten);
    }
    kasten.classList.add('an');
    return {
      setzen(text, anteil) {
        kasten.querySelector('.uText').textContent = text;
        kasten.querySelector('.uFuell').style.width = Math.round((anteil || 0) * 100) + '%';
      },
      weg() { kasten.classList.remove('an'); }
    };
  }

  // ------------------------------------------------------------------- Ablauf
  async function ablauf(art, aufMeldung) {
    const dateien = await dateienWaehlen(art);
    if (!dateien.length) return [];

    const balken = balkenZeigen();
    const fertige = [];
    try {
      for (let i = 0; i < dateien.length; i++) {
        const roh = dateien[i];
        const zaehler = dateien.length > 1 ? ' (' + (i + 1) + ' von ' + dateien.length + ')' : '';
        balken.setzen('Wird vorbereitet' + zaehler + ' …', 0);

        const datei = await verkleinern(roh, art);
        const name = datei.name || roh.name;

        try {
          const erg = await hochladen(datei, art, name, (a) => {
            balken.setzen(name + zaehler, a);
          });
          fertige.push({ file: erg.file, original: roh.name, hinweis: erg.hinweis });
          if (erg.hinweis && aufMeldung) aufMeldung(erg.hinweis, true);
        } catch (err) {
          if (err.message === 'PIN') throw err;
          if (aufMeldung) aufMeldung(roh.name + ': ' + err.message, true);
        }
      }
    } finally {
      balken.weg();
    }
    return fertige;
  }

  window.barDisplayUpload = { ablauf, dateienWaehlen, hochladen, verkleinern };
})();
