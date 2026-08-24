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
