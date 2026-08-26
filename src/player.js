'use strict';

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
let cfg = null;
let mediaDir = '';
let photoDir = '';
let brandDir = '';
let fontDir = '';
let httpModus = false;   // true, wenn die Anzeige im Browser statt in Electron läuft

const videoEls = [document.getElementById('vidA'), document.getElementById('vidB')];
const slideEls = [document.getElementById('slideA'), document.getElementById('slideB')];

let currentLayer = null;
let playlist = [];
let index = -1;
let itemTimer = null;     // Standzeit eines Slides
let loadTimer = null;     // Watchdog beim Laden eines Videos
let stallTimer = null;    // Watchdog fuer haengende Wiedergabe
let lastTime = -1;
let videoCounter = 0;   // läuft ueber die Runden hinweg weiter
let itemToken = 0;        // invalidiert Callbacks bereits abgelöster Elemente
let imRuhemodus = false;  // Bildschirm schwarz, Schleife angehalten
// Vorschau: nur die Info-Slides, keine Videos. So kostet die Vorschau auf der
// Bedienseite den Pi kein zweites Mal Dekodierung und dem Handy kein Datenvolumen.
const nurVorschau = new URLSearchParams(location.search).has('vorschau');

// Zuletzt gefundene Skalierung je Slide-Art und der zuletzt gezeigte Inhalt.
// Beides spart auf dem Pi Layoutarbeit, siehe fitToBox() und
// refreshVisibleSlide(). Stehen hier oben, weil applyTheme() sie schon beim
// Start anfasst.
let letzteSkala = {};
let letzterSlideStand = '';

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
boot();

async function boot() {
  const paths = await window.api.paths();
  mediaDir = paths.mediaDir;
  photoDir = paths.photoDir;
  brandDir = paths.brandDir;
  fontDir = paths.fontDir;
  httpModus = paths.mode === 'http';
  cfg = await window.api.getConfig();
  applyTheme();

  window.api.onConfigChanged((next) => {
    cfg = next;
    applyTheme();
    restart();
  });

  starthinweisZeigen();
  zeitPruefen();
  setInterval(zeitPruefen, 60000);
  // Aendert sich die Fenstergroesse, passt die gemerkte Skalierung nicht mehr
  window.addEventListener('resize', () => {
    skalaVergessen();
    letzterSlideStand = '';
    // Die Laufschrift misst Fenster- und Textbreite - nach einer
    // Groessenaenderung stimmen beide nicht mehr.
    durchsageStand = '';
    sonderzustaende();
  });

  setInterval(tickClock, 1000);
  setInterval(durchsageTicken, 1000);
  setInterval(refreshVisibleSlide, 20000);
  setInterval(sonderzustaende, 10000);

  restart();
}

function applyTheme() {
  const s = cfg.settings;
  const root = document.documentElement.style;
  // Schriftgroesse, Drehung oder Farben geaendert - die gemerkte Skalierung
  // gilt dann nicht mehr.
  skalaVergessen();
  letzterSlideStand = '';
  document.body.classList.toggle('spar', !!s.sparmodus);
  root.setProperty('--bg', s.bgColor || '#450b6f');
  root.setProperty('--accent', s.accent || '#74ff40');
  root.setProperty('--accent2', s.accent2 || '#f04e23');
  root.setProperty('--blob', 'color-mix(in srgb, ' + (s.bgColor || '#450b6f') + ' 38%, #000)');
  root.setProperty('--muted', 'color-mix(in srgb, ' + (s.bgColor || '#450b6f') + ' 32%, #ffffff 68%)');
  root.setProperty('--fade', (s.transition === 'cut' ? 0 : (s.fadeMs || 700)) + 'ms');
  document.body.dataset.pattern = s.pattern || 'dots';
  document.body.dataset.rotation = String([0, 90, 180, 270].includes(Number(s.rotation))
                                          ? Number(s.rotation) : 0);
  document.body.dataset.title = s.titleStyle || 'blob';
  applyFont(s.fontFile);
}

// Eigene Schriftdatei einbinden, falls eine hinterlegt ist
function applyFont(file) {
  let tag = document.getElementById('customFont');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'customFont';
    document.head.appendChild(tag);
  }
  tag.textContent = file
    ? "@font-face { font-family: 'BarDisplayCustom'; src: url('" + fileUrl(fontDir, file) + "'); font-display: block; }"
    : '';
}

function restart() {
  clearTimers();
  sonderzustaende();
  if (imRuhemodus) return;      // waehrend der Ruhezeit laeuft nichts
  videoCounter = 0;
  buildPlaylist();
  index = -1;
  advance();
}

// ---------------------------------------------------------------------------
// Durchsage und Ruhezeit
// ---------------------------------------------------------------------------
function sonderzustaende() {
  durchsagePruefen();
  ruhePruefen();
}

// Was zurzeit auf dem Balken steht. Wird gemerkt, damit der Balken nur dann neu
// aufgebaut wird, wenn sich wirklich etwas geaendert hat - sonst flackert der
// Countdown jede Sekunde.
let durchsageStand = '';
let durchsageEnde = null;

function durchsagePruefen() {
  const el = document.getElementById('durchsage');
  const d = aktiveDurchsage(cfg, new Date());

  if (!d) {
    if (durchsageStand !== '') { el.classList.remove('an'); durchsageStand = ''; durchsageEnde = null; }
    return;
  }

  // Ein abgelaufener Countdown nimmt die Durchsage mit - das Fensterende ist
  // zugleich das Ende der Anzeige.
  if (d.ende && Date.now() >= d.ende.getTime()) {
    if (durchsageStand !== '') { el.classList.remove('an'); durchsageStand = ''; durchsageEnde = null; }
    return;
  }

  const kennung = [d.quelle || '', d.id || '', d.text, d.ende ? d.ende.getTime() : '',
                   d.modus, d.tempo].join('|');
  // Sichtbar machen, bevor der Inhalt gebaut wird: die Laufschrift misst ihre
  // eigene Breite, um die Dauer zu bestimmen, und in einem ausgeblendeten
  // Element ist jede Breite null.
  el.classList.add('an');
  if (kennung !== durchsageStand) {
    durchsageStand = kennung;
    durchsageEnde = d.ende;
    durchsageAufbauen(el, d);
  }
  durchsageTicken();
}

// Der Text wird in Stuecke zerlegt; das Stueck mit dem Countdown bekommt ein
// eigenes Element, damit jede Sekunde nur diese Zahl neu geschrieben wird.
function durchsageAufbauen(el, d) {
  const ziel = el.querySelector('.durchsageText');
  const inhalt = durchsageTeile(d.text, !!d.ende).map(t =>
    t.zeit ? '<b class="durchsageZeit">--:--</b>' : escapeHtml(t.text)
  ).join('');

  el.classList.toggle('lauf', d.modus === 'lauf');

  if (d.modus !== 'lauf') {
    ziel.className = 'durchsageText';
    ziel.removeAttribute('style');
    ziel.innerHTML = inhalt;
    return;
  }

  // Laufschrift wie bei einem Nachrichtensender: der Text beginnt rechts
  // ausserhalb des Bildes, wandert nach links durch und verschwindet links
  // wieder. Erst danach faengt er von vorn an.
  //
  // Bewusst nur ein Textstueck: bei kurzem Text standen vorher zwei Kopien
  // gleichzeitig auf dem Balken, und beim Start "ploppte" der Text einfach da,
  // statt hereinzulaufen.
  ziel.className = 'durchsageText lauf';
  ziel.innerHTML = '<div class="laufSpur"><span class="laufStueck">' + inhalt + '</span></div>';

  const spur = ziel.querySelector('.laufSpur');
  const stueck = ziel.querySelector('.laufStueck');
  const fenster = ziel.getBoundingClientRect().width;
  const breite = stueck.getBoundingClientRect().width;

  // Die Strecke ist Fensterbreite plus Textbreite: von ganz rechts draussen bis
  // ganz links draussen.
  spur.style.setProperty('--laufStart', Math.round(fenster) + 'px');
  spur.style.setProperty('--laufEnde', '-' + Math.round(breite) + 'px');
  spur.style.animationDuration = laufDauer(fenster + breite, fenster, d.tempo) + 's';
}

function durchsageTicken() {
  if (!durchsageEnde) return;
  const rest = durchsageEnde.getTime() - Date.now();
  if (rest <= 0) return durchsagePruefen();   // Fenster vorbei, Balken raeumen
  const txt = countdownText(rest);
  document.querySelectorAll('.durchsageZeit').forEach(el => {
    if (el.textContent !== txt) el.textContent = txt;
  });
}

function ruhePruefen() {
  const q = cfg.quiet || {};
  const jetzt = new Date();
  // In der Vorschau nie schwarz schalten - sonst sieht man auf dem Handy nichts
  // und haelt die Bedienseite fuer kaputt.
  const soll = !nurVorschau && !!(q.enabled && zeitImFenster(q.from, q.to, jetzt));

  if (soll && !imRuhemodus) return ruheAn();
  if (!soll && imRuhemodus) return ruheAus();
  if (imRuhemodus) ruheHinweisSetzen();
}

function ruheAn() {
  imRuhemodus = true;
  clearTimers();
  itemToken++;
  videoEls.forEach(v => {
    v.onended = null; v.onerror = null; v.oncanplay = null;
    v.pause(); v.removeAttribute('src'); v.load(); v.classList.remove('show');
  });
  slideEls.forEach(el => { el.classList.remove('show'); el.innerHTML = ''; delete el.dataset.kind; });
  currentLayer = null;
  document.getElementById('ruhe').classList.add('an');
  ruheHinweisSetzen();
  console.log('[ruhezeit] Anzeige schlaeft');
}

function ruheAus() {
  imRuhemodus = false;
  document.getElementById('ruhe').classList.remove('an');
  console.log('[ruhezeit] Anzeige wacht auf');
  restart();
}

// Dezenter Hinweis, der langsam wandert - so brennt sich nichts ein und
// niemand haelt den schwarzen Bildschirm fuer einen Defekt.
function ruheHinweisSetzen() {
  const el = document.querySelector('.ruheHinweis');
  const q = cfg.quiet || {};
  el.textContent = nowHHMM() + '   ·   Ruhezeit bis ' + (q.to || '');
  const minute = new Date().getMinutes();
  el.style.left = (8 + (minute * 137) % 60) + '%';
  el.style.top = (8 + (minute * 89) % 70) + '%';
}

function clearTimers() {
  clearTimeout(itemTimer); itemTimer = null;
  clearTimeout(loadTimer); loadTimer = null;
  clearInterval(stallTimer); stallTimer = null;
}

// ---------------------------------------------------------------------------
// Playlist bauen: Videos in konfigurierter Reihenfolge, dazwischen Info-Slides
// ---------------------------------------------------------------------------
function buildPlaylist() {
  const now = new Date();
  const s = cfg.settings;
  const active = nurVorschau ? [] : (cfg.videos || []).filter(v => isVideoActive(v, now));

  const hasTT = (cfg.timetable || []).length > 0;
  const sp = cfg.special || {};
  const hasPR = (cfg.prices || []).some(c => (c.items || []).length > 0) ||
                (sp.enabled && sp.name);

  const items = [];
  for (const v of active) {
    items.push({ type: 'video', video: v });
    videoCounter++;
    // Zähler läuft ueber Rundengrenzen hinweg weiter - sonst würde z.B. bei
    // 3 Videos und "Preise nach je 5 Videos" die Preisliste nie erscheinen
    if (hasTT && s.timetableEvery > 0 && videoCounter % s.timetableEvery === 0) items.push({ type: 'timetable' });
    if (hasPR && s.pricesEvery > 0 && videoCounter % s.pricesEvery === 0) items.push({ type: 'prices' });
  }

  if (items.length === 0) {
    // Keine Videos aktiv -> wenigstens die Infos zeigen
    if (hasTT) items.push({ type: 'timetable' });
    if (hasPR) items.push({ type: 'prices' });
    if (items.length === 0) items.push({ type: 'idle' });
  }

  playlist = items;
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------
function advance(delay) {
  clearTimers();
  itemToken++;   // alle noch offenen Callbacks des alten Elements entwerten
  if (delay) {
    itemTimer = setTimeout(() => advance(), delay);
    return;
  }

  const now = new Date();
  let guard = 0;
  while (guard++ <= playlist.length + 1) {
    index++;
    if (index >= playlist.length) {
      // Runde vorbei: Playlist neu bewerten (Zeitfenster können sich geändert haben)
      buildPlaylist();
      index = 0;
    }
    const item = playlist[index];
    if (!item) break;
    // Videos kurz vor dem Abspielen nochmal gegen den Zeitplan prüfen
    if (item.type === 'video' && !isVideoActive(item.video, now)) continue;
    playItem(item);
    return;
  }

  // Nichts Spielbares gefunden
  playItem({ type: 'idle' });
}

function playItem(item) {
  console.log('[schleife]', item.type, item.video ? item.video.file : '');
  if (item.type !== 'video') return playSlide(item);
  if (isImageFile(item.video.file)) return playImage(item);
  playVideo(item);
}

// Standbild: läuft auf einer Slide-Ebene, Standzeit pro Bild oder global
function playImage(item) {
  const tok = itemToken;
  const el = pickLayer('slide');
  el.innerHTML = '<div class="fullImage"><img src="' + mediaUrl(item.video.file) + '" alt=""></div>';
  el.dataset.kind = 'image';

  const img = el.querySelector('img');

  // Erst einblenden, wenn das Bild wirklich da ist - sonst blitzt bei grossen
  // Dateien kurz eine leere Flaeche auf.
  const einblenden = () => {
    if (tok !== itemToken) return;
    clearTimeout(loadTimer); loadTimer = null;
    crossfade(el);
    const secs = Number(item.video.duration) || Number(cfg.settings.imageDuration) || 12;
    itemTimer = setTimeout(() => { if (tok === itemToken) advance(); }, Math.max(2, secs) * 1000);
  };

  img.onerror = () => {
    if (tok !== itemToken) return;
    console.warn('Bild übersprungen:', item.video.file);
    advance(300);
  };

  if (img.complete && img.naturalWidth > 0) {
    einblenden();
  } else {
    img.onload = einblenden;
    loadTimer = setTimeout(einblenden, 5000);   // Notbremse
  }
}

function playVideo(item) {
  const tok = itemToken;
  const el = pickLayer('video');
  const url = mediaUrl(item.video.file);

  el.onended = null;
  el.onerror = null;
  el.oncanplay = null;
  el.muted = true;
  el.volume = 0;
  el.src = url;

  const fail = (why) => {
    if (tok !== itemToken) return;
    console.warn('Video übersprungen:', item.video.file, why);
    advance(400);
  };

  loadTimer = setTimeout(() => fail('Zeitüberschreitung beim Laden'), 20000);

  el.oncanplay = () => {
    if (tok !== itemToken) return;
    el.oncanplay = null;
    clearTimeout(loadTimer); loadTimer = null;
    el.play().then(() => {
      if (tok !== itemToken) return;
      crossfade(el);
      startStallWatch(el, tok);
    }).catch(e => fail(e && e.message));
  };

  el.onended = () => { if (tok === itemToken) advance(); };
  el.onerror = () => fail('Datei nicht lesbar');
  el.load();
}

// Erkennt haengende Wiedergabe (z.B. defekte Datei) und schaltet weiter
function startStallWatch(el, tok) {
  lastTime = -1;
  stallTimer = setInterval(() => {
    if (tok !== itemToken) return;
    if (el.paused || el.ended) return;
    if (el.currentTime === lastTime) {
      clearInterval(stallTimer); stallTimer = null;
      console.warn('Wiedergabe hängt - weiter zum nächsten Clip');
      advance(200);
      return;
    }
    lastTime = el.currentTime;
  }, 8000);
}

function playSlide(item) {
  const tok = itemToken;
  const el = pickLayer('slide');
  const s = cfg.settings;

  el.innerHTML = renderSlide(item.type);
  el.dataset.kind = item.type;
  // Einpassen vor dem Ueberblenden: das Einpassen erzwingt Layout, und das
  // mitten in einer laufenden Blende zu tun ist genau der sichtbare Ruckler.
  fitToBox(el);
  letzterSlideStand = ohneUhrzeit(el.innerHTML);
  crossfade(el);

  let secs = 15;
  if (item.type === 'timetable') secs = s.timetableDuration || 20;
  else if (item.type === 'prices') secs = s.pricesDuration || 25;
  else secs = 30;
  if (nurVorschau) secs = 8;      // in der Vorschau zuegig durchwechseln

  itemTimer = setTimeout(() => { if (tok === itemToken) advance(); }, Math.max(3, secs) * 1000);
}

function pickLayer(type) {
  const pool = type === 'video' ? videoEls : slideEls;
  return pool[0] === currentLayer ? pool[1] : pool[0];
}

// Im Sparmodus wird hart geschnitten, egal was eingestellt ist. Blenden und
// Vorhaenge sind auf einem Pi der teuerste Teil der ganzen Anzeige.
function uebergang() {
  if (cfg.settings.sparmodus) return 'cut';
  return cfg.settings.transition || 'fade';
}

function fadeMs() {
  return uebergang() === 'cut' ? 0 : (cfg.settings.fadeMs || 700);
}

function cleanupLayer(el) {
  if (el.tagName === 'VIDEO') {
    el.onended = null;
    el.onerror = null;
    el.oncanplay = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
  } else {
    el.innerHTML = '';
    delete el.dataset.kind;
  }
}

function crossfade(next) {
  const mode = uebergang();
  if (mode === 'logo' || mode === 'wipe') return curtainSwap(next, mode);

  const prev = currentLayer;
  next.style.zIndex = '2';
  next.classList.add('show');
  currentLayer = next;

  if (prev && prev !== next) {
    prev.style.zIndex = '1';
    setTimeout(() => {
      if (currentLayer === prev) return;
      prev.classList.remove('show');
      cleanupLayer(prev);
    }, fadeMs() + 60);
  }
}

// Ebenen sofort tauschen - wird benutzt, während der Vorhang das Bild verdeckt
function swapNow(next) {
  const prev = currentLayer;
  document.body.classList.add('instant');
  next.style.zIndex = '2';
  next.classList.add('show');
  currentLayer = next;
  if (prev && prev !== next) {
    prev.style.zIndex = '1';
    prev.classList.remove('show');
    cleanupLayer(prev);
  }
  setTimeout(() => document.body.classList.remove('instant'), 60);
}

function curtainMarkHtml() {
  const url = logoUrl();
  if (url) {
    const h = (Number(cfg.settings.logoHeight) || 9) * 2.4;
    return '<img src="' + url + '" alt="" style="height:' + h + 'vh">';
  }
  return '<div class="curtainName">' + escapeHtml(cfg.settings.barName || '') + '</div>';
}

function curtainSwap(next, mode) {
  const total = Math.max(300, Number(cfg.settings.transitionMs) || 900);
  const half = Math.round(total / 2);
  const c = document.getElementById('curtain');
  const mark = c.querySelector('.curtainMark');
  const easing = 'cubic-bezier(0.66, 0, 0.34, 1)';

  mark.getAnimations().forEach(a => a.cancel());
  c.className = 'active ' + mode;
  mark.innerHTML = curtainMarkHtml();

  // Vorhang zuziehen ...
  const inKf = mode === 'wipe'
    ? [{ transform: 'translateX(112%)' }, { transform: 'translateX(-6%)' }]
    : [{ opacity: 0 }, { opacity: 1 }];
  const outKf = mode === 'wipe'
    ? [{ transform: 'translateX(-6%)' }, { transform: 'translateX(-112%)' }]
    : [{ opacity: 1 }, { opacity: 0 }];

  const closing = mark.animate(inKf, { duration: half, easing, fill: 'forwards' });
  closing.onfinish = () => {
    swapNow(next);                   // Wechsel passiert unsichtbar hinter dem Vorhang
    const opening = mark.animate(outKf, { duration: half, easing, fill: 'forwards' });
    opening.onfinish = () => {
      mark.getAnimations().forEach(a => a.cancel());
      mark.innerHTML = '';
      c.className = '';
    };
  };
}

function fileUrl(dir, file) {
  const p = String(dir).replace(/\\/g, '/').replace(/\/$/, '');
  // Im Browserbetrieb liefert der Dienst Pfade wie "/media" - dort darf keine
  // file://-URL entstehen, sonst blockiert der Browser den Zugriff.
  if (httpModus) return p + '/' + encodeURIComponent(file);
  return 'file:///' + encodeURI(p + '/' + file).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function mediaUrl(file) { return fileUrl(mediaDir, file); }
function photoUrl(file) { return fileUrl(photoDir, file); }

// ---------------------------------------------------------------------------
// Slides rendern
// ---------------------------------------------------------------------------
function renderSlide(kind) {
  if (kind === 'timetable') return renderTimetable();
  if (kind === 'prices') return renderPrices();
  return renderIdle();
}

// '' = mitgeliefertes L300-Logo, 'none' = gar kein Logo, sonst eigene Datei
function logoUrl() {
  const f = cfg.settings.logo;
  if (f === 'none') return '';
  const mit = mitgeliefertesLogo(f);
  return mit ? mit : fileUrl(brandDir, f);
}

function logoImg(cls) {
  const url = logoUrl();
  if (!url) return '';
  const h = Number(cfg.settings.logoHeight) || 9;
  return '<img class="' + cls + '" src="' + url + '" alt="" style="height:' + h + 'vh">';
}

function headHtml(title, sub) {
  const s = cfg.settings;
  const name = s.barName
    ? '<div class="brand">' + escapeHtml(s.barName) +
      (s.subtitle ? '<span>' + escapeHtml(s.subtitle) + '</span>' : '') + '</div>'
    : '';
  // blob = organische Form, bar = schlichter Balken, plain = frei auf dem Hintergrund
  const style = s.titleStyle || 'blob';
  return '<div class="slideHead">' +
    '<div class="brandBox">' + logoImg('brandLogo') + name + '</div>' +
    '<div class="titleBox ' + style + '">' +
      '<h1 class="blobTitle">' + escapeHtml(title) + '</h1>' +
      (sub ? '<div class="blobSub">' + escapeHtml(sub) + '</div>' : '') +
    '</div></div>';
}

function footHtml(mitQr) {
  const s = cfg.settings;
  const qr = mitQr ? qrHtml() : '';
  const uhr = s.showClock
    ? '<div class="fussUhr"><span class="dot"></span>' +
      escapeHtml(dateLine()) + ' &middot; <b data-clock>' + nowHHMM() + '</b>' +
      '<span class="uhrWarnung" title="Uhrzeit nicht abgeglichen">&#9888;</span></div>'
    : '';
  if (!qr && !uhr) return '';
  return '<div class="slideFoot' + (qr ? ' mitQr' : '') + '">' + qr + uhr + '</div>';
}

// QR-Code fuer die Festivalseite. Wird als SVG erzeugt, damit er auf jedem
// Bildschirm scharf bleibt; Fehlerkorrektur M reicht fuer eine Bildschirmanzeige.
function qrHtml() {
  const s = cfg.settings;
  const url = (s.qrUrl || '').trim();
  if (!s.qrEnabled || !url || typeof qrcode !== 'function') return '';
  try {
    // Ohne diese Zeile schneidet die Bibliothek jedes Zeichen auf ein Byte ab -
    // Umlaute und alles ausserhalb von Latin-1 werden dadurch unlesbar.
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    return '<div class="qr">' +
      '<div class="qrBild">' + q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) + '</div>' +
      (s.qrLabel ? '<div class="qrText">' + escapeHtml(s.qrLabel) + '</div>' : '') +
      '</div>';
  } catch (err) {
    console.warn('QR-Code nicht erzeugbar:', err && err.message);
    return '';
  }
}

function nowHHMM() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function dateLine() {
  const d = new Date();
  return DAY_NAMES_LONG[d.getDay()] + ', ' + pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.';
}

function renderTimetable() {
  const s = cfg.settings;
  const now = new Date();
  const view = timetableView(cfg.timetable, now, s.timetableMaxNext);
  let body = '';

  if (view.current) {
    const se = view.current.se;
    const e = view.current.entry;
    const times = timeLabel(se.start) + (se.end ? ' &ndash; ' + timeLabel(se.end) : '');
    body += '<div class="ttNow">' +
      (e.photo ? '<div class="ttPhoto"><img src="' + photoUrl(e.photo) +
                 '" alt="" style="' + fotoStil(e) + '"></div>' : '') +
      '<div class="ttWhen"><div class="tag">JETZT</div><div class="time">' + times + '</div></div>' +
      '<div class="ttWho"><div class="act">' + escapeHtml(e.act) + '</div>' +
      (e.info ? '<div class="info">' + escapeHtml(e.info) + '</div>' : '') + '</div>' +
      '</div>';
  }

  // Platz für die Miniatur nur reservieren, wenn überhaupt ein Foto dabei ist -
  // dann fangen alle Act-Namen auf derselben Kante an
  const anyPhoto = view.next.some(x => x.entry.photo);

  if (view.next.length) {
    body += '<div class="ttLabel">' + (view.current ? 'ALS N&Auml;CHSTES' : 'DEMN&Auml;CHST') + '</div>';
    body += '<div class="ttList">';
    for (const x of view.next) {
      const e = x.entry;
      const when = timeLabel(x.se.start) + (x.se.end ? '&ndash;' + timeLabel(x.se.end) : '');
      body += '<div class="ttRow">' +
        '<div class="when">' + when + '</div>' +
        '<div class="act">' +
          (e.photo ? '<span class="ttThumb"><img src="' + photoUrl(e.photo) +
                     '" alt="" style="' + fotoStil(e) + '"></span>'
                   : (anyPhoto ? '<span class="ttThumb empty"></span>' : '')) +
          '<span>' + escapeHtml(e.act) + '</span></div>' +
        '<div class="day">' + escapeHtml(dayLabel(x.se.start, now)) + '</div>' +
        (e.info ? '<div class="info">' + escapeHtml(e.info) + '</div>' : '') +
        '</div>';
    }
    body += '</div>';
  }

  if (!view.current && !view.next.length) {
    body += '<div class="emptyNote">' +
      (view.total === 0 ? 'Timetable noch nicht eingepflegt.' : 'F&uuml;r heute ist das Programm durch. Bis bald!') +
      '</div>';
  }

  return '<div class="slideInner">' +
    headHtml(s.timetableTitle || 'TIMETABLE', s.timetableSubtitle) +
    '<div class="slideBody">' + body + '</div>' + footHtml(true) + '</div>';
}

function renderPrices() {
  const s = cfg.settings;
  const cats = (cfg.prices || []).filter(c => (c.items || []).length > 0);
  let body = '<div class="priceGrid">';
  for (const c of cats) {
    body += '<div class="priceCat"><h2>' + escapeHtml(c.category) + '</h2>';
    for (const it of c.items) {
      body += '<div class="priceItem">' +
        '<span class="pn">' + escapeHtml(it.name) + '</span>' +
        (it.size ? '<span class="psz">' + escapeHtml(it.size) + '</span>' : '') +
        '<span class="dots"></span>' +
        '<span class="pp">' + escapeHtml(it.price) + '</span>' +
        '</div>';
    }
    body += '</div>';
  }
  body += '</div>';
  if (!cats.length) body = '';

  body += renderSpecial();

  if (s.priceNote) body += '<div class="priceNote">' + escapeHtml(s.priceNote) + '</div>';
  if (!cats.length && !body.trim()) {
    body = '<div class="emptyNote">Preisliste noch nicht eingepflegt.</div>';
  }

  return '<div class="slideInner">' +
    headHtml(s.pricesTitle || 'GETRÄNKE', s.pricesSubtitle) +
    '<div class="slideBody center">' + body + '</div>' + footHtml() + '</div>';
}

// Spezialshot: volle Breite, unter den Spalten, deutlich abgesetzt
function renderSpecial() {
  const sp = cfg.special || {};
  if (!sp.enabled || !sp.name) return '';
  return '<div class="special">' +
    '<div class="specialTag">' + escapeHtml(sp.label || 'SPEZIALSHOT') + '</div>' +
    '<div class="specialRow">' +
      '<span class="specialName">' + escapeHtml(sp.name) + '</span>' +
      (sp.size ? '<span class="specialSize">' + escapeHtml(sp.size) + '</span>' : '') +
      '<span class="specialDots"></span>' +
      (sp.price ? '<span class="specialPrice">' + escapeHtml(sp.price) + '</span>' : '') +
    '</div>' +
    (sp.text ? '<div class="specialText">' + escapeHtml(sp.text) + '</div>' : '') +
    '</div>';
}

function renderIdle() {
  const s = cfg.settings;
  return '<div class="slideInner"><div class="idleWrap">' +
    logoImg('idleLogo') +
    (s.barName ? '<div class="big">' + escapeHtml(s.barName) + '</div>' : '') +
    (s.subtitle ? '<div class="sub">' + escapeHtml(s.subtitle) + '</div>' : '') +
    '<div class="cl" data-clock>' + nowHHMM() + '</div>' +
    '<div class="hint">Noch keine Inhalte &ndash; ESC dr&uuml;cken f&uuml;r Einstellungen</div>' +
    '</div></div>';
}

// Schrift so weit verkleinern, bis der Inhalt in die Fläche passt
// Kleinste Schrift, die wir zulassen - darunter liest das niemand mehr.
const MIN_SKALA = 45;   // in Hundertsteln, damit ganzzahlig gerechnet wird

function skalaVergessen() { letzteSkala = {}; }

// Passt der Inhalt in die Flaeche? Jeder Aufruf erzwingt ein Layout - das ist
// der teure Teil, deshalb wird hier gezaehlt und nicht getastet.
function passtBei(inner, body, hundertstel) {
  inner.style.setProperty('--scale', (hundertstel / 100).toFixed(2));
  return body.scrollHeight <= body.clientHeight + 2;
}

function fitToBox(layer) {
  const inner = layer.querySelector('.slideInner');
  const body = layer.querySelector('.slideBody');
  if (!inner || !body) return;

  const art = layer.dataset.kind || '?';
  const gemerkt = letzteSkala[art];

  // Erst den Wert vom letzten Mal probieren. Passt er und eine Stufe groesser
  // passt nicht mehr, ist er weiterhin der beste - fertig nach zwei Layouts.
  if (gemerkt && passtBei(inner, body, gemerkt)) {
    if (gemerkt >= 100 || !passtBei(inner, body, gemerkt + 1)) {
      inner.style.setProperty('--scale', (gemerkt / 100).toFixed(2));
      return;
    }
  }

  // Sonst binaer suchen. Das findet in rund sechs Schritten den groessten
  // passenden Wert - das fruehere Abtasten brauchte bis zu vierzig und blieb
  // ausserdem am groben Raster haengen, die Schrift war also unnoetig klein.
  if (passtBei(inner, body, 100)) { letzteSkala[art] = 100; return; }

  let lo = MIN_SKALA;     // gilt als "passt" (Untergrenze, die wir hinnehmen)
  let hi = 100;           // passt nachweislich nicht
  while (hi - lo > 1) {
    const mitte = (lo + hi) >> 1;
    if (passtBei(inner, body, mitte)) lo = mitte; else hi = mitte;
  }
  inner.style.setProperty('--scale', (lo / 100).toFixed(2));
  letzteSkala[art] = lo;
}

function tickClock() {
  const txt = nowHHMM();
  document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = txt; });
}

// ---------------------------------------------------------------------------
// Adresse der Bedienseite beim Start
// ---------------------------------------------------------------------------
// Ohne diesen Hinweis muss jemand erst die IP des Bar-Rechners heraussuchen,
// bevor er vom Handy etwas aendern kann. Deshalb steht sie nach dem Start eine
// Minute lang auf dem Bildschirm und verschwindet dann von allein.
const STARTHINWEIS_MS = 60000;

async function starthinweisZeigen() {
  if (nurVorschau) return;
  if (!window.api || !window.api.fernInfo) return;

  let f = null;
  try { f = await window.api.fernInfo(); } catch (err) { return; }
  if (!f || !f.hinweis) return;

  const kasten = document.getElementById('starthinweis');
  if (!kasten) return;

  let text;
  if (f.fehler) {
    text = '<div class="shTitel">Fernbedienung nicht gestartet</div>' +
           '<div class="shAdresse">' + escapeHtml(f.fehler) + '</div>';
  } else if (!f.gewuenscht) {
    return;
  } else if (!f.adressen.length) {
    text = '<div class="shTitel">Bedienung vom Handy</div>' +
           '<div class="shAdresse">Keine Netzwerkverbindung</div>';
  } else {
    // Mehrere Adressen kommen vor (WLAN und Kabel). Alle zeigen, damit man die
    // richtige erwischt, statt zu raten.
    text = '<div class="shTitel">Bedienung vom Handy im selben Netz</div>' +
      f.adressen.map(a => '<div class="shAdresse">http://' + escapeHtml(a) +
        ':' + f.port + '/einstellungen</div>').join('');
  }

  kasten.querySelector('.shInner').innerHTML = text;
  kasten.classList.add('an');
  setTimeout(() => kasten.classList.remove('an'), STARTHINWEIS_MS);
}

// Steht die Systemuhr? Ein Pi ohne Zeitabgleich zeigt eine Uhrzeit, die voellig
// plausibel aussieht und trotzdem falsch ist - und daran haengt der ganze
// Timetable. Der Hinweis auf dem Bildschirm bleibt bewusst klein: Gaeste sollen
// keine Fehlermeldung sehen, das Barpersonal aber merken, dass etwas nicht
// stimmt. Deutlich im Klartext steht es in den Einstellungen unter System.
let uhrUnsicher = false;

async function zeitPruefen() {
  if (!window.api || !window.api.zeitStatus) return;
  try {
    const z = await window.api.zeitStatus();
    const schlecht = !!(z && z.pruefbar && z.synchronisiert === false);
    if (schlecht === uhrUnsicher) return;
    uhrUnsicher = schlecht;
    document.body.classList.toggle('uhrUnsicher', schlecht);
    if (schlecht) console.warn('[uhr] nicht aus dem Netz abgeglichen - Zeiten koennen falsch sein');
  } catch (err) {
    /* keine Auskunft moeglich: dann lieber nichts behaupten */
  }
}

// Sichtbaren Info-Slide regelmaessig aktualisieren, damit "JETZT" live bleibt.
// Meistens aendert sich dabei nichts ausser der Uhrzeit - und die schreibt
// tickClock ohnehin jede Sekunde neu. Den Slide dann trotzdem neu aufzubauen
// und neu einzupassen kostet auf einem Pi spuerbar Zeit, also erst vergleichen.
function refreshVisibleSlide() {
  if (!currentLayer || currentLayer.tagName === 'VIDEO') return;
  const kind = currentLayer.dataset.kind;
  if (kind !== 'timetable') return;

  const frisch = renderSlide(kind);
  const stand = ohneUhrzeit(frisch);
  if (stand === letzterSlideStand) return;

  letzterSlideStand = stand;
  currentLayer.innerHTML = frisch;
  fitToBox(currentLayer);
}

// Nur den Inhalt der laufenden Uhr ausblenden, sonst schlaegt der Vergleich
// jede Minute an. Bewusst eng gefasst: eine allgemeine Zeitmaske wuerde auch
// die Spielzeiten der Acts treffen, und deren Aenderung soll sehr wohl einen
// Neuaufbau ausloesen.
function ohneUhrzeit(html) {
  return html.replace(/(<b data-clock>)[^<]*/g, '$1#');
}

// ---------------------------------------------------------------------------
// Bedienung: ESC / Zahnrad / PIN
// ---------------------------------------------------------------------------
const hud = document.getElementById('hud');
let hudTimer = null;

function showHud() {
  hud.classList.add('visible');
  document.body.classList.add('showCursor');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => {
    hud.classList.remove('visible');
    document.body.classList.remove('showCursor');
  }, 3500);
}

window.addEventListener('mousemove', showHud);
document.getElementById('gear').addEventListener('click', requestSettings);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    requestSettings();
  }
});

const pinOverlay = document.getElementById('pinOverlay');
const pinDots = document.getElementById('pinDots');
let pinBuffer = '';

function requestSettings() {
  const pin = (cfg && cfg.settings.pin) || '';
  if (!pin) { window.api.openSettings(); return; }
  pinBuffer = '';
  drawPinDots();
  pinOverlay.classList.remove('hidden');
}

function drawPinDots() {
  pinDots.innerHTML = pinBuffer.split('').map(() => '<i></i>').join('');
}

document.querySelectorAll('.pinPad button').forEach(btn => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    if (k === 'del') pinBuffer = pinBuffer.slice(0, -1);
    else if (k === 'ok') return checkPin();
    else if (pinBuffer.length < 12) pinBuffer += k;
    drawPinDots();
  });
});

document.getElementById('pinCancel').addEventListener('click', () => {
  pinOverlay.classList.add('hidden');
  pinBuffer = '';
});

function checkPin() {
  if (pinBuffer === (cfg.settings.pin || '')) {
    pinOverlay.classList.add('hidden');
    pinBuffer = '';
    drawPinDots();
    window.api.openSettings();
  } else {
    const box = pinOverlay.querySelector('.pinBox');
    box.classList.add('shake');
    setTimeout(() => box.classList.remove('shake'), 340);
    pinBuffer = '';
    drawPinDots();
  }
}
