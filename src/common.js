'use strict';

// Gemeinsame Logik fuer Player und Einstellungen.
// Wird in beiden Fenstern als klassisches <script> geladen.

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_NAMES_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Standbilder laufen in derselben Schleife wie Videos mit
const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
function isImageFile(file) { return IMAGE_RE.test(String(file || '')); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// "16:30" -> 990
function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function minutesToHHMM(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

// Uhrzeit-Fenster ohne Wochentage, z.B. fuer Ruhezeiten. Ueber Mitternacht
// hinweg funktioniert es wie bei den Clips: 22:00-06:00 ist eine Nacht.
function zeitImFenster(von, bis, jetzt) {
  const a = toMinutes(von);
  const b = toMinutes(bis);
  if (a === null || b === null || a === b) return false;
  const t = jetzt.getHours() * 60 + jetzt.getMinutes();
  return a < b ? (t >= a && t < b) : (t >= a || t < b);
}

// ---------------------------------------------------------------------------
// Zeitfenster eines Videos
// ---------------------------------------------------------------------------
function windowMatches(win, now) {
  const days = Array.isArray(win.days) ? win.days : [];
  if (days.length === 0) return false;
  const from = toMinutes(win.from);
  const to = toMinutes(win.to);
  if (from === null || to === null) return false;

  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  const t = now.getHours() * 60 + now.getMinutes();

  if (from === to) {
    // ganzer Tag
    return days.includes(today);
  }
  if (from < to) {
    return days.includes(today) && t >= from && t < to;
  }
  // ueber Mitternacht, z.B. 22:00 - 02:00
  return (days.includes(today) && t >= from) || (days.includes(yesterday) && t < to);
}

function isVideoActive(video, now) {
  if (!video || video.enabled === false) return false;
  if (video.always) return true;
  const wins = Array.isArray(video.windows) ? video.windows : [];
  if (wins.length === 0) return false;
  return wins.some(w => windowMatches(w, now));
}

function describeWindows(video) {
  if (video.always) return 'immer';
  const wins = Array.isArray(video.windows) ? video.windows : [];
  if (!wins.length) return 'kein Zeitfenster - läuft nie';
  return wins.map(w => {
    const days = (w.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const dayTxt = days.length === 7 ? 'täglich' : days.map(d => DAY_NAMES[d]).join('+');
    return dayTxt + ' ' + (w.from || '??:??') + '-' + (w.to || '??:??');
  }).join(' / ');
}

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------
function entryStartEnd(entry) {
  if (!entry || !entry.date) return null;
  const dm = entry.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const sMin = toMinutes(entry.start);
  if (sMin === null) return null;
  const y = +dm[1], mo = +dm[2] - 1, d = +dm[3];
  const start = new Date(y, mo, d, Math.floor(sMin / 60), sMin % 60, 0, 0);
  let end = null;
  const eMin = toMinutes(entry.end);
  if (eMin !== null) {
    end = new Date(y, mo, d, Math.floor(eMin / 60), eMin % 60, 0, 0);
    if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000); // ueber Mitternacht
  }
  return { start, end };
}

function sortedTimetable(entries) {
  return (entries || [])
    .map(e => ({ entry: e, se: entryStartEnd(e) }))
    .filter(x => x.se)
    .sort((a, b) => a.se.start - b.se.start);
}

function timetableView(entries, now, maxNext) {
  const list = sortedTimetable(entries);
  let current = null;
  const next = [];
  for (const x of list) {
    const end = x.se.end || new Date(x.se.start.getTime() + 60 * 60 * 1000);
    if (x.se.start <= now && now < end) {
      if (!current) current = x;
    } else if (x.se.start > now) {
      next.push(x);
    }
  }
  return { current, next: next.slice(0, Math.max(1, maxNext || 5)), total: list.length };
}

function dayLabel(date, now) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'HEUTE';
  if (diff === 1) return 'MORGEN';
  return DAY_NAMES_LONG[date.getDay()].toUpperCase() + ' ' + pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.';
}

function timeLabel(date) {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function todayISO(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Durchsagen
// ---------------------------------------------------------------------------
// Der Countdown zaehlt auf das Ende des Anzeigefensters. Weil ein Fenster ueber
// Mitternacht laufen darf, reicht die Uhrzeit allein nicht - hier wird daraus
// ein echter Zeitpunkt gemacht.
function fensterEnde(win, now) {
  const von = toMinutes(win && win.from);
  const bis = toMinutes(win && win.to);
  if (von === null || bis === null || von === bis) return null;

  const ende = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                        Math.floor(bis / 60), bis % 60, 0, 0);
  // Fenster ueber Mitternacht: liegt das Ende hinter uns, gehoert es zu morgen.
  if (von > bis && ende.getTime() <= now.getTime()) ende.setDate(ende.getDate() + 1);
  return ende;
}

// Restzeit als "12:34" bzw. "1:05:00". Fuehrende Nullen bei den Minuten nur
// dann, wenn Stunden davor stehen - "05:03" liest sich auf dem Balken schlecht.
function countdownText(ms) {
  let sek = Math.max(0, Math.ceil(ms / 1000));
  const std = Math.floor(sek / 3600); sek -= std * 3600;
  const min = Math.floor(sek / 60);   sek -= min * 60;
  if (std > 0) return std + ':' + pad2(min) + ':' + pad2(sek);
  return pad2(min) + ':' + pad2(sek);
}

// Was soll gerade auf dem Balken stehen? Die von Hand ausgeloeste Durchsage hat
// Vorrang - wer jetzt etwas eintippt, meint es dringender als den Wochenplan.
// Danach gilt der erste passende Plan in Listenreihenfolge.
function aktiveDurchsage(cfg, now) {
  const a = (cfg && cfg.announcement) || {};

  if (a.enabled && a.text) {
    let offen = true;
    if (a.until) {
      const ende = new Date(a.until);
      if (!isNaN(ende) && now.getTime() >= ende.getTime()) offen = false;
    }
    if (offen) {
      return Object.assign({ text: a.text, ende: null, quelle: 'sofort' },
                           durchsageStil(a));
    }
  }

  for (const p of (a.plans || [])) {
    if (!p || p.enabled === false || !p.text) continue;
    if (!windowMatches(p, now)) continue;
    return Object.assign({
      text: p.text,
      ende: p.countdown === false ? null : fensterEnde(p, now),
      quelle: 'plan',
      id: p.id
    }, durchsageStil(p));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Darstellung einer Durchsage
// ---------------------------------------------------------------------------
// 'fest' steht einfach da - kurz, laut, fertig. 'lauf' zieht den Text von
// rechts nach links durch wie die Laufschrift bei einem Nachrichtensender;
// damit passt auch ein laengerer Satz auf den Balken.
//
// Das Tempo steht in Bildschirmbreiten pro Sekunde, nicht in Pixeln: sonst
// liefe dieselbe Einstellung auf einem grossen Fernseher gemuetlich und auf
// einem kleinen Bildschirm hektisch.
const LAUF_TEMPO = { langsam: 5, normal: 9, schnell: 15 };

function durchsageStil(quelle) {
  const q = quelle || {};
  const modus = q.modus === 'lauf' ? 'lauf' : 'fest';
  const tempo = LAUF_TEMPO[q.tempo] ? q.tempo : 'normal';
  return { modus, tempo };
}

// Wie lange braucht ein Durchlauf? strecke ist der Weg, den der Text
// zuruecklegt - von rechts ausserhalb des Bildes bis links wieder hinaus, also
// Fensterbreite plus Textbreite. Dadurch bleibt die Geschwindigkeit gleich,
// statt dass ein langer Text schneller durchhuscht.
function laufDauer(breitePx, fensterPx, tempo) {
  const proSekunde = LAUF_TEMPO[tempo] || LAUF_TEMPO.normal;
  if (!breitePx || !fensterPx) return 12;
  const inBreiten = breitePx / fensterPx * 100;
  return Math.max(4, Math.round(inBreiten / proSekunde * 10) / 10);
}

// Platzhalter im Text durch die Restzeit ersetzen. Steht kein Platzhalter drin,
// haengt die Zeit hinten dran - sonst tippt jemand den Text ohne {zeit} und
// wundert sich, warum nichts zaehlt.
function durchsageTeile(text, hatZeit) {
  const roh = String(text == null ? '' : text);
  if (!hatZeit) {
    return [{ text: roh.replace(/\{zeit\}/gi, '').replace(/\s{2,}/g, ' ').trim() }];
  }
  const stuecke = roh.split(/\{zeit\}/gi);
  // Kein Platzhalter im Text: die Zeit haengt hinten dran, damit sie nicht fehlt
  if (stuecke.length === 1) return [{ text: roh + ' ' }, { zeit: true }];

  const teile = [];
  stuecke.forEach((st, k) => {
    if (st) teile.push({ text: st });
    if (k < stuecke.length - 1) teile.push({ zeit: true });
  });
  return teile;
}

// ---------------------------------------------------------------------------
// Bildausschnitt der Act-Fotos
// ---------------------------------------------------------------------------
// Die Fotos werden auf der Anzeige quadratisch beschnitten. Ohne Zutun sitzt
// der Ausschnitt mittig - was bei einem Hochformat gern den Kopf abschneidet.
// Deshalb laesst sich pro Act festlegen, welcher Teil zu sehen ist:
//   x, y  Blickpunkt in Prozent (50/50 = Mitte)
//   z     Vergroesserung, 1 = der groesstmoegliche Ausschnitt
// Fehlt die Angabe, kommt genau das Verhalten von frueher heraus.
const ZOOM_MAX = 4;

function fotoAusschnitt(entry) {
  const c = (entry && entry.crop) || {};
  const zahl = (wert, standard, min, max) => {
    // Number(null) und Number('') sind 0 - das waere hier der obere bzw. linke
    // Rand statt "nicht gesetzt". Leeres also vorher aussortieren.
    if (wert === null || wert === undefined || wert === '') return standard;
    const n = Number(wert);
    if (!isFinite(n)) return standard;
    return Math.min(max, Math.max(min, n));
  };
  return {
    x: Math.round(zahl(c.x, 50, 0, 100)),
    y: Math.round(zahl(c.y, 50, 0, 100)),
    z: Math.round(zahl(c.z, 1, 1, ZOOM_MAX) * 100) / 100
  };
}

// Ist der Ausschnitt der Standard? Dann muss er auch nicht gespeichert werden.
function ausschnittIstStandard(a) {
  return a.x === 50 && a.y === 50 && a.z === 1;
}

// Derselbe Stil fuer Anzeige und Editor - sonst sieht man beim Einstellen
// etwas anderes als spaeter auf dem Bildschirm.
function fotoStil(entry) {
  const a = fotoAusschnitt(entry);
  let stil = 'object-position:' + a.x + '% ' + a.y + '%';
  if (a.z > 1) {
    stil += ';transform:scale(' + a.z + ');transform-origin:' + a.x + '% ' + a.y + '%';
  }
  return stil;
}

// ---------------------------------------------------------------------------
// Mitgelieferte Logos
// ---------------------------------------------------------------------------
// settings.logo kennt vier Faelle:
//   ''              das L300-Logo (so war es immer, bleibt der Standard)
//   'none'          gar kein Logo, nur der Bar-Name
//   '@datei.png'    eines der hier mitgelieferten Logos
//   'datei.png'     ein eigenes, im Marken-Ordner der Bar
//
// hoehe ist ein Vorschlag in Prozent der Bildschirmhoehe. Eine breite
// Wortmarke braucht eine kleinere Zahl als ein kompaktes Zeichen, sonst
// stoesst sie an die Breitenbremse und wird ohnehin gedeckelt.
const MITGELIEFERTE_LOGOS = [
  { wert: '', datei: 'l300-logo.png', name: 'L300-Logo', hoehe: 9 },
  { wert: '@tarmac-wortmarke.png', datei: 'tarmac-wortmarke.png',
    name: 'TARMAC-Schriftzug', hoehe: 6 }
];

// Adresse eines mitgelieferten Logos, sonst null. Bewusst relativ: unter
// Electron liegt die Seite in src/, am Pi faellt /branding auf src/branding
// zurueck, wenn die Bar kein eigenes Logo hinterlegt hat.
function mitgeliefertesLogo(wert) {
  if (wert === 'none') return null;
  if (!wert) return 'branding/l300-logo.png';
  if (String(wert).charAt(0) === '@') return 'branding/' + String(wert).slice(1);
  return null;
}

// ---------------------------------------------------------------------------
// Datum und Uhrzeit eintippen
// ---------------------------------------------------------------------------
// Die eingebauten Felder fuer Datum und Uhrzeit lassen sich je nach System
// unterschiedlich gut betippen - mal klappt es, mal geht nur die Auswahl auf.
// Deshalb steht davor ein normales Textfeld, und diese Funktionen uebersetzen
// zwischen dem, was jemand tippt, und dem Format, das gespeichert wird.
//
// Grosszuegig beim Lesen, streng beim Schreiben: "1.2.26", "01.02.2026",
// "2026-02-01" und "010226" meinen alle dasselbe.

function nurZiffern(t) { return String(t == null ? '' : t).replace(/\D/g, ''); }

// Zweistellige Jahre: an einer Bar geht es um dieses Jahrzehnt, nicht um 1926.
function jahrVollstaendig(j) {
  if (j >= 100) return j;
  return j <= 79 ? 2000 + j : 1900 + j;
}

function gueltigesDatum(j, m, t) {
  if (m < 1 || m > 12 || t < 1 || t > 31) return false;
  const d = new Date(j, m - 1, t);
  return d.getFullYear() === j && d.getMonth() === m - 1 && d.getDate() === t;
}

function zweistellig(n) { return String(n).padStart(2, '0'); }

/** Freitext zu "JJJJ-MM-TT". Liefert null, wenn nichts Brauchbares drinsteht. */
function datumParsen(text) {
  const roh = String(text == null ? '' : text).trim();
  if (!roh) return '';

  // Schon im Speicherformat?
  let m = roh.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const j = +m[1], mo = +m[2], t = +m[3];
    return gueltigesDatum(j, mo, t) ? j + '-' + zweistellig(mo) + '-' + zweistellig(t) : null;
  }

  // Getippt: Tag, Monat, Jahr - getrennt durch Punkt, Schraegstrich oder Strich
  m = roh.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) {
    const t = +m[1], mo = +m[2], j = jahrVollstaendig(+m[3]);
    return gueltigesDatum(j, mo, t) ? j + '-' + zweistellig(mo) + '-' + zweistellig(t) : null;
  }

  // Nur Ziffern: TTMMJJ oder TTMMJJJJ
  const z = nurZiffern(roh);
  if (z.length === 6 || z.length === 8) {
    const t = +z.slice(0, 2), mo = +z.slice(2, 4), j = jahrVollstaendig(+z.slice(4));
    return gueltigesDatum(j, mo, t) ? j + '-' + zweistellig(mo) + '-' + zweistellig(t) : null;
  }
  return null;
}

/** "JJJJ-MM-TT" zu "TT.MM.JJJJ" fuers Textfeld. */
function datumAnzeige(iso) {
  const m = String(iso == null ? '' : iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
}

/** Freitext zu "HH:MM". Liefert null, wenn nichts Brauchbares drinsteht. */
function zeitParsen(text) {
  const roh = String(text == null ? '' : text).trim();
  if (!roh) return '';

  // Mit Trenner ist auch eine einstellige Minute eindeutig: "7:5" meint 07:05.
  let m = roh.match(/^(\d{1,2})[:.\s](\d{1,2})$/);
  if (m) {
    const h = +m[1], mi = +m[2];
    return (h <= 23 && mi <= 59) ? zweistellig(h) + ':' + zweistellig(mi) : null;
  }

  const z = nurZiffern(roh);
  // Nur Stunde: "9" wird 09:00 - spart bei vollen Stunden das halbe Tippen
  if (z.length === 1 || z.length === 2) {
    const h = +z;
    return h <= 23 ? zweistellig(h) + ':00' : null;
  }
  if (z.length === 3 || z.length === 4) {
    const h = +z.slice(0, z.length - 2), mi = +z.slice(-2);
    return (h <= 23 && mi <= 59) ? zweistellig(h) + ':' + zweistellig(mi) : null;
  }
  return null;
}

/** "HH:MM" bleibt "HH:MM" - eigene Funktion, damit beide Wege gleich aussehen. */
function zeitAnzeige(hhmm) {
  const m = String(hhmm == null ? '' : hhmm).match(/^(\d{1,2}):(\d{2})$/);
  return m ? zweistellig(+m[1]) + ':' + m[2] : '';
}

// ---------------------------------------------------------------------------
// Eine Runde der Schleife zusammenstellen
// ---------------------------------------------------------------------------
// Die Beitraege laufen in ihrer Reihenfolge, dazwischen kommen Timetable und
// Preise. Wie oft, steht im jeweiligen Reiter: "zeigen nach je ... Beitraegen".
//
// Gibt es weniger Beitraege als die eingestellte Zahl, laesst sich die
// Haeufigkeit nicht wortwoertlich einhalten - bei zwei Bildern und "nach je 3"
// muesste ein Bild ein zweites Mal laufen, bevor der Timetable kommt. Genau das
// sah man auf dem Schirm: dieselben zwei Bilder immer wieder, dazwischen viel
// zu selten eine Information. Deshalb wird die Haeufigkeit auf die Zahl der
// vorhandenen Beitraege gedeckelt - dann laeuft jeder Beitrag einmal, danach
// kommt die Information.
function wirksameHaeufigkeit(jede, anzahl) {
  const e = Math.floor(Number(jede) || 0);
  if (e <= 0 || !anzahl) return 0;      // 0 = gar nicht zeigen
  return Math.min(e, anzahl);
}

/**
 * aktiv           die Beitraege, die gerade laufen duerfen
 * hatTimetable    gibt es ueberhaupt Acts?
 * hatPreise       gibt es ueberhaupt Preise?
 * zaehler         Stand des Beitragszaehlers; laeuft ueber die Runden hinweg
 *                 weiter, sonst erschiene "nach je 5" bei 3 Beitraegen nie
 */
function rundeBauen(opt) {
  const o = opt || {};
  const aktiv = o.aktiv || [];
  const ttJede = o.hatTimetable ? wirksameHaeufigkeit(o.timetableEvery, aktiv.length) : 0;
  const prJede = o.hatPreise ? wirksameHaeufigkeit(o.pricesEvery, aktiv.length) : 0;

  let zaehler = Number(o.zaehler) || 0;
  const items = [];

  for (const v of aktiv) {
    items.push({ type: 'video', video: v });
    zaehler++;
    if (ttJede && zaehler % ttJede === 0) items.push({ type: 'timetable' });
    if (prJede && zaehler % prJede === 0) items.push({ type: 'prices' });
  }

  if (items.length === 0) {
    // Kein Beitrag aktiv -> wenigstens die Informationen zeigen
    if (o.hatTimetable) items.push({ type: 'timetable' });
    if (o.hatPreise) items.push({ type: 'prices' });
    if (items.length === 0) items.push({ type: 'idle' });
  }

  return { items, zaehler };
}
