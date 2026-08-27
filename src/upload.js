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
    // Neben den Endungen auch die Medientypen: manche Dateianbieter koennen mit
    // einer blossen Endung nichts anfangen und zeigen dann gar nichts an.
    logo:  { accept: 'image/png,image/svg+xml,image/jpeg,image/webp,' +
                     '.png,.svg,.jpg,.jpeg,.webp', mehrere: false },
    font:  { accept: 'font/ttf,font/otf,font/woff,font/woff2,' +
                     '.ttf,.otf,.woff,.woff2', mehrere: false },
    json:  { accept: 'application/json,.json', mehrere: false }
  };

  // Auf dem iPhone keinen Filter setzen.
  //
  // iOS reicht den Filter an den Dateianbieter weiter, den jemand in der
  // Dateien-App auswaehlt. Google Drive kommt damit nicht zurecht und meldet
  // "Inhalt nicht verfuegbar - unbekannter Fehler"; der Ordner bleibt leer, und
  // es sieht aus, als waere das Programm kaputt. Ohne Filter listet der Anbieter
  // seinen Ordner normal auf.
  //
  // Verloren geht dabei nichts: welche Dateien wirklich taugen, entscheidet
  // ohnehin der Dienst beim Hochladen (lib/hochladen.js), und der sagt im
  // Klartext, was erlaubt ist. Ein Filter, der die Auswahl bequemer macht, ist
  // das eine - einer, der die halbe Cloud unsichtbar macht, das andere.
  function istIOS() {
    const ua = (navigator.userAgent || '');
    // iPadOS meldet sich seit Fassung 13 als Mac; der Zeigertest trennt beide.
    return /iPad|iPhone|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  // ------------------------------------------------------------------ Auswahl
  function dateienWaehlen(art) {
    const regeln = ARTEN[art];
    return new Promise((fertig) => {
      const feld = document.createElement('input');
      feld.type = 'file';
      if (!istIOS()) feld.accept = regeln.accept;
      feld.multiple = regeln.mehrere;
      feld.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(feld);

      // "change" kommt nicht, wenn jemand den Dialog abbricht. Damit die Zusage
      // nicht ewig offen bleibt, hängen wir uns zusätzlich an den nächsten
      // Fokus des Fensters.
      let erledigt = false;
      let warten = null;
      let hinweis = null;
      const schliessen = (dateien) => {
        if (erledigt) return;
        erledigt = true;
        clearInterval(warten);
        clearTimeout(hinweis);
        window.removeEventListener('focus', beiFokus);
        melden(null);
        feld.remove();
        fertig(dateien);
      };

      // Ein gerade aufgenommenes Foto ist nicht sofort da: das Handy schreibt es
      // erst weg, rechnet es um und reicht es dann herein. Eine feste Frist,
      // nach der die Auswahl als abgebrochen galt, hat es deshalb verschluckt.
      //
      // Seit Safari 16 und Chrome 113 sagt der Browser selbst Bescheid, wenn die
      // Auswahl ohne Datei geschlossen wurde: das Ereignis "cancel". Wo es das
      // gibt, braucht es gar keine Uhr - "change" oder "cancel", eines von
      // beiden kommt, und zwar dann, wenn es wirklich so weit ist.
      //
      // Das ist mehr als Kosmetik. Die Uhr lief eine halbe Minute und raeumte
      // danach das Feld weg. Wer in der Dateien-App durch eine Cloud blaettert,
      // dort auf einen Fehler laeuft und mehrfach "Wiederholen" tippt, ist
      // laengst darueber - und tippte dann auf eine Datei, die nirgends mehr
      // ankam.
      const kenntCancel = ('oncancel' in feld);

      const TAKT = 250;
      const GEDULD = 30000;
      const beiFokus = () => {
        if (erledigt || warten || kenntCancel) return;
        const bis = Date.now() + GEDULD;
        // Damit niemand vor einem scheinbar toten Bildschirm sitzt
        hinweis = setTimeout(() => { if (!erledigt) melden('Bild wird übernommen …'); }, 1200);
        warten = setInterval(() => {
          const da = Array.from(feld.files || []);
          if (da.length) return schliessen(da);
          if (Date.now() > bis) return schliessen([]);   // wirklich abgebrochen
        }, TAKT);
      };

      feld.addEventListener('change', () => schliessen(Array.from(feld.files || [])));
      feld.addEventListener('cancel', () => schliessen([]));
      if (!kenntCancel) window.addEventListener('focus', beiFokus);
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

  // Kurzer Hinweis waehrend des Wartens - benutzt denselben Kasten wie der
  // Fortschrittsbalken, nur ohne Balken.
  function melden(text) {
    const balken = document.getElementById('uploadBalken');
    if (!text) { if (balken) balken.classList.remove('an'); return; }
    const b = balkenZeigen();
    b.setzen(text, 0);
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

  /**
   * Eine Datei auswaehlen und ihren Text zurueckgeben - ohne sie hochzuladen.
   * Fuer die weitergegebene Timetable-Datei: die wird gelesen und an den Dienst
   * geschickt, sie landet nicht im Medienordner.
   */
  async function textDateiLesen() {
    const dateien = await dateienWaehlen('json');
    if (!dateien.length) return null;
    return { name: dateien[0].name, text: await dateien[0].text() };
  }

  window.barDisplayUpload = { ablauf, dateienWaehlen, hochladen, verkleinern,
                              textDateiLesen };
})();
