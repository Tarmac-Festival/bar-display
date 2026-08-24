'use strict';

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Pfade
// ---------------------------------------------------------------------------
const USER_DIR = app.getPath('userData');
const MEDIA_DIR = path.join(USER_DIR, 'media');
const PHOTO_DIR = path.join(USER_DIR, 'photos');
const BRAND_DIR = path.join(USER_DIR, 'branding');
const FONT_DIR = path.join(USER_DIR, 'fonts');
const CONFIG_PATH = path.join(USER_DIR, 'config.json');
const BACKUP_PATH = path.join(USER_DIR, 'config.backup.json');

const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];
const LOGO_EXT = ['png', 'svg', 'jpg', 'jpeg', 'webp'];
const FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];
const LOOP_EXT = VIDEO_EXT.concat(IMAGE_EXT);

let playerWin = null;
let settingsWin = null;

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------
const CONFIG_VERSION = 2;

const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  settings: {
    barName: 'TARMAC BAR',
    subtitle: 'Planetenweide',
    bgColor: '#450b6f',
    accent: '#74ff40',
    accent2: '#f04e23',
    logo: '',
    logoHeight: 9,
    fontFile: '',
    titleStyle: 'blob',      // blob | bar | plain
    pattern: 'dots',         // none | dots | confetti
    displayId: '',           // leer = Hauptbildschirm
    transition: 'fade',      // fade | cut | logo | wipe
    transitionMs: 900,
    timetableTitle: 'TIMETABLE',
    timetableSubtitle: 'line up',
    pricesTitle: 'GETRÄNKE',
    pricesSubtitle: 'preise',
    pin: '',
    timetableEvery: 3,        // nach wie vielen Videos ein Timetable-Slide
    timetableDuration: 20,    // Sekunden
    pricesEvery: 5,           // nach wie vielen Videos ein Preis-Slide
    pricesDuration: 25,       // Sekunden
    showClock: true,
    fadeMs: 700,
    imageDuration: 12,
    timetableMaxNext: 5,
    priceNote: ''
  },
  videos: [],
  timetable: [],
  prices: [],
  // Hervorgehobener Shot unter den Preisspalten
  special: {
    enabled: false,
    label: 'SPEZIALSHOT',
    name: '',
    size: '',
    price: '',
    text: ''
  }
};

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = Object.assign({}, base);
    if (over && typeof over === 'object') {
      for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    }
    return out;
  }
  return over === undefined ? base : over;
}

function ensureDirs() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.mkdirSync(BRAND_DIR, { recursive: true });
  fs.mkdirSync(FONT_DIR, { recursive: true });
}

function migrate(raw) {
  // v1 kannte nur eine Akzentfarbe und kein Farbschema - auf den neuen Look heben
  if (!raw.version || raw.version < 2) {
    raw.settings = raw.settings || {};
    delete raw.settings.accent;
    raw.version = CONFIG_VERSION;
  }
  return raw;
}

// Editoren und PowerShell schreiben UTF-8 gern mit BOM - der bricht JSON.parse
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function loadConfig() {
  try {
    const raw = migrate(readJson(CONFIG_PATH));
    return deepMerge(DEFAULT_CONFIG, raw);
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig(cfg) {
  ensureDirs();
  const merged = deepMerge(DEFAULT_CONFIG, cfg || {});
  // kleines Sicherheitsnetz: letzte Fassung aufheben
  try {
    if (fs.existsSync(CONFIG_PATH)) fs.copyFileSync(CONFIG_PATH, BACKUP_PATH);
  } catch (e) { /* egal */ }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// ---------------------------------------------------------------------------
// Dateinamen entschärfen (Leerzeichen/Umlaute machen file:// URLs fragil)
// ---------------------------------------------------------------------------
function safeName(original, dir) {
  const ext = path.extname(original).toLowerCase();
  let base = path.basename(original, path.extname(original));
  base = base
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!base) base = 'datei';
  let name = base + ext;
  let i = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = base + '_' + i + ext;
    i++;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Bildschirme
// ---------------------------------------------------------------------------
function targetDisplay(cfg) {
  const id = (cfg && cfg.settings && cfg.settings.displayId) || '';
  const found = screen.getAllDisplays().find(d => String(d.id) === String(id));
  return found || screen.getPrimaryDisplay();   // abgestöpselter Monitor -> zurück auf den Hauptschirm
}

function placeOnDisplay(win, display) {
  if (!win || win.isDestroyed()) return;
  const b = display.bounds;

  // Unter Windows verlaesst das Fenster den Vollbildmodus verzoegert. Setzt man
  // die Position zu frueh, landet es wieder auf dem alten Monitor - also erst
  // auf 'leave-full-screen' warten.
  const setzen = () => {
    if (win.isDestroyed()) return;
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    setTimeout(() => { if (!win.isDestroyed()) win.setFullScreen(true); }, 80);
  };

  if (win.isFullScreen()) {
    let erledigt = false;
    const weiter = () => { if (!erledigt) { erledigt = true; setTimeout(setzen, 60); } };
    win.once('leave-full-screen', weiter);
    setTimeout(weiter, 700);        // Notbremse, falls das Ereignis ausbleibt
    win.setFullScreen(false);
  } else {
    setzen();
  }
}

function displayOf(win) {
  return screen.getDisplayMatching(win.getBounds());
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------
function createPlayerWindow() {
  const bounds = targetDisplay(loadConfig()).bounds;
  playerWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    fullscreen: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Bar Display',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  playerWin.loadFile(path.join(__dirname, 'src', 'player.html'));
  playerWin.once('ready-to-show', () => {
    playerWin.show();
    playerWin.setFullScreen(true);
    playerWin.focus();
  });
  playerWin.on('closed', () => { playerWin = null; });
}

function createSettingsWindow(onDisplay) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const w = 1180, h = 800;
  let pos = {};
  if (onDisplay) {
    const wa = onDisplay.workArea;
    pos = {
      x: Math.round(wa.x + (wa.width - Math.min(w, wa.width)) / 2),
      y: Math.round(wa.y + (wa.height - Math.min(h, wa.height)) / 2)
    };
  }
  settingsWin = new BrowserWindow({
    ...pos,
    width: w,
    height: h,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14161a',
    title: 'Bar Display - Einstellungen',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
    if (playerWin && !playerWin.isDestroyed()) {
      placeOnDisplay(playerWin, targetDisplay(loadConfig()));
      playerWin.focus();
    }
  });
}

function openSettings() {
  const target = targetDisplay(loadConfig());
  const primary = screen.getPrimaryDisplay();
  // Läuft die Anzeige auf einem eigenen Monitor, bleibt sie im Vollbild und
  // die Einstellungen gehen auf dem Hauptbildschirm auf.
  const eigenerMonitor = screen.getAllDisplays().length > 1 && target.id !== primary.id;
  if (!eigenerMonitor && playerWin && !playerWin.isDestroyed()) playerWin.setFullScreen(false);
  createSettingsWindow(eigenerMonitor ? primary : null);
}

function broadcastConfig(cfg) {
  for (const win of [playerWin, settingsWin]) {
    if (win && !win.isDestroyed()) win.webContents.send('config:changed', cfg);
  }
}

// ---------------------------------------------------------------------------
// App-Lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (playerWin && !playerWin.isDestroyed()) {
      if (playerWin.isMinimized()) playerWin.restore();
      playerWin.focus();
    }
  });

  // Monitor an- oder abgesteckt: Anzeige wieder dorthin schieben, wo sie hingehört
  const neuAusrichten = () => {
    if (playerWin && !playerWin.isDestroyed()) placeOnDisplay(playerWin, targetDisplay(loadConfig()));
  };

  app.whenReady().then(() => {
    ensureDirs();
    Menu.setApplicationMenu(null);
    createPlayerWindow();

    // Notausgang, falls die Oberfläche mal hängt
    if (!globalShortcut.register('Control+Alt+S', openSettings)) {
      console.warn('Strg+Alt+S ist belegt - der Notausgang steht nicht bereit');
    }
    if (!globalShortcut.register('Control+Alt+Q', () => app.quit())) {
      console.warn('Strg+Alt+Q ist belegt');
    }

    screen.on('display-added', neuAusrichten);
    screen.on('display-removed', neuAusrichten);
    screen.on('display-metrics-changed', neuAusrichten);
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:save', (_e, cfg) => {
  const saved = saveConfig(cfg);
  broadcastConfig(saved);
  if (playerWin && !playerWin.isDestroyed()) {
    const target = targetDisplay(saved);
    // nur umziehen, wenn sich der Bildschirm wirklich ändert - sonst würde das
    // Vollbild über das offene Einstellungsfenster springen
    if (displayOf(playerWin).id !== target.id) placeOnDisplay(playerWin, target);
  }
  return saved;
});

ipcMain.handle('app:paths', () => ({
  mediaDir: MEDIA_DIR,
  photoDir: PHOTO_DIR,
  brandDir: BRAND_DIR,
  fontDir: FONT_DIR,
  userDir: USER_DIR,
  configPath: CONFIG_PATH,
  version: app.getVersion()
}));

ipcMain.handle('media:add', async () => {
  ensureDirs();
  const res = await dialog.showOpenDialog(settingsWin || playerWin, {
    title: 'Videos und Bilder auswählen',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos und Bilder', extensions: LOOP_EXT },
      { name: 'Videos', extensions: VIDEO_EXT },
      { name: 'Bilder', extensions: IMAGE_EXT }
    ]
  });
  if (res.canceled) return [];
  const added = [];
  for (const src of res.filePaths) {
    try {
      const name = safeName(src, MEDIA_DIR);
      fs.copyFileSync(src, path.join(MEDIA_DIR, name));
      added.push({ file: name, original: path.basename(src) });
    } catch (err) {
      dialog.showErrorBox('Kopieren fehlgeschlagen', src + '\n\n' + err.message);
    }
  }
  return added;
});

ipcMain.handle('media:list', () => {
  ensureDirs();
  return fs.readdirSync(MEDIA_DIR)
    .filter(f => LOOP_EXT.includes(path.extname(f).slice(1).toLowerCase()));
});

ipcMain.handle('media:delete', (_e, file) => {
  const target = path.join(MEDIA_DIR, path.basename(file || ''));
  if (!target.startsWith(MEDIA_DIR)) return false;
  try { fs.unlinkSync(target); return true; } catch (e) { return false; }
});

ipcMain.handle('media:openFolder', () => shell.openPath(MEDIA_DIR));

// --- Videos umwandeln, die Windows nicht direkt abspielen kann --------------
function ffmpegPath() {
  // Unter macOS liegen beide Bauarten nebeneinander, weil ein Paket sowohl auf
  // Apple Silicon als auch auf Intel laufen soll.
  const namen = process.platform === 'win32' ? ['ffmpeg.exe']
              : process.platform === 'darwin' ? ['ffmpeg-' + process.arch, 'ffmpeg']
              : ['ffmpeg'];

  // 1) im gepackten Programm: neben den Ressourcen (siehe extraResources)
  if (process.resourcesPath) {
    for (const n of namen) {
      const p = path.join(process.resourcesPath, 'ffmpeg', n);
      if (fs.existsSync(p)) return p;
    }
  }
  // 2) in der Entwicklung: vendor-Ordner, siehe scripts/fetch-ffmpeg.js
  const ordner = process.platform === 'darwin' ? 'darwin' : process.platform + '-' + process.arch;
  for (const n of namen) {
    const lokal = path.join(__dirname, 'vendor', 'ffmpeg', ordner, n);
    if (fs.existsSync(lokal)) return lokal;
  }

  // 3) systemweit installiertes ffmpeg
  if (process.platform !== 'win32') {
    for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg',
                     '/opt/homebrew/bin/ffmpeg', '/snap/bin/ffmpeg']) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

ipcMain.handle('media:canConvert', () => !!ffmpegPath());

async function konvertiereDatei(file) {
  const bin = ffmpegPath();
  if (!bin) return { ok: false, fehler: 'ffmpeg ist in dieser Installation nicht enthalten.' };

  const quelle = path.join(MEDIA_DIR, path.basename(file || ''));
  if (!quelle.startsWith(MEDIA_DIR) || !fs.existsSync(quelle)) {
    return { ok: false, fehler: 'Datei nicht gefunden.' };
  }
  const zielName = safeName(path.basename(quelle, path.extname(quelle)) + '.mp4', MEDIA_DIR);
  const ziel = path.join(MEDIA_DIR, zielName);

  const args = [
    '-y', '-i', quelle,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    ziel
  ];

  return await new Promise((resolve) => {
    const proc = spawn(bin, args, { windowsHide: true });
    let dauer = 0;
    let letzteMeldung = '';

    proc.stderr.on('data', (buf) => {
      const text = buf.toString();
      letzteMeldung = text.trim().split('\n').pop() || letzteMeldung;
      if (!dauer) {
        const d = text.match(/Duration:\s*(\d+):(\d+):(\d+)/);
        if (d) dauer = (+d[1]) * 3600 + (+d[2]) * 60 + (+d[3]);
      }
      const t = text.match(/time=(\d+):(\d+):(\d+)/);
      if (t && dauer > 0 && settingsWin && !settingsWin.isDestroyed()) {
        const sek = (+t[1]) * 3600 + (+t[2]) * 60 + (+t[3]);
        settingsWin.webContents.send('convert:progress', {
          file, prozent: Math.min(99, Math.round((sek / dauer) * 100))
        });
      }
    });

    proc.on('error', (err) => resolve({ ok: false, fehler: err.message }));
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(ziel) && fs.statSync(ziel).size > 0) {
        try { fs.unlinkSync(quelle); } catch (e) { /* Original bleibt liegen */ }
        resolve({ ok: true, datei: zielName });
      } else {
        try { if (fs.existsSync(ziel)) fs.unlinkSync(ziel); } catch (e) { /* egal */ }
        resolve({ ok: false, fehler: letzteMeldung || ('ffmpeg endete mit Code ' + code) });
      }
    });
  });
}

ipcMain.handle('media:convert', (_e, file) => konvertiereDatei(file));

ipcMain.handle('photo:add', async () => {
  ensureDirs();
  const res = await dialog.showOpenDialog(settingsWin || playerWin, {
    title: 'Foto für den Act auswählen',
    properties: ['openFile'],
    filters: [{ name: 'Bilder', extensions: IMAGE_EXT }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const src = res.filePaths[0];
  try {
    const name = safeName(src, PHOTO_DIR);
    fs.copyFileSync(src, path.join(PHOTO_DIR, name));
    return name;
  } catch (err) {
    dialog.showErrorBox('Kopieren fehlgeschlagen', src + '\n\n' + err.message);
    return null;
  }
});

ipcMain.handle('photo:delete', (_e, file) => {
  const target = path.join(PHOTO_DIR, path.basename(file || ''));
  if (!target.startsWith(PHOTO_DIR)) return false;
  try { fs.unlinkSync(target); return true; } catch (e) { return false; }
});

ipcMain.handle('photo:openFolder', () => shell.openPath(PHOTO_DIR));

// --- Logo und Schriftart ---------------------------------------------------
async function pickAndCopy(title, exts, dir) {
  ensureDirs();
  const res = await dialog.showOpenDialog(settingsWin || playerWin, {
    title, properties: ['openFile'], filters: [{ name: title, extensions: exts }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const src = res.filePaths[0];
  try {
    const name = safeName(src, dir);
    fs.copyFileSync(src, path.join(dir, name));
    return name;
  } catch (err) {
    dialog.showErrorBox('Kopieren fehlgeschlagen', src + '\n\n' + err.message);
    return null;
  }
}

function removeFrom(dir, file) {
  const target = path.join(dir, path.basename(file || ''));
  if (!target.startsWith(dir)) return false;
  try { fs.unlinkSync(target); return true; } catch (e) { return false; }
}

ipcMain.handle('logo:add', () => pickAndCopy('Logo', LOGO_EXT, BRAND_DIR));
ipcMain.handle('logo:remove', (_e, f) => removeFrom(BRAND_DIR, f));
ipcMain.handle('font:add', () => pickAndCopy('Schriftart', FONT_EXT, FONT_DIR));
ipcMain.handle('font:remove', (_e, f) => removeFrom(FONT_DIR, f));

// --- Timetable weitergeben (eine Datei inklusive Act-Fotos) ----------------
ipcMain.handle('timetable:export', async () => {
  const cfg = loadConfig();
  const entries = cfg.timetable || [];
  const photos = {};
  for (const e of entries) {
    if (!e.photo || photos[e.photo]) continue;
    const p = path.join(PHOTO_DIR, e.photo);
    try { photos[e.photo] = fs.readFileSync(p).toString('base64'); }
    catch (err) { /* Foto fehlt - Eintrag bleibt trotzdem drin */ }
  }
  const res = await dialog.showSaveDialog(settingsWin, {
    title: 'Timetable weitergeben',
    defaultPath: 'timetable.bardisplay.json',
    filters: [{ name: 'Bar Display Timetable', extensions: ['json'] }]
  });
  if (res.canceled) return 0;
  fs.writeFileSync(res.filePath, JSON.stringify({
    kind: 'bar-display-timetable', version: 1, entries, photos
  }, null, 2), 'utf8');
  return entries.length;
});

ipcMain.handle('timetable:import', async () => {
  const res = await dialog.showOpenDialog(settingsWin, {
    title: 'Timetable übernehmen',
    properties: ['openFile'],
    filters: [{ name: 'Bar Display Timetable', extensions: ['json'] }]
  });
  if (res.canceled) return null;
  try {
    const data = readJson(res.filePaths[0]);
    if (data.kind !== 'bar-display-timetable' || !Array.isArray(data.entries)) {
      dialog.showErrorBox('Falsche Datei', 'Das ist keine weitergegebene Timetable-Datei.');
      return null;
    }
    ensureDirs();
    for (const [name, b64] of Object.entries(data.photos || {})) {
      const target = path.join(PHOTO_DIR, path.basename(name));
      if (!target.startsWith(PHOTO_DIR)) continue;
      try { fs.writeFileSync(target, Buffer.from(b64, 'base64')); } catch (err) { /* egal */ }
    }
    return data.entries;
  } catch (err) {
    dialog.showErrorBox('Import fehlgeschlagen', err.message);
    return null;
  }
});

// Fotos wegräumen, die von keinem Timetable-Eintrag mehr benutzt werden
ipcMain.handle('photo:cleanup', () => {
  ensureDirs();
  const used = new Set((loadConfig().timetable || []).map(e => e.photo).filter(Boolean));
  let removed = 0;
  for (const f of fs.readdirSync(PHOTO_DIR)) {
    if (used.has(f)) continue;
    try { fs.unlinkSync(path.join(PHOTO_DIR, f)); removed++; } catch (e) { /* egal */ }
  }
  return removed;
});

ipcMain.handle('settings:open', () => { openSettings(); });

ipcMain.handle('settings:close', () => {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
});

ipcMain.handle('app:quit', () => app.quit());

// --- Bildschirme -----------------------------------------------------------
ipcMain.handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay();
  const aktiv = targetDisplay(loadConfig());
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    nummer: i + 1,
    breite: d.size.width,
    hoehe: d.size.height,
    primary: d.id === primary.id,
    aktiv: d.id === aktiv.id
  }));
});

// Blendet auf jedem Bildschirm kurz eine große Nummer ein
ipcMain.handle('displays:identify', () => {
  const fenster = screen.getAllDisplays().map((d, i) => {
    const w = new BrowserWindow({
      x: d.bounds.x + Math.round((d.bounds.width - 320) / 2),
      y: d.bounds.y + Math.round((d.bounds.height - 320) / 2),
      width: 320,
      height: 320,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      show: false
    });
    const html = '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
      'height:100vh;background:#450b6f;color:#74ff40;font:700 190px/1 Segoe UI,sans-serif;' +
      'border-radius:28px">' + (i + 1) + '</body>';
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    w.setIgnoreMouseEvents(true);
    w.showInactive();
    return w;
  });
  setTimeout(() => fenster.forEach(w => { if (!w.isDestroyed()) w.close(); }), 2500);
  return fenster.length;
});

// Linux kennt kein setLoginItemSettings - dort legt man eine .desktop-Datei
// in ~/.config/autostart ab.
function autostartDatei() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'bar-display.desktop');
}

function autostartLesen() {
  if (process.platform === 'linux') return fs.existsSync(autostartDatei());
  return app.getLoginItemSettings().openAtLogin;
}

function autostartSetzen(an) {
  if (process.platform === 'linux') {
    const datei = autostartDatei();
    if (!an) {
      try { fs.unlinkSync(datei); } catch (e) { /* war schon weg */ }
      return false;
    }
    // Bei einem AppImage steht der echte Pfad in APPIMAGE, nicht in execPath
    const start = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei,
      '[Desktop Entry]\n' +
      'Type=Application\n' +
      'Name=Bar Display\n' +
      'Comment=Anzeige fuer die Bar\n' +
      'Exec=\"' + start + '\"\n' +
      'Terminal=false\n' +
      'X-GNOME-Autostart-enabled=true\n', 'utf8');
    return fs.existsSync(datei);
  }

  app.setLoginItemSettings({ openAtLogin: !!an, path: process.execPath, args: [] });
  return app.getLoginItemSettings().openAtLogin;
}

ipcMain.handle('autostart:get', () => autostartLesen());
ipcMain.handle('autostart:set', (_e, enabled) => autostartSetzen(enabled));

ipcMain.handle('config:export', async () => {
  const res = await dialog.showSaveDialog(settingsWin, {
    title: 'Konfiguration sichern',
    defaultPath: 'bar-display-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled) return false;
  fs.writeFileSync(res.filePath, JSON.stringify(loadConfig(), null, 2), 'utf8');
  return true;
});

ipcMain.handle('config:import', async () => {
  const res = await dialog.showOpenDialog(settingsWin, {
    title: 'Konfiguration laden',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled) return null;
  try {
    const cfg = readJson(res.filePaths[0]);
    const saved = saveConfig(cfg);
    broadcastConfig(saved);
    return saved;
  } catch (err) {
    dialog.showErrorBox('Import fehlgeschlagen', err.message);
    return null;
  }
});
