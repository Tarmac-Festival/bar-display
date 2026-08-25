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
const { isVideoActive, describeWindows, timetableView, entryStartEnd, dayLabel, zeitImFenster,
        fensterEnde, countdownText, aktiveDurchsage, durchsageTeile } = ctx;

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

console.log('-- Ruhezeiten --');
// Ruhezeit tagsüber: 06:00 bis 14:00
check('Ruhe 06-14 / 05:59', zeitImFenster('06:00', '14:00', MO(5, 59)), false);
check('Ruhe 06-14 / 06:00', zeitImFenster('06:00', '14:00', MO(6, 0)), true);
check('Ruhe 06-14 / 13:59', zeitImFenster('06:00', '14:00', MO(13, 59)), true);
check('Ruhe 06-14 / 14:00', zeitImFenster('06:00', '14:00', MO(14, 0)), false);
check('Ruhe 06-14 / 23:00', zeitImFenster('06:00', '14:00', MO(23, 0)), false);

// über Mitternacht: 04:00 bis 14:00 wäre normal, hier 22:00 bis 04:00
check('Ruhe 22-04 / 21:59', zeitImFenster('22:00', '04:00', MO(21, 59)), false);
check('Ruhe 22-04 / 22:00', zeitImFenster('22:00', '04:00', MO(22, 0)), true);
check('Ruhe 22-04 / 02:00', zeitImFenster('22:00', '04:00', MO(2, 0)), true);
check('Ruhe 22-04 / 04:00', zeitImFenster('22:00', '04:00', MO(4, 0)), false);

// unbrauchbare Angaben schalten die Ruhezeit ab, statt alles schwarz zu machen
check('Ruhe gleiche Zeit', zeitImFenster('08:00', '08:00', MO(8, 0)), false);
check('Ruhe leer', zeitImFenster('', '14:00', MO(8, 0)), false);
check('Ruhe unsinnig', zeitImFenster('25:00', '14:00', MO(8, 0)), false);

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

console.log('-- Durchsagen --');
// SA = Samstag, 29.08.2026
const planSchluss = { id: 'a', text: 'Die Bar schliesst in {zeit}',
                      days: [5, 6], from: '01:40', to: '02:00' };

check('Fensterende bei normalem Fenster',
      fensterEnde(planSchluss, SA(1, 45)).getHours() * 60 + fensterEnde(planSchluss, SA(1, 45)).getMinutes(), 120);
check('Fensterende bleibt am selben Tag', fensterEnde(planSchluss, SA(1, 45)).getDate(), 29);

const ueberMitternacht = { days: [5], from: '23:50', to: '00:10' };
check('Fenster ueber Mitternacht: vor 24 Uhr zeigt auf morgen',
      fensterEnde(ueberMitternacht, FR(23, 55)).getDate(), 29);
check('Fenster ueber Mitternacht: nach 24 Uhr zeigt auf heute',
      fensterEnde(ueberMitternacht, SA(0, 5)).getDate(), 29);
check('Ganztagsfenster hat kein Ende', fensterEnde({ from: '00:00', to: '00:00' }, SA(3, 0)), null);
check('Unbrauchbare Zeit hat kein Ende', fensterEnde({ from: 'quatsch', to: '02:00' }, SA(3, 0)), null);

check('Restzeit unter einer Stunde', countdownText(12 * 60000 + 34000), '12:34');
check('Restzeit ueber einer Stunde', countdownText(3900000), '1:05:00');
check('Restzeit null', countdownText(0), '00:00');
check('Restzeit negativ bleibt null', countdownText(-5000), '00:00');
check('Angebrochene Sekunde zaehlt noch', countdownText(1500), '00:02');

const nurPlan = { announcement: { enabled: false, text: '', plans: [planSchluss] } };
check('Plan greift im Fenster', aktiveDurchsage(nurPlan, SA(1, 45)).text, 'Die Bar schliesst in {zeit}');
check('Plan greift nicht davor', aktiveDurchsage(nurPlan, SA(1, 39)), null);
check('Plan greift nicht danach', aktiveDurchsage(nurPlan, SA(2, 0)), null);
check('Plan greift nicht am falschen Tag', aktiveDurchsage(nurPlan, MO(1, 45)), null);
check('Plan liefert das Fensterende mit',
      aktiveDurchsage(nurPlan, SA(1, 45)).ende.getMinutes(), 0);

const ausgeschaltet = { announcement: { plans: [Object.assign({}, planSchluss, { enabled: false })] } };
check('Abgeschalteter Plan greift nicht', aktiveDurchsage(ausgeschaltet, SA(1, 45)), null);

const ohneCountdown = { announcement: { plans: [Object.assign({}, planSchluss, { countdown: false })] } };
check('Plan ohne Countdown hat kein Ende', aktiveDurchsage(ohneCountdown, SA(1, 45)).ende, null);

const beides = { announcement: { enabled: true, text: 'Kind vermisst', plans: [planSchluss] } };
check('Sofort-Durchsage hat Vorrang', aktiveDurchsage(beides, SA(1, 45)).quelle, 'sofort');

const abgelaufen = { announcement: { enabled: true, text: 'alt',
                     until: new Date(2026, 7, 29, 1, 0).toISOString(), plans: [planSchluss] } };
check('Abgelaufene Sofort-Durchsage laesst den Plan durch',
      aktiveDurchsage(abgelaufen, SA(1, 45)).quelle, 'plan');
check('Ohne alles nichts', aktiveDurchsage({ announcement: {} }, SA(1, 45)), null);

check('Platzhalter wird geteilt',
      durchsageTeile('Bar schliesst in {zeit}', true), [{ text: 'Bar schliesst in ' }, { zeit: true }]);
check('Platzhalter mittendrin',
      durchsageTeile('Noch {zeit} bis Schluss', true),
      [{ text: 'Noch ' }, { zeit: true }, { text: ' bis Schluss' }]);
check('Ohne Platzhalter haengt die Zeit hinten dran',
      durchsageTeile('Letzte Runde', true), [{ text: 'Letzte Runde ' }, { zeit: true }]);
check('Ohne Countdown faellt der Platzhalter weg',
      durchsageTeile('Bar schliesst in {zeit}', false), [{ text: 'Bar schliesst in' }]);
check('Grossschreibung des Platzhalters zaehlt auch',
      durchsageTeile('Noch {ZEIT}', true), [{ text: 'Noch ' }, { zeit: true }]);

console.log('-- QR-Code --');
// Die Bibliothek schneidet Zeichen standardmaessig auf ein Byte ab. Ohne die
// Umstellung auf UTF-8 werden Umlaute unlesbar - das ist einmal passiert.
const qrcode = require(path.join(__dirname, '..', 'src', 'qr.js'));
check('UTF-8-Kodierer vorhanden', typeof qrcode.stringToBytesFuncs['UTF-8'], 'function');
check('Umlaut braucht zwei Bytes', qrcode.stringToBytesFuncs['UTF-8']('ä').length, 2);
check('Standard verkuerzt auf ein Byte', qrcode.stringToBytesFuncs['default']('ä').length, 1);

const playerQuelle = fs.readFileSync(path.join(__dirname, '..', 'src', 'player.js'), 'utf8');
check('Player waehlt UTF-8 aus',
      /stringToBytes\s*=\s*qrcode\.stringToBytesFuncs\['UTF-8'\]/.test(playerQuelle), true);

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
const qrTest = qrcode(0, 'M');
qrTest.addData('https://tarmac-festival.de/de-DE/');
qrTest.make();
check('Modulanzahl fuer die Festivaladresse', qrTest.getModuleCount(), 29);

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
