// Tests für die Zeitfenster- und Timetable-Logik:  npm test
const fs = require('fs');
const vm = require('vm');

const path = require('path');

// Pfad immer relativ zu dieser Datei aufloesen - ein absoluter Pfad wuerde auf
// dem Entwicklungsrechner funktionieren und ueberall sonst scheitern.
const QUELLE = path.join(__dirname, '..', 'src', 'common.js');
const code = fs.readFileSync(QUELLE, 'utf8');
const ctx = vm.createContext({ console, Date });
vm.runInContext(code, ctx);
const { isVideoActive, describeWindows, timetableView, entryStartEnd, dayLabel } = ctx;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log('  FEHLER ' + name + ': erwartet ' + JSON.stringify(want) + ', bekommen ' + JSON.stringify(got)); }
}
// 2026-08-24 ist ein Montag
const MO = (h, m) => new Date(2026, 7, 24, h, m);
const FR = (h, m) => new Date(2026, 7, 28, h, m);
const SA = (h, m) => new Date(2026, 7, 29, h, m);

console.log('-- Zeitfenster --');
const immer = { enabled: true, always: true };
check('immer / Montag 03:00', isVideoActive(immer, MO(3, 0)), true);

const nurFr = { enabled: true, always: false, windows: [{ days: [5], from: '16:00', to: '22:00' }] };
check('Fr 16-22 / Fr 15:59', isVideoActive(nurFr, FR(15, 59)), false);
check('Fr 16-22 / Fr 16:00', isVideoActive(nurFr, FR(16, 0)), true);
check('Fr 16-22 / Fr 21:59', isVideoActive(nurFr, FR(21, 59)), true);
check('Fr 16-22 / Fr 22:00', isVideoActive(nurFr, FR(22, 0)), false);
check('Fr 16-22 / Sa 18:00', isVideoActive(nurFr, SA(18, 0)), false);
check('Fr 16-22 / Mo 18:00', isVideoActive(nurFr, MO(18, 0)), false);

const nacht = { enabled: true, always: false, windows: [{ days: [5], from: '22:00', to: '02:00' }] };
check('Fr 22-02 / Fr 22:30', isVideoActive(nacht, FR(22, 30)), true);
check('Fr 22-02 / Fr 21:00', isVideoActive(nacht, FR(21, 0)), false);
check('Fr 22-02 / Sa 01:30 (Folgetag)', isVideoActive(nacht, SA(1, 30)), true);
check('Fr 22-02 / Sa 02:00', isVideoActive(nacht, SA(2, 0)), false);
check('Fr 22-02 / Sa 23:00', isVideoActive(nacht, SA(23, 0)), false);

const aus = { enabled: false, always: true };
check('deaktiviert', isVideoActive(aus, MO(12, 0)), false);

const ohneFenster = { enabled: true, always: false, windows: [] };
check('kein Zeitfenster', isVideoActive(ohneFenster, MO(12, 0)), false);

const zwei = { enabled: true, always: false, windows: [
  { days: [5, 6], from: '16:00', to: '22:00' },
  { days: [1], from: '10:00', to: '12:00' }
] };
check('2 Fenster / Mo 11:00', isVideoActive(zwei, MO(11, 0)), true);
check('2 Fenster / Mo 13:00', isVideoActive(zwei, MO(13, 0)), false);
check('2 Fenster / Sa 17:00', isVideoActive(zwei, SA(17, 0)), true);
check('Beschreibung', describeWindows(zwei), 'Fr+Sa 16:00-22:00 / Mo 10:00-12:00');

console.log('-- Timetable --');
const tt = [
  { id: 'a', date: '2026-08-28', start: '18:00', end: '19:30', act: 'Warmup DJ' },
  { id: 'b', date: '2026-08-28', start: '20:00', end: '21:30', act: 'Hauptact' },
  { id: 'c', date: '2026-08-28', start: '23:00', end: '01:00', act: 'Nachtschicht' },
  { id: 'd', date: '2026-08-29', start: '16:00', end: '17:00', act: 'Samstag Opener' }
];
let v = timetableView(tt, FR(20, 30), 5);
check('laufender Act', v.current.entry.act, 'Hauptact');
check('nächste Acts', v.next.map(x => x.entry.act), ['Nachtschicht', 'Samstag Opener']);

v = timetableView(tt, FR(17, 0), 5);
check('vor dem Start: kein current', v.current, null);
check('vor dem Start: next', v.next.map(x => x.entry.act), ['Warmup DJ', 'Hauptact', 'Nachtschicht', 'Samstag Opener']);

v = timetableView(tt, SA(0, 30), 5);
check('über Mitternacht läuft noch', v.current.entry.act, 'Nachtschicht');
check('nach Mitternacht: next', v.next.map(x => x.entry.act), ['Samstag Opener']);

v = timetableView(tt, new Date(2026, 8, 5, 12, 0), 5);
check('alles vorbei', [v.current, v.next.length], [null, 0]);

check('maxNext begrenzt', timetableView(tt, FR(10, 0), 2).next.length, 2);

const se = entryStartEnd({ date: '2026-08-28', start: '23:00', end: '01:00' });
check('Ende auf Folgetag', se.end.getDate(), 29);

check('Tagesbezeichnung heute', dayLabel(FR(20, 0), FR(18, 0)), 'HEUTE');
check('Tagesbezeichnung morgen', dayLabel(SA(16, 0), FR(18, 0)), 'MORGEN');
check('Tagesbezeichnung später', dayLabel(new Date(2026, 8, 3, 16, 0), FR(18, 0)), 'DONNERSTAG 03.09.');

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
