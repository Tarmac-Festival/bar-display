'use strict';

let state = null;
let paths = null;
let dirty = false;
// Jemand anders hat gespeichert, waehrend hier noch Aenderungen offen sind.
let fremdGeaendert = false;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mo ... So
const $ = (id) => document.getElementById(id);

boot();

async function boot() {
  paths = await window.api.paths();
  state = await window.api.getConfig();

  $('version').innerHTML = '<span>v' + paths.version + '</span>';
  $('p_media').value = paths.mediaDir;
  $('p_photos').value = paths.photoDir;
  $('p_config').value = paths.configPath;
  $('s_autostart').checked = await window.api.getAutostart();
  await renderDisplays();

  fillAll();
  wireTabs();
  wireButtons();
  fuerBrowserAnpassen();
  await zugangPruefen();

  window.api.onConfigChanged((cfg) => {
    if (dirty) {
      // Eigene Eingaben bleiben stehen - aber stillschweigend auseinanderlaufen
      // sollen die beiden Seiten nicht. Beim Speichern kommt die Rueckfrage.
      fremdGeaendert = true;
      $('fremd').classList.remove('hidden');
      return;
    }
    state = cfg;
    fillAll();
  });

  // Status "läuft gerade" aktuell halten
  setInterval(() => { updateBadges(); markTimetableRows(); }, 20000);
}

// Alle Felder aus dem aktuellen Zustand neu füllen.
function fillAll() {
  fillSettingsFields();
  fillDurchsage();
  fillRuhezeit();
  renderVideos();
  renderTimetable();
  renderPrices();
}

// ---------------------------------------------------------------------------
// Auf dem Raspberry Pi läuft diese Seite im Browser, aufgerufen vom Handy.
// Dateien auswählen geht dort inzwischen auch (upload.js); ausgeblendet wird
// nur noch, was ohne Fenster oder Dateimanager gar nicht geht.
// ---------------------------------------------------------------------------
// Was es im Browser wirklich nicht gibt. Dateien auswählen geht inzwischen
// auch am Handy (siehe upload.js) - hier bleibt nur, was einen Systemdialog,
// einen Dateimanager oder ein Fenster braucht.
const NUR_AM_RECHNER = [
  'openMedia', 'checkMedia',                      // Ordner öffnen, umwandeln
  'ttExport', 'ttImport',                         // Timetable als Datei weitergeben
  'openPhotos', 'exportCfg', 'importCfg',         // Ordner und Sicherungen
  'backToPlayer', 'quitApp'                       // Fensterschaltflächen
];

// Ohne PIN darf im Netzwerk niemand mehr schreiben - erst recht nicht, seit
// sich Dateien hochladen lassen. Gelesen werden darf weiter frei, sonst käme
// die Anzeige selbst nicht an ihre Konfiguration.
async function zugangPruefen() {
  if (paths.mode !== 'http' || !window.api.zugangStatus) return;
  let zustand = null;
  try { zustand = await window.api.zugangStatus(); } catch (e) { return; }
  if (!zustand || !zustand.pinAktiv || zustand.angemeldet) return;
  await pinAbfragen();
}

function pinAbfragen() {
  return new Promise((fertig) => {
    const schirm = document.createElement('div');
    schirm.id = 'pinSchirm';
    schirm.innerHTML =
      '<form class="pinKasten">' +
        '<h2>PIN eingeben</h2>' +
        '<p class="hint">Diese Bar ist mit einer PIN geschützt. Ohne sie lässt sich ' +
           'hier nichts ändern.</p>' +
        '<input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" ' +
           'id="pinFeld" maxlength="12">' +
        '<div class="pinFehler"></div>' +
        '<button type="submit" class="primary gross">Weiter</button>' +
      '</form>';
    document.body.appendChild(schirm);

    const feld = schirm.querySelector('#pinFeld');
    const fehler = schirm.querySelector('.pinFehler');
    feld.focus();

    schirm.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      fehler.textContent = '';
      let antwort = null;
      try { antwort = await window.api.anmelden(feld.value); } catch (err) { /* gleich */ }
      if (antwort && antwort.ok) {
        schirm.remove();
        // Jetzt darf die vollstaendige Konfiguration geholt werden - vorher kam
        // sie ohne PIN, und die wuerde beim Speichern die echte ueberschreiben.
        try { state = await window.api.getConfig(); fillAll(); } catch (err) { location.reload(); }
        return fertig();
      }
      fehler.textContent = (antwort && antwort.fehler) || 'PIN stimmt nicht.';
      feld.value = '';
      feld.focus();
    });
  });
}

function fuerBrowserAnpassen() {
  if (paths.mode !== 'http') return;
  document.body.dataset.modus = 'http';

  for (const id of NUR_AM_RECHNER) {
    const el = $(id);
    if (el) el.style.display = 'none';
  }
  // Autostart betrifft das Geraet, an dem die Anzeige haengt - vom Handy aus
  // laesst sich das nicht sinnvoll setzen.
  const autoKarte = $('s_autostart') && $('s_autostart').closest('.card');
  if (autoKarte) autoKarte.style.display = 'none';

  // Die Bildschirmauswahl bleibt: welcher Monitor die Anzeige zeigt, will man
  // auch vom Handy umstellen koennen. Sie wird nur ausgeblendet, wenn es gar
  // nichts zu waehlen gibt - am Raspberry Pi etwa.
  bildschirmKarteAnpassen();

  // Die Vorschau gibt es nur im Browserbetrieb - am Rechner steht die Anzeige
  // ohnehin daneben.
  const karte = $('vorschauKarte');
  if (karte) { karte.style.display = ''; vorschauVerdrahten(); }

  const hinweis = document.createElement('p');
  hinweis.className = 'hint';
  hinweis.style.cssText = 'margin:0 0 1rem;padding:0.7rem 0.9rem;border-radius:9px;' +
    'background:rgba(255,138,31,0.12);border:1px solid #4a3a28;max-width:none';
  hinweis.textContent = 'Fernbedienung über das Netzwerk. Timetable, Preise, Durchsagen ' +
    'und alle Texte lassen sich hier ändern, und Clips, Fotos, Logo und Schrift könnt ihr ' +
    'direkt vom Handy hochladen. Nur Umwandeln und das Weitergeben von Dateien bleiben ' +
    'dem Rechner vorbehalten.';
  const haupt = document.querySelector('main');
  haupt.insertBefore(hinweis, haupt.firstChild);
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------
function vorschauSkalieren() {
  const rahmen = document.querySelector('.vorschauRahmen');
  const bild = $('vorschauBild');
  if (!rahmen || !bild) return;
  bild.style.transform = 'scale(' + (rahmen.clientWidth / 1920) + ')';
}

function vorschauVerdrahten() {
  const bild = $('vorschauBild');
  const an = $('vorschauAn');
  const neu = $('vorschauNeu');

  const laden = () => {
    // Zeitstempel erzwingt frisches Laden statt einer zwischengespeicherten Seite
    bild.src = '/?vorschau=1&t=' + Date.now();
    vorschauSkalieren();
  };

  an.addEventListener('click', () => {
    laden();
    an.style.display = 'none';
    neu.style.display = '';
  });
  neu.addEventListener('click', laden);
  window.addEventListener('resize', vorschauSkalieren);
  vorschauSkalieren();
}

// ---------------------------------------------------------------------------
// Durchsage
// ---------------------------------------------------------------------------
function fillDurchsage() {
  state.announcement = state.announcement || {};
  const a = state.announcement;
  const feld = $('an_text');
  if (document.activeElement !== feld) feld.value = a.text || '';
  const stil = durchsageStil(a);
  $('an_modus').value = stil.modus;
  $('an_tempo').value = stil.tempo;
  tempoZeigen($('an_modus'), $('an_tempo'));
  durchsageStatus();
  renderPlaene();
  fillUhr();

  if (!feld.dataset.wired) {
    feld.dataset.wired = '1';
    feld.addEventListener('input', () => { state.announcement.text = feld.value; markDirty(); });

    for (const [id, feld] of [['an_modus', 'modus'], ['an_tempo', 'tempo']]) {
      $(id).addEventListener('change', () => {
        state.announcement = state.announcement || {};
        state.announcement[feld] = $(id).value;
        tempoZeigen($('an_modus'), $('an_tempo'));
        markDirty();
      });
    }

    $('an_zeigen').addEventListener('click', async () => {
      const text = feld.value.trim();
      if (!text) { toast('Bitte erst einen Text eingeben', true); return; }
      const minuten = Number($('an_dauer').value) || 0;
      state.announcement = Object.assign({}, state.announcement, {
        enabled: true,
        modus: $('an_modus').value,
        tempo: $('an_tempo').value,
        text,
        until: minuten ? new Date(Date.now() + minuten * 60000).toISOString() : ''
      });
      // Wurde nicht gespeichert - etwa weil woanders geaendert wurde -, waere
      // die Meldung "Durchsage laeuft" schlicht falsch.
      if (!(await save())) return;
      durchsageStatus();
      toast(minuten ? 'Durchsage läuft, endet in ' + minuten + ' Minuten' : 'Durchsage läuft');
    });

    $('an_weg').addEventListener('click', async () => {
      state.announcement = Object.assign({}, state.announcement, { enabled: false, until: '' });
      if (!(await save())) return;
      durchsageStatus();
      toast('Durchsage ausgeblendet');
    });
  }
}

function durchsageStatus() {
  const a = state.announcement || {};
  const el = $('an_status');
  let laeuft = !!(a.enabled && a.text);
  let bis = '';
  if (laeuft && a.until) {
    const ende = new Date(a.until);
    if (!isNaN(ende)) {
      if (Date.now() >= ende.getTime()) laeuft = false;
      else bis = ' bis ' + pad2(ende.getHours()) + ':' + pad2(ende.getMinutes());
    }
  }
  el.textContent = laeuft ? 'Durchsage läuft gerade' + bis : 'Keine Durchsage aktiv';
  el.classList.toggle('aktiv', laeuft);
}

// ---------------------------------------------------------------------------
// Bedienung vom Handy
// ---------------------------------------------------------------------------
// Die Adresse muss man sehen koennen, sonst sucht jemand die IP des Bar-
// Rechners von Hand heraus. Der QR-Code daneben spart auch noch das Abtippen.
async function fillFern() {
  const karte = $('fernKarte');
  const feld = $('fernAdresse');
  if (!karte || !feld) return;

  // Im Browserbetrieb sitzt man schon auf der Bedienseite - dort nur die Lage
  // zeigen, aber nichts zum Ein- und Ausschalten anbieten: wer den Dienst von
  // dort abschaltet, saegt den Ast ab, auf dem er sitzt.
  if (paths.mode === 'http') {
    karte.querySelectorAll('label, .hint').forEach(el => { el.style.display = 'none'; });
  }

  if (!window.api.fernInfo) { karte.style.display = 'none'; return; }

  let f = null;
  try { f = await window.api.fernInfo(); } catch (e) { /* gleich */ }
  const qr = $('fernQr');
  if (qr) qr.innerHTML = '';

  if (!f) {
    feld.textContent = 'Nicht abfragbar';
    feld.className = 'anStatus';
    return;
  }
  if (f.fehler) {
    feld.textContent = f.fehler;
    feld.className = 'anStatus fehler';
    return;
  }
  if (!f.gewuenscht) {
    feld.textContent = 'Abgeschaltet - vom Handy ist nichts erreichbar';
    feld.className = 'anStatus';
    return;
  }
  if (!f.adressen.length) {
    feld.textContent = 'Keine Netzwerkverbindung gefunden';
    feld.className = 'anStatus fehler';
    return;
  }

  const urls = f.adressen.map(a => 'http://' + a + ':' + f.port + '/einstellungen');
  feld.textContent = urls.join('   ');
  feld.className = 'anStatus aktiv';
  if (qr) qr.innerHTML = qrBild(urls[0]);
}

// Kleiner QR-Code zur ersten Adresse. Dieselbe Bibliothek wie auf der Anzeige.
function qrBild(text) {
  if (typeof qrcode !== 'function') return '';
  try {
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 3, margin: 1, scalable: true });
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Uhrzeit
// ---------------------------------------------------------------------------
// Am Raspberry Pi ist das die wichtigste Zeile im ganzen Fenster: ohne Abgleich
// aus dem Netz sind Timetable, Zeitfenster, Ruhezeit und die geplanten
// Durchsagen alle falsch, und zwar ohne dass es irgendwo auffaellt.
async function fillUhr() {
  const feld = $('uhrStatus');
  const hinweis = $('uhrHinweis');
  if (!feld) return;

  if (!window.api || !window.api.zeitStatus) { $('uhrKarte').style.display = 'none'; return; }

  let z = null;
  try { z = await window.api.zeitStatus(); } catch (err) { /* siehe unten */ }

  if (!z) {
    feld.textContent = 'Uhrzeit nicht abfragbar';
    feld.className = 'anStatus';
    hinweis.textContent = '';
    return;
  }

  if (!z.pruefbar) {
    feld.textContent = z.anzeige;
    feld.className = 'anStatus';
    hinweis.textContent = 'Dieses System haelt seine Uhr selbst in Ordnung und hat eine '
      + 'Hardware-Uhr. Hier gibt es nichts einzustellen.';
    return;
  }

  if (z.synchronisiert) {
    feld.textContent = z.anzeige + '  \u00b7  aus dem Netz abgeglichen';
    feld.className = 'anStatus aktiv';
    hinweis.textContent = 'Die Uhr wird laufend gegen einen Zeitserver gestellt. '
      + 'Timetable, Zeitfenster, Ruhezeit und geplante Durchsagen stimmen damit.';
    return;
  }

  feld.textContent = z.anzeige + '  \u00b7  NICHT abgeglichen';
  feld.className = 'anStatus fehler';
  hinweis.innerHTML = 'Der Zeitabgleich aus dem Netz ist bisher nicht durchgekommen. '
    + 'Ein Raspberry Pi hat keine batteriegepufferte Uhr \u2013 die angezeigte Zeit '
    + 'kann weit danebenliegen, obwohl sie plausibel aussieht. '
    + '<b>Timetable, Zeitfenster der Clips, Ruhezeit und geplante Durchsagen greifen '
    + 'dann zur falschen Stunde.</b><br>Meist fehlt schlicht der Weg ins Internet. '
    + 'Pr\u00fcfen mit <code>timedatectl status</code> auf dem Pi.';
}

// Das Tempo betrifft nur die Laufschrift - bei "steht fest" waere es ein Feld,
// das nichts tut.
function tempoZeigen(modusFeld, tempoFeld) {
  const box = tempoFeld && tempoFeld.closest('.field');
  if (box) box.style.visibility = modusFeld.value === 'lauf' ? '' : 'hidden';
}

// ---------------------------------------------------------------------------
// Geplante Durchsagen
// ---------------------------------------------------------------------------
function neuerPlan() {
  return { id: uid(), enabled: true, text: '', days: [5, 6],
           from: '01:40', to: '02:00', countdown: true,
           modus: 'fest', tempo: 'normal' };
}

function plaene() {
  state.announcement = state.announcement || {};
  if (!Array.isArray(state.announcement.plans)) state.announcement.plans = [];
  return state.announcement.plans;
}

function renderPlaene() {
  const box = $('planListe');
  if (!box) return;
  const liste = plaene();
  box.innerHTML = '';

  if (!liste.length) {
    const leer = document.createElement('div');
    leer.className = 'hint';
    leer.textContent = 'Noch keine geplante Durchsage. Der Balken erscheint dann nur, '
                     + 'wenn ihr ihn oben von Hand ausloest.';
    box.appendChild(leer);
  }

  liste.forEach((pl, i) => box.appendChild(planZeile(pl, i)));

  if (!$('planNeu').dataset.wired) {
    $('planNeu').dataset.wired = '1';
    $('planNeu').addEventListener('click', () => {
      plaene().push(neuerPlan());
      markDirty(); renderPlaene();
    });
    $('planVorlage').addEventListener('click', () => {
      plaene().push(Object.assign(neuerPlan(), {
        text: 'Letzte Runde \u2013 die Bar schlie\u00dft in {zeit}'
      }));
      markDirty(); renderPlaene();
    });
  }
}

function planZeile(pl, i) {
  const wrap = document.createElement('div');
  wrap.className = 'planRow' + (pl.enabled === false ? ' aus' : '');

  const tage = DAY_ORDER.map(d =>
    '<button data-day="' + d + '" class="' + ((pl.days || []).includes(d) ? 'on' : '') + '">'
    + DAY_NAMES[d] + '</button>').join('');

  wrap.innerHTML =
    '<div class="planKopf">'
      + '<label class="checkline"><input type="checkbox" data-f="enabled"'
        + (pl.enabled === false ? '' : ' checked') + '> <span>aktiv</span></label>'
      + '<span class="planStatus"></span>'
      + '<div class="spacer"></div>'
      + '<button class="icon" data-act="up" title="nach oben">&#9650;</button>'
      + '<button class="icon" data-act="down" title="nach unten">&#9660;</button>'
      + '<button class="danger icon" data-act="del" title="Durchsage entfernen">&times;</button>'
    + '</div>'
    + '<label class="field"><span>Text</span>'
      + '<textarea data-f="text" rows="2" maxlength="200" '
      + 'placeholder="z.B. Letzte Runde \u2013 die Bar schlie\u00dft in {zeit}">'
      + escapeHtml(pl.text || '') + '</textarea></label>'
    + '<div class="twoCol">'
      + '<label class="field"><span>Darstellung</span>'
        + '<select data-f="modus">'
        + '<option value="fest">steht fest</option>'
        + '<option value="lauf">l\u00e4uft von rechts nach links</option>'
        + '</select></label>'
      + '<label class="field"><span>Tempo der Laufschrift</span>'
        + '<select data-f="tempo">'
        + '<option value="langsam">langsam</option>'
        + '<option value="normal">normal</option>'
        + '<option value="schnell">schnell</option>'
        + '</select></label>'
    + '</div>'
    + '<div class="btnRow planWerkzeug">'
      + '<button data-act="zeit">{zeit} einf\u00fcgen</button>'
      + '<label class="checkline"><input type="checkbox" data-f="countdown"'
        + (pl.countdown === false ? '' : ' checked') + '> <span>Countdown mitlaufen lassen</span></label>'
    + '</div>'
    + '<div class="days">' + tage + '</div>'
    + '<div class="dayPresets">'
      + '<button data-preset="week">Mo-Fr</button>'
      + '<button data-preset="weekend">Fr-So</button>'
      + '<button data-preset="all">alle</button>'
    + '</div>'
    + '<div class="times">von <input type="time" data-f="from" value="' + escapeHtml(pl.from || '') + '">'
    + ' bis <input type="time" data-f="to" value="' + escapeHtml(pl.to || '') + '"></div>';

  const txt = wrap.querySelector('[data-f=text]');
  txt.addEventListener('input', () => { pl.text = txt.value; markDirty(); planStatusSetzen(wrap, pl); });

  const stil = durchsageStil(pl);
  const modusFeld = wrap.querySelector('[data-f=modus]');
  const tempoFeld = wrap.querySelector('[data-f=tempo]');
  modusFeld.value = stil.modus;
  tempoFeld.value = stil.tempo;
  tempoZeigen(modusFeld, tempoFeld);
  wrap.querySelectorAll('select[data-f]').forEach(sel => {
    sel.addEventListener('change', () => {
      pl[sel.dataset.f] = sel.value;
      tempoZeigen(modusFeld, tempoFeld);
      markDirty();
    });
  });

  wrap.querySelectorAll('input[type=time]').forEach(inp => {
    inp.addEventListener('input', () => {
      pl[inp.dataset.f] = inp.value; markDirty(); planStatusSetzen(wrap, pl);
    });
  });

  wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      pl[cb.dataset.f] = cb.checked;
      wrap.classList.toggle('aus', pl.enabled === false);
      markDirty(); planStatusSetzen(wrap, pl);
    });
  });

  wrap.querySelectorAll('.days button').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = parseInt(btn.dataset.day, 10);
      pl.days = pl.days || [];
      const k = pl.days.indexOf(d);
      if (k >= 0) pl.days.splice(k, 1); else pl.days.push(d);
      btn.classList.toggle('on', pl.days.includes(d));
      markDirty(); planStatusSetzen(wrap, pl);
    });
  });

  wrap.querySelectorAll('.dayPresets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.preset;
      pl.days = v === 'week' ? [1, 2, 3, 4, 5] : v === 'weekend' ? [5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
      markDirty(); renderPlaene();
    });
  });

  // Platzhalter dort einsetzen, wo der Cursor gerade steht
  wrap.querySelector('[data-act=zeit]').addEventListener('click', () => {
    const a = txt.selectionStart != null ? txt.selectionStart : txt.value.length;
    const b = txt.selectionEnd != null ? txt.selectionEnd : a;
    txt.value = txt.value.slice(0, a) + '{zeit}' + txt.value.slice(b);
    pl.text = txt.value;
    txt.focus();
    txt.setSelectionRange(a + 6, a + 6);
    markDirty(); planStatusSetzen(wrap, pl);
  });

  wrap.querySelector('[data-act=up]').addEventListener('click', () => planSchieben(i, -1));
  wrap.querySelector('[data-act=down]').addEventListener('click', () => planSchieben(i, 1));
  wrap.querySelector('[data-act=del]').addEventListener('click', () => {
    if (!confirm('Diese geplante Durchsage entfernen?')) return;
    plaene().splice(i, 1);
    markDirty(); renderPlaene();
  });

  planStatusSetzen(wrap, pl);
  return wrap;
}

function planSchieben(i, richtung) {
  const liste = plaene();
  const j = i + richtung;
  if (j < 0 || j >= liste.length) return;
  const tmp = liste[i]; liste[i] = liste[j]; liste[j] = tmp;
  markDirty(); renderPlaene();
}

// Klartext statt Raetselraten: laeuft der Plan gerade, und wie lange noch?
function planStatusSetzen(wrap, pl) {
  const el = wrap.querySelector('.planStatus');
  const jetzt = new Date();

  if (pl.enabled === false) { el.textContent = 'abgeschaltet'; el.className = 'planStatus aus'; return; }
  if (!pl.text) { el.textContent = 'ohne Text erscheint nichts'; el.className = 'planStatus warn'; return; }
  if (!(pl.days || []).length) { el.textContent = 'ohne Tag erscheint nichts'; el.className = 'planStatus warn'; return; }

  const ende = fensterEnde(pl, jetzt);
  if (pl.countdown !== false && !ende) {
    el.textContent = 'Zeitfenster unbrauchbar \u2013 kein Countdown';
    el.className = 'planStatus warn';
    return;
  }

  // Waehrend der Ruhezeit ist der Bildschirm schwarz - eine Durchsage darin
  // erscheint nie. Das sieht man dem Eintrag sonst nicht an.
  if (inRuhezeit(pl)) {
    el.textContent = describeWindows({ windows: [pl] }) + ' \u2013 liegt in der Ruhezeit';
    el.className = 'planStatus warn';
    return;
  }

  if (windowMatches(pl, jetzt)) {
    el.textContent = 'l\u00e4uft gerade' + (ende && pl.countdown !== false
      ? ' \u2013 noch ' + countdownText(ende.getTime() - jetzt.getTime()) : '');
    el.className = 'planStatus an';
  } else {
    el.textContent = describeWindows({ windows: [pl] });
    el.className = 'planStatus';
  }
}

// Faellt der Beginn der Durchsage in die Ruhezeit?
function inRuhezeit(pl) {
  const q = state.quiet || {};
  if (!q.enabled) return false;
  const m = String(pl.from || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const start = new Date();
  start.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return zeitImFenster(q.from, q.to, start);
}

// ---------------------------------------------------------------------------
// Ruhezeit
// ---------------------------------------------------------------------------
function fillRuhezeit() {
  state.quiet = state.quiet || {};
  const q = state.quiet;
  $('q_enabled').checked = !!q.enabled;
  $('q_from').value = q.from || '06:00';
  $('q_to').value = q.to || '14:00';

  if ($('q_enabled').dataset.wired) return;
  $('q_enabled').dataset.wired = '1';
  $('q_enabled').addEventListener('change', (e) => { state.quiet.enabled = e.target.checked; markDirty(); });
  for (const k of ['from', 'to']) {
    const el = $('q_' + k);
    el.addEventListener('input', () => { state.quiet[k] = el.value; markDirty(); });
  }
}

// ---------------------------------------------------------------------------
// Allgemein
// ---------------------------------------------------------------------------
function markDirty() {
  dirty = true;
  $('dirty').classList.remove('hidden');
}

// Nach dem Speichern oder Neuladen ist wieder alles beisammen.
function sauber() {
  dirty = false;
  fremdGeaendert = false;
  $('dirty').classList.add('hidden');
  $('fremd').classList.add('hidden');
}

// Gibt zurueck, ob wirklich gespeichert wurde.
async function save() {
  // Aufräumen vor dem Speichern
  state.timetable = (state.timetable || []).filter(e => e.act || e.date);
  state.prices = (state.prices || []).map(c => ({
    id: c.id, category: c.category,
    items: (c.items || []).filter(i => i.name || i.price)
  }));

  let antwort = await window.api.saveConfig(state);

  // Inzwischen hat jemand anders gespeichert - am Rechner, am Handy oder an
  // einem zweiten Handy. Ohne Rueckfrage wuerde hier dessen Arbeit verschwinden.
  if (antwort && antwort.konflikt) {
    const weiter = confirm(
      'Die Einstellungen wurden inzwischen woanders geändert – am Rechner oder ' +
      'von einem anderen Gerät.\n\n' +
      'OK: deine Eingaben speichern und die anderen Änderungen verwerfen.\n' +
      'Abbrechen: den neuen Stand laden; deine Eingaben hier gehen verloren.');
    if (!weiter) {
      state = antwort.aktuell;
      sauber();
      fillAll();
      updateBadges();
      toast('Neuer Stand geladen');
      return false;
    }
    // Bewusst ueberschreiben: auf den aktuellen Stand aufsetzen und nochmal hin.
    state.stand = antwort.aktuell && antwort.aktuell.stand;
    antwort = await window.api.saveConfig(state);
    if (antwort && antwort.konflikt) {
      toast('Speichern fehlgeschlagen - es wird gerade woanders geändert', true);
      return false;
    }
  }

  state = antwort;
  sauber();
  toast('Gespeichert - die Anzeige wurde aktualisiert');
  updateBadges();
  return true;
}

let toastTimer = null;
function toast(msg, isError) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function wireButtons() {
  $('saveBtn').addEventListener('click', save);

  $('addVideos').addEventListener('click', addVideos);
  $('openMedia').addEventListener('click', () => window.api.openMediaFolder());
  $('checkMedia').addEventListener('click', () => pruefeUndWandle(state.videos || [], false));

  window.api.onConvertProgress(({ prozent }) => {
    const t = $('toast');
    if (!t.classList.contains('hidden')) t.textContent = t.textContent.replace(/\s\d+ ?%$/, '') + ' ' + prozent + '%';
  });

  $('addAct').addEventListener('click', () => {
    state.timetable = state.timetable || [];
    const last = state.timetable[state.timetable.length - 1];
    state.timetable.push({
      id: uid(),
      date: last ? last.date : todayISO(),
      start: '', end: '', act: '', info: ''
    });
    markDirty();
    renderTimetable();
  });

  $('sortActs').addEventListener('click', () => {
    const withKey = (state.timetable || []).map(e => {
      const se = entryStartEnd(e);
      return { e, k: se ? se.start.getTime() : Number.MAX_SAFE_INTEGER };
    });
    withKey.sort((a, b) => a.k - b.k);
    state.timetable = withKey.map(x => x.e);
    markDirty();
    renderTimetable();
  });

  $('cleanActs').addEventListener('click', () => {
    const now = new Date();
    const before = (state.timetable || []).length;
    state.timetable = (state.timetable || []).filter(e => {
      const se = entryStartEnd(e);
      if (!se) return true;
      const end = se.end || new Date(se.start.getTime() + 3600000);
      return end >= now;
    });
    const removed = before - state.timetable.length;
    if (removed > 0) { markDirty(); renderTimetable(); toast(removed + ' vergangene Einträge entfernt'); }
    else toast('Nichts zu entfernen');
  });

  $('openPhotos').addEventListener('click', () => window.api.openPhotoFolder());

  $('logoPick').addEventListener('click', async () => {
    const f = await window.api.addLogo(toast);
    if (!f) return;
    const old = state.settings.logo;
    state.settings.logo = f;
    if (old && old !== 'none' && old !== f) window.api.removeLogo(old);
    markDirty();
    renderLogoPreview();
  });


  $('logoNone').addEventListener('click', () => {
    if (state.settings.logo === 'none') return;
    eigenesLogoWeg();
    state.settings.logo = 'none';
    markDirty();
    renderLogoPreview();
  });

  $('fontPick').addEventListener('click', async () => {
    const f = await window.api.addFont(toast);
    if (!f) return;
    const old = state.settings.fontFile;
    state.settings.fontFile = f;
    if (old && old !== f) window.api.removeFont(old);
    markDirty();
    renderFontState();
  });

  $('fontClear').addEventListener('click', () => {
    if (!state.settings.fontFile) return;
    window.api.removeFont(state.settings.fontFile);
    state.settings.fontFile = '';
    markDirty();
    renderFontState();
  });

  $('identifyDisplays').addEventListener('click', async () => {
    const n = await window.api.identifyDisplays();
    toast(n === 1 ? 'Es ist nur ein Bildschirm angeschlossen' : n + ' Bildschirme nummeriert');
  });

  $('paletteTarmac').addEventListener('click', () => applyPalette('tarmac'));
  $('paletteDark').addEventListener('click', () => applyPalette('dark'));

  $('ttExport').addEventListener('click', async () => {
    if (dirty) { toast('Bitte zuerst speichern', true); return; }
    const n = await window.api.exportTimetable();
    if (n) toast(n + ' Acts gesichert - inklusive Fotos');
  });

  $('ttImport').addEventListener('click', async () => {
    if (!confirm('Der aktuelle Timetable wird durch die Datei ersetzt. Fortfahren?')) return;
    const entries = await window.api.importTimetable();
    if (!entries) return;
    state.timetable = entries;
    markDirty();
    renderTimetable();
    toast(entries.length + ' Acts übernommen - noch speichern');
  });

  $('cleanPhotos').addEventListener('click', async () => {
    if (dirty) { toast('Bitte zuerst speichern', true); return; }
    if (!confirm('Alle Fotos löschen, die keinem Act mehr zugeordnet sind?')) return;
    const n = await window.api.cleanupPhotos();
    toast(n > 0 ? n + ' Foto(s) gelöscht' : 'Es gab nichts aufzuräumen');
  });

  $('addCat').addEventListener('click', () => {
    state.prices = state.prices || [];
    state.prices.push({ id: uid(), category: 'Neue Gruppe', items: [{ id: uid(), name: '', size: '', price: '' }] });
    markDirty();
    renderPrices();
  });

  $('backToPlayer').addEventListener('click', async () => {
    if (dirty && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem schließen?')) return;
    window.api.closeSettings();
  });

  $('quitApp').addEventListener('click', () => {
    if (confirm('Bar Display wirklich komplett beenden? Der Bildschirm bleibt dann schwarz.')) window.api.quit();
  });

  $('exportCfg').addEventListener('click', async () => {
    if (dirty && !(await save())) return;
    const ok = await window.api.exportConfig();
    if (ok) toast('Konfiguration gesichert');
  });

  $('importCfg').addEventListener('click', async () => {
    if (!confirm('Die aktuelle Konfiguration wird durch die Datei ersetzt. Fortfahren?')) return;
    const cfg = await window.api.importConfig();
    if (cfg) {
      state = cfg;
      sauber();
      fillSettingsFields();
      renderVideos(); renderTimetable(); renderPrices();
      toast('Konfiguration geladen');
    }
  });

  $('s_autostart').addEventListener('change', async (e) => {
    const result = await window.api.setAutostart(e.target.checked);
    e.target.checked = result;
    toast(result ? 'Autostart aktiviert' : 'Autostart deaktiviert');
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });
}

// ---------------------------------------------------------------------------
// Anzeige-/System-Felder
// ---------------------------------------------------------------------------
const NUM_FIELDS = ['timetableEvery', 'timetableDuration', 'pricesEvery', 'pricesDuration',
                    'timetableMaxNext', 'fadeMs', 'logoHeight', 'transitionMs', 'imageDuration'];
const TEXT_FIELDS = ['barName', 'subtitle', 'bgColor', 'accent', 'accent2', 'priceNote', 'pin',
                     'timetableTitle', 'timetableSubtitle', 'pricesTitle', 'pricesSubtitle',
                     'titleStyle', 'pattern', 'transition', 'rotation',
                     'qrUrl', 'qrLabel'];

function fillSettingsFields() {
  const s = state.settings;
  for (const k of NUM_FIELDS) { const el = $('s_' + k); if (el) el.value = s[k] != null ? s[k] : ''; }
  for (const k of TEXT_FIELDS) { const el = $('s_' + k); if (el) el.value = s[k] != null ? s[k] : ''; }
  $('s_showClock').checked = !!s.showClock;
  $('s_qrEnabled').checked = !!s.qrEnabled;
  $('s_sparmodus').checked = !!s.sparmodus;
  $('s_fernbedienung').checked = s.fernbedienung !== false;
  $('s_fernHinweis').checked = s.fernHinweis !== false;
  $('s_fernPort').value = Number(s.fernPort) || 8080;
  fillFern();
  qrFelderAnpassen();
  renderLogoAuswahl();
  renderLogoPreview();
  renderFontState();
  fillSpecialFields();

  for (const k of NUM_FIELDS) {
    const el = $('s_' + k);
    if (!el || el.dataset.wired) continue;
    el.dataset.wired = '1';
    el.addEventListener('input', () => {
      const v = parseInt(el.value, 10);
      state.settings[k] = isNaN(v) ? 0 : v;
      markDirty();
    });
  }
  for (const k of TEXT_FIELDS) {
    const el = $('s_' + k);
    if (!el || el.dataset.wired) continue;
    el.dataset.wired = '1';
    el.addEventListener('input', () => {
      let v = el.value;
      if (k === 'pin') v = v.replace(/\D/g, '');
      if (el.value !== v) el.value = v;
      state.settings[k] = v;
      markDirty();
    });
  }
  if (!$('s_showClock').dataset.wired) {
    $('s_showClock').dataset.wired = '1';
    $('s_showClock').addEventListener('change', (e) => { state.settings.showClock = e.target.checked; markDirty(); });
  }
  for (const [id, feld] of [['s_fernbedienung', 'fernbedienung'], ['s_fernHinweis', 'fernHinweis']]) {
    const el = $(id);
    if (el && !el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('change', (e) => {
        state.settings[feld] = e.target.checked;
        markDirty();
        if (feld === 'fernbedienung') fillFern();
      });
    }
  }
  if (!$('s_fernPort').dataset.wired) {
    $('s_fernPort').dataset.wired = '1';
    $('s_fernPort').addEventListener('input', () => {
      const n = parseInt($('s_fernPort').value, 10);
      state.settings.fernPort = (n >= 1024 && n <= 65535) ? n : 8080;
      markDirty();
    });
  }
  if (!$('s_sparmodus').dataset.wired) {
    $('s_sparmodus').dataset.wired = '1';
    $('s_sparmodus').addEventListener('change', (e) => {
      state.settings.sparmodus = e.target.checked;
      markDirty();
    });
  }
  if (!$('s_qrEnabled').dataset.wired) {
    $('s_qrEnabled').dataset.wired = '1';
    $('s_qrEnabled').addEventListener('change', (e) => {
      state.settings.qrEnabled = e.target.checked;
      qrFelderAnpassen();
      markDirty();
    });
  }
}

// Adresse und Beschriftung bleiben gespeichert, wenn der Code aus ist -
// sie werden nur ausgegraut, damit klar ist, dass gerade nichts erscheint.
function qrFelderAnpassen() {
  const box = $('qrFelder');
  if (box) box.classList.toggle('gedimmt', !$('s_qrEnabled').checked);
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------
// Chromium selbst entscheiden lassen, ob es die Datei abspielen kann
function testPlayable(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    let fertig = false;
    const ende = (ok) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(frist);
      v.onloadedmetadata = v.onerror = null;
      v.removeAttribute('src');
      v.load();
      resolve(ok);
    };
    const frist = setTimeout(() => ende(false), 10000);
    v.onloadedmetadata = () => ende(v.videoWidth > 0);
    v.onerror = () => ende(false);
    v.src = fileSrc(paths.mediaDir, file);
  });
}

// Nicht abspielbare Clips einsammeln und auf Wunsch nach MP4 umwandeln
async function pruefeUndWandle(eintraege, stillWennAllesOk) {
  // Am Handy ist diese Probe wertlos und war sogar irrefuehrend: getestet wurde
  // ueber eine file://-Adresse, die es im Browser des Handys gar nicht gibt -
  // jeder Clip fiel durch und wurde als "nicht abspielbar" gemeldet, obwohl er
  // auf der Anzeige einwandfrei lief. Ob ein Clip laeuft, entscheidet ohnehin
  // das Geraet mit dem Bildschirm. Beim Hochladen sagt der Dienst dazu schon
  // etwas: er schaut in die Datei und meldet den Codec zurueck.
  if (paths.mode === 'http') {
    if (!stillWennAllesOk) {
      toast('Prüfen und Umwandeln geht nur am Rechner mit der Anzeige', true);
    }
    return;
  }

  const clips = eintraege.filter(v => !isImageFile(v.file));
  if (!clips.length) {
    if (!stillWennAllesOk) toast('Keine Videos zum Prüfen');
    return;
  }

  toast(clips.length === 1 ? 'Clip wird geprüft…' : clips.length + ' Clips werden geprüft…');
  const kaputt = [];
  for (const v of clips) {
    if (!(await testPlayable(v.file))) kaputt.push(v);
  }

  if (!kaputt.length) {
    if (!stillWennAllesOk) toast('Alles spielbar – nichts zu tun');
    return;
  }

  if (!(await window.api.canConvert())) {
    toast(kaputt.length + ' Clip(s) nicht abspielbar, Umwandlung nicht verfügbar', true);
    return;
  }

  const namen = kaputt.map(v => v.title || v.file).join('\n');
  if (!confirm(kaputt.length + ' Clip(s) kann Windows nicht direkt abspielen:\n\n' + namen +
               '\n\nJetzt nach MP4 umwandeln? Das kann je nach Länge ein paar Minuten dauern.')) return;

  let ok = 0;
  let fehler = null;
  for (const v of kaputt) {
    toast('Wandle „' + (v.title || v.file) + '" um…');
    const res = await window.api.convertMedia(v.file);
    if (!res.ok) { fehler = (v.title || v.file) + ' – ' + res.fehler; break; }
    v.file = res.datei;
    ok++;
    markDirty();
    renderVideos();
  }

  // Die Umwandlung hat die Originaldatei bereits ersetzt. Wird jetzt nicht
  // gespeichert, zeigt die Konfiguration auf eine Datei, die es nicht mehr gibt -
  // deshalb hier ohne Nachfrage sichern.
  if (ok > 0) await save();

  if (fehler) toast('Fehlgeschlagen: ' + fehler, true);
  else toast(ok + ' Clip(s) umgewandelt und gespeichert');
}

async function addVideos() {
  const added = await window.api.addMedia(toast);
  if (!added.length) return;
  state.videos = state.videos || [];
  for (const a of added) {
    state.videos.push({
      id: uid(),
      file: a.file,
      title: a.original.replace(/\.[^.]+$/, ''),
      enabled: true,
      always: true,
      windows: []
    });
  }
  markDirty();
  renderVideos();
  toast(added.length + ' Beitrag/Beiträge hinzugefügt - nicht vergessen zu speichern');

  // gleich prüfen, ob die neuen Clips überhaupt laufen
  const neue = state.videos.slice(-added.length);
  await pruefeUndWandle(neue, true);
}

function renderVideos() {
  const list = $('videoList');
  list.innerHTML = '';
  const vids = state.videos || [];
  $('videoEmpty').classList.toggle('hidden', vids.length > 0);
  vids.forEach((v, i) => list.appendChild(videoCard(v, i)));
  updateBadges();
}

function videoCard(v, i) {
  const wrap = document.createElement('div');
  wrap.className = 'vCard' + (v.enabled === false ? ' off' : '');

  wrap.innerHTML =
    '<div class="vTop">' +
      '<div class="vOrder">' +
        '<button class="icon" data-act="up" title="nach oben">&#9650;</button>' +
        '<button class="icon" data-act="down" title="nach unten">&#9660;</button>' +
      '</div>' +
      '<label class="checkline" style="margin:0"><input type="checkbox" data-act="enabled"' +
        (v.enabled === false ? '' : ' checked') + '></label>' +
      '<div class="vName">' +
        '<input type="text" data-act="title" value="' + escapeHtml(v.title || '') + '" placeholder="Bezeichnung">' +
        '<div class="vFile">' + escapeHtml(v.file) + (isImageFile(v.file) ? ' &middot; Bild' : '') + '</div>' +
      '</div>' +
      (isImageFile(v.file)
        ? '<label class="vDur">Standzeit <input type="number" min="2" max="300" data-act="dur" value="' +
          escapeHtml(v.duration || '') + '" placeholder="' + (state.settings.imageDuration || 12) + '"> s</label>'
        : '') +
      '<span class="badge" data-badge></span>' +
      '<button class="danger" data-act="del">L&ouml;schen</button>' +
    '</div>' +
    '<div class="vModes">' +
      '<label><input type="radio" name="mode_' + v.id + '" data-act="always"' + (v.always ? ' checked' : '') + '> immer laufen lassen</label>' +
      '<label><input type="radio" name="mode_' + v.id + '" data-act="scheduled"' + (v.always ? '' : ' checked') + '> nur zu bestimmten Zeiten</label>' +
    '</div>' +
    '<div class="winList" data-wins></div>';

  const winBox = wrap.querySelector('[data-wins]');
  renderWindows(winBox, v);

  wrap.querySelector('[data-act=up]').addEventListener('click', () => moveVideo(i, -1));
  wrap.querySelector('[data-act=down]').addEventListener('click', () => moveVideo(i, 1));

  wrap.querySelector('[data-act=enabled]').addEventListener('change', (e) => {
    v.enabled = e.target.checked;
    wrap.classList.toggle('off', !e.target.checked);
    markDirty(); updateBadges();
  });

  wrap.querySelector('[data-act=title]').addEventListener('input', (e) => {
    v.title = e.target.value; markDirty();
  });

  const dur = wrap.querySelector('[data-act=dur]');
  if (dur) dur.addEventListener('input', () => {
    const n = parseInt(dur.value, 10);
    v.duration = isNaN(n) ? '' : n;      // leer = globale Standzeit
    markDirty();
  });

  wrap.querySelector('[data-act=always]').addEventListener('change', () => {
    v.always = true; markDirty(); renderWindows(winBox, v); updateBadges();
  });
  wrap.querySelector('[data-act=scheduled]').addEventListener('change', () => {
    v.always = false;
    if (!v.windows || !v.windows.length) v.windows = [newWindow()];
    markDirty(); renderWindows(winBox, v); updateBadges();
  });

  wrap.querySelector('[data-act=del]').addEventListener('click', async () => {
    if (!confirm('"' + (v.title || v.file) + '" aus der Schleife entfernen?\n\nDie Datei wird dabei auch aus dem Medien-Ordner gelöscht.')) return;
    await window.api.deleteMedia(v.file);
    state.videos.splice(i, 1);
    markDirty();
    renderVideos();
  });

  wrap.dataset.vid = v.id;
  return wrap;
}

function newWindow() {
  return { days: [5], from: '16:00', to: '22:00' };
}

function renderWindows(box, v) {
  box.innerHTML = '';
  if (v.always) {
    box.innerHTML = '<div class="hint">Dieser Clip läuft in jeder Runde mit, unabhängig von Tag und Uhrzeit.</div>';
    return;
  }
  const wins = v.windows = v.windows || [];
  wins.forEach((w, wi) => box.appendChild(windowRow(v, w, wi, box)));

  const add = document.createElement('button');
  add.textContent = '+ Zeitfenster';
  add.style.alignSelf = 'flex-start';
  add.addEventListener('click', () => {
    wins.push(newWindow());
    markDirty();
    renderWindows(box, v);
    updateBadges();
  });
  box.appendChild(add);

  if (!wins.length) {
    const warn = document.createElement('div');
    warn.className = 'hint';
    warn.style.color = 'var(--danger)';
    warn.textContent = 'Ohne Zeitfenster läuft dieser Clip nie.';
    box.appendChild(warn);
  }
}

function windowRow(v, w, wi, box) {
  const row = document.createElement('div');
  row.className = 'winRow';

  const days = DAY_ORDER.map(d =>
    '<button data-day="' + d + '" class="' + ((w.days || []).includes(d) ? 'on' : '') + '">' + DAY_NAMES[d] + '</button>'
  ).join('');

  row.innerHTML =
    '<div class="days">' + days + '</div>' +
    '<div class="dayPresets">' +
      '<button data-preset="week">Mo-Fr</button>' +
      '<button data-preset="weekend">Fr-So</button>' +
      '<button data-preset="all">alle</button>' +
    '</div>' +
    '<div class="times">von <input type="time" data-f="from" value="' + escapeHtml(w.from || '') + '">' +
    ' bis <input type="time" data-f="to" value="' + escapeHtml(w.to || '') + '"></div>' +
    '<div class="spacer"></div>' +
    '<button class="danger icon" data-act="delwin" title="Zeitfenster entfernen">&times;</button>';

  row.querySelectorAll('.days button').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = parseInt(btn.dataset.day, 10);
      w.days = w.days || [];
      const idx = w.days.indexOf(d);
      if (idx >= 0) w.days.splice(idx, 1); else w.days.push(d);
      btn.classList.toggle('on', w.days.includes(d));
      markDirty(); updateBadges();
    });
  });

  row.querySelectorAll('.dayPresets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      w.days = p === 'week' ? [1, 2, 3, 4, 5] : p === 'weekend' ? [5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
      markDirty();
      renderWindows(box, v);
      updateBadges();
    });
  });

  row.querySelectorAll('input[type=time]').forEach(inp => {
    inp.addEventListener('input', () => {
      w[inp.dataset.f] = inp.value;
      markDirty(); updateBadges();
    });
  });

  row.querySelector('[data-act=delwin]').addEventListener('click', () => {
    v.windows.splice(wi, 1);
    markDirty();
    renderWindows(box, v);
    updateBadges();
  });

  return row;
}

function moveVideo(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.videos.length) return;
  const tmp = state.videos[i];
  state.videos[i] = state.videos[j];
  state.videos[j] = tmp;
  markDirty();
  renderVideos();
}

function updateBadges() {
  const now = new Date();
  document.querySelectorAll('.vCard').forEach(card => {
    const v = (state.videos || []).find(x => x.id === card.dataset.vid);
    if (!v) return;
    const b = card.querySelector('[data-badge]');
    if (v.enabled === false) {
      b.className = 'badge idle'; b.textContent = 'deaktiviert';
    } else if (!v.always && (!v.windows || !v.windows.length)) {
      b.className = 'badge warn'; b.textContent = 'kein Zeitfenster';
    } else if (isVideoActive(v, now)) {
      b.className = 'badge live'; b.textContent = 'läuft gerade';
    } else {
      b.className = 'badge idle'; b.textContent = 'pausiert (' + describeWindows(v) + ')';
    }
  });
}

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------
function renderTimetable() {
  const body = $('ttBody');
  body.innerHTML = '';
  const rows = state.timetable || [];
  $('ttEmpty').classList.toggle('hidden', rows.length > 0);
  rows.forEach((e, i) => body.appendChild(ttRow(e, i)));
  markTimetableRows();
}

function ttRow(e, i) {
  const tr = document.createElement('tr');
  tr.dataset.eid = e.id || (e.id = uid());
  tr.innerHTML =
    // data-titel wird auf schmalen Bildschirmen als Beschriftung eingeblendet,
    // weil die Tabelle dort als Blöcke statt als Spalten dargestellt wird
    '<td data-titel="Datum"><input type="date" data-f="date" value="' + escapeHtml(e.date || '') + '"></td>' +
    '<td data-titel="Von"><input type="time" data-f="start" value="' + escapeHtml(e.start || '') + '"></td>' +
    '<td data-titel="Bis"><input type="time" data-f="end" value="' + escapeHtml(e.end || '') + '"></td>' +
    '<td data-titel="Act"><input type="text" data-f="act" value="' + escapeHtml(e.act || '') + '" placeholder="Name des Acts"></td>' +
    '<td data-titel="Zusatz"><input type="text" data-f="info" value="' + escapeHtml(e.info || '') + '" placeholder="z.B. Live / DJ-Set"></td>' +
    '<td class="photoCell" data-titel="Foto"></td>' +
    '<td><button class="danger icon" data-act="del">&times;</button></td>';

  renderPhotoCell(tr.querySelector('.photoCell'), e);

  tr.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      e[inp.dataset.f] = inp.value;
      markDirty();
      markTimetableRows();
    });
  });
  tr.querySelector('[data-act=del]').addEventListener('click', () => {
    state.timetable.splice(i, 1);
    markDirty();
    renderTimetable();
  });
  return tr;
}

// Adresse eines Bildes im Medien-, Foto- oder Logo-Ordner.
//
// Am Rechner liegt das als Pfad auf der Platte vor und wird ueber file://
// eingebunden. Am Handy laeuft diese Seite im Browser: dort liefert der Dienst
// Pfade wie "/photos", und eine file://-Adresse wuerde der Browser blockieren -
// die Vorschau blieb schlicht leer. Genau derselbe Fall wie in player.js.
function fileSrc(dir, file) {
  const p = String(dir).replace(/\\/g, '/').replace(/\/$/, '');
  if (paths.mode === 'http') return p + '/' + encodeURIComponent(file);
  return 'file:///' + encodeURI(p + '/' + file).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// Spezialshot: eigener Block in der Konfiguration, deshalb eigene Verdrahtung
const SPECIAL_TEXT = ['label', 'name', 'size', 'price', 'text'];

function fillSpecialFields() {
  state.special = state.special || {};
  const sp = state.special;

  $('sp_enabled').checked = !!sp.enabled;
  for (const k of SPECIAL_TEXT) {
    const el = $('sp_' + k);
    if (el) el.value = sp[k] != null ? sp[k] : '';
  }

  if (!$('sp_enabled').dataset.wired) {
    $('sp_enabled').dataset.wired = '1';
    $('sp_enabled').addEventListener('change', (e) => {
      state.special.enabled = e.target.checked;
      markDirty();
    });
  }
  for (const k of SPECIAL_TEXT) {
    const el = $('sp_' + k);
    if (!el || el.dataset.wired) continue;
    el.dataset.wired = '1';
    el.addEventListener('input', () => {
      state.special[k] = el.value;
      markDirty();
    });
  }
}

function renderLogoPreview() {
  const box = $('logoPreview');
  const f = state.settings.logo;
  if (f === 'none') {
    box.textContent = 'kein Logo - nur der Bar-Name';
    return;
  }
  const mit = mitgeliefertesLogo(f);
  if (mit) {
    const eintrag = MITGELIEFERTE_LOGOS.find(l => l.wert === (f || ''));
    box.innerHTML = '<img src="' + mit + '" alt="">' +
      '<span class="logoTag">mitgeliefert: ' +
      escapeHtml(eintrag ? eintrag.name : 'Logo') + '</span>';
  } else {
    box.innerHTML = '<img src="' + fileSrc(paths.brandDir, f) + '" alt="">';
  }

  // Die Auswahl unter der Vorschau mitziehen
  document.querySelectorAll('#logoAuswahl button').forEach(b => {
    b.classList.toggle('gewaehlt', b.dataset.wert === (f || ''));
  });
}

// Wechselt die Bar auf ein anderes Logo, wird ihre eigene Datei nicht mehr
// gebraucht. Mitgelieferte Logos liegen in src/branding und gehoeren nicht ihr -
// die duerfen auf keinen Fall geloescht werden.
function eigenesLogoWeg() {
  const alt = state.settings.logo;
  if (alt && alt !== 'none' && !mitgeliefertesLogo(alt)) window.api.removeLogo(alt);
}

// Knopfreihe fuer die mitgelieferten Logos, aus der gemeinsamen Liste gebaut
function renderLogoAuswahl() {
  const box = $('logoAuswahl');
  if (!box || box.dataset.wired) return;
  box.dataset.wired = '1';
  box.innerHTML = MITGELIEFERTE_LOGOS.map(l =>
    '<button data-wert="' + escapeHtml(l.wert) + '" data-hoehe="' + l.hoehe + '">' +
    '<img src="branding/' + escapeHtml(l.datei) + '" alt="">' +
    '<span>' + escapeHtml(l.name) + '</span></button>').join('');

  box.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      // Ein zuvor hochgeladenes eigenes Logo wird dabei aufgeraeumt
      eigenesLogoWeg();
      state.settings.logo = b.dataset.wert;
      // Eine breite Wortmarke braucht eine andere Hoehe als ein kompaktes
      // Zeichen - sonst laeuft sie in die Breitenbremse und wirkt winzig.
      state.settings.logoHeight = Number(b.dataset.hoehe);
      const feld = $('s_logoHeight');
      if (feld) feld.value = state.settings.logoHeight;
      markDirty();
      renderLogoPreview();
    });
  });
}

// Ohne waehlbare Bildschirme ist die Karte nur Ballast.
function bildschirmKarteAnpassen() {
  const sel = $('s_displayId');
  const karte = sel && sel.closest('.card');
  if (!karte) return;
  const leer = sel.options.length === 0;
  karte.style.display = leer ? 'none' : '';
}

async function renderDisplays() {
  const sel = $('s_displayId');
  let liste = [];
  try { liste = await window.api.listDisplays(); } catch (e) { /* dann eben keine */ }
  if (!liste.length) { bildschirmKarteAnpassen(); return; }
  sel.innerHTML = liste.map(d =>
    '<option value="' + d.id + '">Bildschirm ' + d.nummer + ' – ' + d.breite + '×' + d.hoehe +
    (d.primary ? ' (Hauptbildschirm)' : '') + '</option>').join('');
  // gespeicherter Monitor kann abgezogen sein - dann steht der tatsächlich genutzte drin
  const gespeichert = state.settings.displayId;
  sel.value = liste.some(d => d.id === gespeichert) ? gespeichert : (liste.find(d => d.aktiv) || liste[0]).id;

  if (!sel.dataset.wired) {
    sel.dataset.wired = '1';
    sel.addEventListener('change', () => {
      state.settings.displayId = sel.value;
      markDirty();
    });
  }
}

function renderFontState() {
  $('fontState').textContent = 'Schriftart: ' + (state.settings.fontFile || 'Standard (Josefin Sans)');
}

const PALETTES = {
  tarmac: { bgColor: '#450b6f', accent: '#74ff40', accent2: '#f04e23' },
  dark:   { bgColor: '#12141a', accent: '#e8ecf1', accent2: '#ff8a1f' }
};

function applyPalette(name) {
  Object.assign(state.settings, PALETTES[name]);
  markDirty();
  fillSettingsFields();
}

function photoSrc(file) { return fileSrc(paths.photoDir, file); }

function renderPhotoCell(td, e) {
  if (e.photo) {
    // Die Vorschau zeigt denselben Ausschnitt wie die Anzeige - sonst wundert
    // man sich hinterher, warum der Kopf abgeschnitten ist.
    td.innerHTML =
      '<div class="photoWrap">' +
        '<div class="photoBox"><img src="' + photoSrc(e.photo) + '" alt="" ' +
          'title="Anderes Foto wählen" style="' + fotoStil(e) + '"></div>' +
        '<button class="photoDel" title="Foto entfernen">&times;</button>' +
        '<button class="photoCrop" title="Ausschnitt wählen">&#9635;</button>' +
      '</div>';
    td.querySelector('img').addEventListener('click', () => pickPhoto(td, e));
    td.querySelector('.photoDel').addEventListener('click', () => {
      e.photo = '';
      delete e.crop;
      markDirty();
      renderPhotoCell(td, e);
    });
    td.querySelector('.photoCrop').addEventListener('click', () => ausschnittWaehlen(td, e));
  } else {
    td.innerHTML = '<button class="photoAdd">+ Foto</button>';
    td.querySelector('.photoAdd').addEventListener('click', () => pickPhoto(td, e));
  }
}

// ---------------------------------------------------------------------------
// Ausschnitt wählen
// ---------------------------------------------------------------------------
// Die Anzeige beschneidet Act-Fotos quadratisch. Bei einem Hochformat trifft
// die Mitte gern den Bauch statt des Gesichts - hier lässt sich der Ausschnitt
// vorher zurechtziehen. Das Fenster zeigt exakt dieselbe Form und denselben
// Stil wie später auf dem Bildschirm.
function ausschnittWaehlen(td, e) {
  const stand = fotoAusschnitt(e);
  let x = stand.x, y = stand.y, z = stand.z;

  const schirm = document.createElement('div');
  schirm.className = 'cropSchirm';
  schirm.innerHTML =
    '<div class="cropKasten">' +
      '<h2>Ausschnitt für „' + escapeHtml(e.act || 'diesen Act') + '"</h2>' +
      '<p class="hint">Bild verschieben, bis der richtige Teil im Fenster steht. ' +
         'So sieht es später auf der Anzeige aus.</p>' +
      '<div class="cropBuehne"><img alt=""></div>' +
      '<label class="field"><span>Vergrößern</span>' +
        '<input type="range" id="cropZoom" min="100" max="400" step="5"></label>' +
      '<div class="btnRow">' +
        '<button class="primary" data-act="ok">Übernehmen</button>' +
        '<button data-act="mitte">Zurücksetzen</button>' +
        '<div class="spacer"></div>' +
        '<button data-act="weg">Abbrechen</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(schirm);

  const bild = schirm.querySelector('.cropBuehne img');
  const buehne = schirm.querySelector('.cropBuehne');
  const regler = schirm.querySelector('#cropZoom');
  bild.src = photoSrc(e.photo);
  regler.value = Math.round(z * 100);

  const zeigen = () => {
    bild.setAttribute('style', fotoStil({ crop: { x, y, z } }));
  };
  zeigen();

  // Ziehen: die Bewegung wird auf die Fenstergröße bezogen und durch den Zoom
  // geteilt, damit sich das Bild bei starker Vergrößerung feiner schieben lässt.
  let zieht = false, vonX = 0, vonY = 0, startX = 0, startY = 0;
  const start = (ev) => {
    zieht = true;
    const p = ev.touches ? ev.touches[0] : ev;
    vonX = p.clientX; vonY = p.clientY; startX = x; startY = y;
    ev.preventDefault();
  };
  const zieh = (ev) => {
    if (!zieht) return;
    const p = ev.touches ? ev.touches[0] : ev;
    const kasten = buehne.getBoundingClientRect();
    x = Math.min(100, Math.max(0, startX - (p.clientX - vonX) / kasten.width * 100 / z));
    y = Math.min(100, Math.max(0, startY - (p.clientY - vonY) / kasten.height * 100 / z));
    zeigen();
    ev.preventDefault();
  };
  const halt = () => { zieht = false; };

  buehne.addEventListener('mousedown', start);
  window.addEventListener('mousemove', zieh);
  window.addEventListener('mouseup', halt);
  buehne.addEventListener('touchstart', start, { passive: false });
  buehne.addEventListener('touchmove', zieh, { passive: false });
  buehne.addEventListener('touchend', halt);

  regler.addEventListener('input', () => { z = Number(regler.value) / 100; zeigen(); });

  const schliessen = () => {
    window.removeEventListener('mousemove', zieh);
    window.removeEventListener('mouseup', halt);
    schirm.remove();
  };

  schirm.querySelector('[data-act=mitte]').addEventListener('click', () => {
    x = 50; y = 50; z = 1; regler.value = 100; zeigen();
  });
  schirm.querySelector('[data-act=weg]').addEventListener('click', schliessen);
  schirm.addEventListener('click', (ev) => { if (ev.target === schirm) schliessen(); });

  schirm.querySelector('[data-act=ok]').addEventListener('click', () => {
    const neu = fotoAusschnitt({ crop: { x, y, z } });
    // Der Standard wird nicht gespeichert - so bleibt die Konfiguration sauber
    // und alte Einträge sehen aus wie eh und je.
    if (ausschnittIstStandard(neu)) delete e.crop; else e.crop = neu;
    markDirty();
    renderPhotoCell(td, e);
    schliessen();
  });
}

async function pickPhoto(td, e) {
  const file = await window.api.addPhoto(toast);
  if (!file) return;
  e.photo = file;
  markDirty();
  renderPhotoCell(td, e);
}

function markTimetableRows() {
  const now = new Date();
  document.querySelectorAll('#ttBody tr').forEach(tr => {
    const e = (state.timetable || []).find(x => x.id === tr.dataset.eid);
    tr.classList.remove('past', 'now');
    if (!e) return;
    const se = entryStartEnd(e);
    if (!se) return;
    const end = se.end || new Date(se.start.getTime() + 3600000);
    if (se.start <= now && now < end) tr.classList.add('now');
    else if (end < now) tr.classList.add('past');
  });
}

// ---------------------------------------------------------------------------
// Preise
// ---------------------------------------------------------------------------
function renderPrices() {
  const list = $('priceList');
  list.innerHTML = '';
  const cats = state.prices || [];
  $('priceEmpty').classList.toggle('hidden', cats.length > 0);
  cats.forEach((c, i) => list.appendChild(catCard(c, i)));
}

function catCard(c, ci) {
  const card = document.createElement('div');
  card.className = 'catCard';
  card.innerHTML =
    '<div class="catTop">' +
      '<input type="text" data-f="category" value="' + escapeHtml(c.category || '') + '" placeholder="Gruppenname">' +
      '<div class="spacer"></div>' +
      '<button class="icon" data-act="up" title="nach oben">&#9650;</button>' +
      '<button class="icon" data-act="down" title="nach unten">&#9660;</button>' +
      '<button class="danger" data-act="delcat">Gruppe l&ouml;schen</button>' +
    '</div>' +
    '<div data-items></div>' +
    '<button data-act="additem" style="margin-top:0.5rem">+ Getr&auml;nk</button>';

  card.querySelector('[data-f=category]').addEventListener('input', (ev) => {
    c.category = ev.target.value; markDirty();
  });
  card.querySelector('[data-act=up]').addEventListener('click', () => moveCat(ci, -1));
  card.querySelector('[data-act=down]').addEventListener('click', () => moveCat(ci, 1));
  card.querySelector('[data-act=delcat]').addEventListener('click', () => {
    if (!confirm('Gruppe "' + (c.category || '') + '" mit allen Getränken löschen?')) return;
    state.prices.splice(ci, 1); markDirty(); renderPrices();
  });

  const itemsBox = card.querySelector('[data-items]');
  c.items = c.items || [];
  c.items.forEach((it, ii) => itemsBox.appendChild(itemRow(c, it, ii)));

  card.querySelector('[data-act=additem]').addEventListener('click', () => {
    c.items.push({ id: uid(), name: '', size: '', price: '' });
    markDirty(); renderPrices();
  });

  return card;
}

function itemRow(c, it, ii) {
  const row = document.createElement('div');
  row.className = 'itemRow';
  row.innerHTML =
    '<input class="iName" type="text" data-f="name" value="' + escapeHtml(it.name || '') + '" placeholder="Getränk">' +
    '<input class="iSize" type="text" data-f="size" value="' + escapeHtml(it.size || '') + '" placeholder="0,3 l">' +
    '<input class="iPrice" type="text" data-f="price" value="' + escapeHtml(it.price || '') + '" placeholder="3,50 &euro;">' +
    '<button class="danger icon" data-act="delitem">&times;</button>';

  row.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => { it[inp.dataset.f] = inp.value; markDirty(); });
  });
  row.querySelector('[data-act=delitem]').addEventListener('click', () => {
    c.items.splice(ii, 1); markDirty(); renderPrices();
  });
  return row;
}

function moveCat(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.prices.length) return;
  const tmp = state.prices[i];
  state.prices[i] = state.prices[j];
  state.prices[j] = tmp;
  markDirty();
  renderPrices();
}
