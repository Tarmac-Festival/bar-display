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
        fensterEnde, countdownText, aktiveDurchsage, durchsageTeile,
        fotoAusschnitt, fotoStil, ausschnittIstStandard,
        mitgeliefertesLogo, durchsageStil, laufDauer,
        datumParsen, datumAnzeige, zeitParsen, zeitAnzeige,
        wirksameHaeufigkeit, rundeBauen,
        istUebergang, uebergangsAuswahl, uebergangBeutel, uebergangsFolge,
        lichtFenster, lichtTrifft, lichtJetzt, timetableZeilen, lichtUebersicht,
        lichtSpuren, lichtOhneZeile, lichtOffen, timeLabel, nachtVon, todayISO,
        lichtAusschnitt, lichtMarkeLage, nachtEnde, lichtSpalte,
        preisStil, gruppeHatInhalt, preisGruppen, preisSeiten, restzeitText,
        infoEinheit, infoTakt, nachDerUhr, faelligeInfoSeite,
        zeitVersatz, probezeitLaeuft, versatzFuer } = ctx;
// Ein top-level const landet in einem vm-Kontext nicht auf dem globalen
// Objekt (Funktionsdeklarationen schon). Im Browser sehen die anderen
// Skripte es trotzdem - hier muss man es ausdruecklich auswerten.
const MITGELIEFERTE_LOGOS = vm.runInContext('MITGELIEFERTE_LOGOS', ctx);
const UEBERGAENGE = vm.runInContext('UEBERGAENGE', ctx);
const PREIS_STILE = vm.runInContext('PREIS_STILE', ctx);

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

console.log('-- Datum und Uhrzeit eintippen --');
check('Punktschreibweise', datumParsen('01.02.2026'), '2026-02-01');
check('ohne fuehrende Nullen', datumParsen('1.2.2026'), '2026-02-01');
check('zweistelliges Jahr', datumParsen('1.2.26'), '2026-02-01');
check('mit Schraegstrich', datumParsen('1/2/2026'), '2026-02-01');
check('mit Bindestrich', datumParsen('1-2-2026'), '2026-02-01');
check('schon im Speicherformat', datumParsen('2026-02-01'), '2026-02-01');
check('Speicherformat ohne Nullen', datumParsen('2026-2-1'), '2026-02-01');
check('nur Ziffern, sechsstellig', datumParsen('010226'), '2026-02-01');
check('nur Ziffern, achtstellig', datumParsen('01022026'), '2026-02-01');
check('mit Leerzeichen drumherum', datumParsen('  1.2.2026  '), '2026-02-01');
check('leer bleibt leer', datumParsen(''), '');
check('Unsinn wird abgelehnt', datumParsen('morgen'), null);
check('31. Februar gibt es nicht', datumParsen('31.02.2026'), null);
check('Monat 13 gibt es nicht', datumParsen('01.13.2026'), null);
check('Tag 0 gibt es nicht', datumParsen('00.01.2026'), null);
check('vierstellig ist zu mehrdeutig', datumParsen('0102'), null);
check('Schaltjahr wird erkannt', datumParsen('29.02.2024'), '2024-02-29');
check('kein Schaltjahr', datumParsen('29.02.2026'), null);

check('Anzeige aus dem Speicherformat', datumAnzeige('2026-02-01'), '01.02.2026');
check('Anzeige bei leer', datumAnzeige(''), '');
// Hin und zurueck muss dasselbe ergeben, sonst aendert sich beim Ansehen etwas
check('hin und zurueck', datumParsen(datumAnzeige('2026-08-28')), '2026-08-28');

check('Uhrzeit mit Doppelpunkt', zeitParsen('21:00'), '21:00');
check('ohne fuehrende Null', zeitParsen('9:05'), '09:05');
check('mit Punkt', zeitParsen('21.30'), '21:30');
check('nur Ziffern, vierstellig', zeitParsen('2130'), '21:30');
check('nur Ziffern, dreistellig', zeitParsen('905'), '09:05');
check('einstellige Minute mit Trenner', zeitParsen('7:5'), '07:05');
check('einstellige Minute mit Punkt', zeitParsen('9.5'), '09:05');
check('ohne Trenner bleibt es vierstellig gedacht', zeitParsen('2130'), '21:30');
check('nur die Stunde', zeitParsen('9'), '09:00');
check('nur die Stunde, zweistellig', zeitParsen('21'), '21:00');
check('Mitternacht', zeitParsen('0'), '00:00');
check('leer bleibt leer', zeitParsen(''), '');
check('Stunde 24 gibt es nicht', zeitParsen('24:00'), null);
check('Minute 60 gibt es nicht', zeitParsen('21:60'), null);
check('Unsinn wird abgelehnt', zeitParsen('abends'), null);
check('Uhrzeit-Anzeige', zeitAnzeige('9:05'), '09:05');
check('hin und zurueck', zeitParsen(zeitAnzeige('01:30')), '01:30');

console.log('-- Darstellung der Durchsagen --');
check('ohne Angabe steht sie fest', durchsageStil({}), { modus: 'fest', tempo: 'normal' });
check('ohne Quelle auch', durchsageStil(null), { modus: 'fest', tempo: 'normal' });
check('Laufschrift wird uebernommen',
      durchsageStil({ modus: 'lauf', tempo: 'schnell' }), { modus: 'lauf', tempo: 'schnell' });
check('unbekannter Modus faellt auf fest zurueck',
      durchsageStil({ modus: 'blinken' }).modus, 'fest');
check('unbekanntes Tempo faellt auf normal zurueck',
      durchsageStil({ modus: 'lauf', tempo: 'rasend' }).tempo, 'normal');

// Der Plan liefert die Darstellung mit, sonst wuesste die Anzeige sie nicht
const laufPlan = { id: 'l', text: 'Hallo', days: [0,1,2,3,4,5,6],
                   from: '00:01', to: '23:59', modus: 'lauf', tempo: 'langsam' };
const mitLauf = aktiveDurchsage({ announcement: { plans: [laufPlan] } }, FR(12, 0));
check('Plan reicht den Modus durch', mitLauf.modus, 'lauf');
check('Plan reicht das Tempo durch', mitLauf.tempo, 'langsam');
const sofortLauf = aktiveDurchsage(
  { announcement: { enabled: true, text: 'x', modus: 'lauf' } }, FR(12, 0));
check('Sofort-Durchsage reicht den Modus durch', sofortLauf.modus, 'lauf');

// Doppelte Textlaenge heisst doppelte Dauer - sonst waere ein langer Text
// schneller unterwegs als ein kurzer
check('Dauer waechst mit der Textlaenge',
      laufDauer(3840, 1920, 'normal') / laufDauer(1920, 1920, 'normal'), 2);
check('schneller ist kuerzer als langsamer',
      laufDauer(1920, 1920, 'schnell') < laufDauer(1920, 1920, 'langsam'), true);
check('nie unter vier Sekunden', laufDauer(10, 1920, 'schnell'), 4);
check('ohne Masse ein brauchbarer Ersatzwert', laufDauer(0, 0, 'normal'), 12);

console.log('-- Bildausschnitt --');
check('ohne Angabe die Mitte', fotoAusschnitt({}), { x: 50, y: 50, z: 1 });
check('ohne Eintrag die Mitte', fotoAusschnitt(null), { x: 50, y: 50, z: 1 });
check('Werte werden uebernommen',
      fotoAusschnitt({ crop: { x: 30, y: 12, z: 1.8 } }), { x: 30, y: 12, z: 1.8 });
check('zu grosse Werte werden begrenzt',
      fotoAusschnitt({ crop: { x: 300, y: -40, z: 99 } }), { x: 100, y: 0, z: 4 });
check('Unsinn faellt auf den Standard zurueck',
      fotoAusschnitt({ crop: { x: 'links', y: null, z: 'nah' } }), { x: 50, y: 50, z: 1 });
check('Zoom unter 1 ist nicht erlaubt', fotoAusschnitt({ crop: { z: 0.2 } }).z, 1);

check('Standard erkannt', ausschnittIstStandard(fotoAusschnitt({})), true);
check('Verschoben ist nicht Standard',
      ausschnittIstStandard(fotoAusschnitt({ crop: { x: 20 } })), false);

check('Stil ohne Zoom', fotoStil({}), 'object-position:50% 50%');
check('Stil mit Ausschnitt', fotoStil({ crop: { x: 25, y: 80 } }), 'object-position:25% 80%');
check('Stil mit Zoom', fotoStil({ crop: { x: 25, y: 80, z: 2 } }),
      'object-position:25% 80%;transform:scale(2);transform-origin:25% 80%');
// Der Stil landet in einem HTML-Attribut - er darf es nicht sprengen koennen
check('Stil enthaelt keine Anfuehrungszeichen',
      /["'<>]/.test(fotoStil({ crop: { x: '\" onerror=alert(1) ', y: 5 } })), false);

const spielerQuelle = fs.readFileSync(path.join(__dirname, '..', 'src', 'player.js'), 'utf8');
check('Player benutzt denselben Helfer', /fotoStil\(/.test(spielerQuelle), true);

console.log('-- Logos --');
check('leer meint das L300-Logo', mitgeliefertesLogo(''), 'branding/l300-logo.png');
check('none meint gar keins', mitgeliefertesLogo('none'), null);
check('mitgeliefert wird aufgeloest',
      mitgeliefertesLogo('@tarmac-wortmarke.png'), 'branding/tarmac-wortmarke.png');
check('eigene Datei ist nicht mitgeliefert', mitgeliefertesLogo('mein-logo.png'), null);
check('undefined wie leer', mitgeliefertesLogo(undefined), 'branding/l300-logo.png');

check('zwei Logos liegen bei', MITGELIEFERTE_LOGOS.length, 2);
check('beide Dateien sind da', MITGELIEFERTE_LOGOS.every(function (l) {
  return fs.existsSync(path.join(__dirname, '..', 'src', 'branding', l.datei));
}), true);
check('jedes hat eine Hoehe', MITGELIEFERTE_LOGOS.every(function (l) {
  return typeof l.hoehe === 'number' && l.hoehe > 0 && l.hoehe <= 30;
}), true);
// Der Wert muss sich auf dieselbe Datei aufloesen, die in der Liste steht
check('Wert und Datei passen zusammen', MITGELIEFERTE_LOGOS.every(function (l) {
  return mitgeliefertesLogo(l.wert) === 'branding/' + l.datei;
}), true);

console.log('-- Netzwerkadressen --');
const webserver = require(path.join(__dirname, '..', 'lib', 'webserver.js'));
const netzeMitVpn = {
  'ProtonVPN':  [{ family: 'IPv4', internal: false, address: '10.2.0.2' }],
  'Ethernet 6': [{ family: 'IPv4', internal: false, address: '192.168.178.44' }],
  'Loopback Pseudo-Interface 1': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }]
};
check('VPN faellt raus, das Heimnetz bleibt',
      webserver.adressenAus(netzeMitVpn), ['192.168.178.44']);

check('Schleifenadresse taucht nie auf',
      webserver.adressenAus({ 'Loopback': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }), []);

check('IPv6 wird uebergangen', webserver.adressenAus({
  'Ethernet': [{ family: 'IPv6', internal: false, address: 'fd90::1' },
               { family: 'IPv4', internal: false, address: '192.168.1.5' }] }), ['192.168.1.5']);

// Manche Systeme melden family als Zahl statt als Text
check('family als Zahl geht auch', webserver.adressenAus({
  'Ethernet': [{ family: 4, internal: false, address: '192.168.1.5' }] }), ['192.168.1.5']);

check('192.168 kommt vor 10.x', webserver.adressenAus({
  'LAN1': [{ family: 'IPv4', internal: false, address: '10.0.0.5' }],
  'LAN2': [{ family: 'IPv4', internal: false, address: '192.168.0.5' }] }),
  ['192.168.0.5', '10.0.0.5']);

check('Adresse ohne DHCP steht hinten', webserver.adressenAus({
  'LAN1': [{ family: 'IPv4', internal: false, address: '169.254.3.4' }],
  'LAN2': [{ family: 'IPv4', internal: false, address: '10.0.0.5' }] }),
  ['10.0.0.5', '169.254.3.4']);

// Lieber eine unbrauchbare Adresse als gar keine Auskunft
check('gibt es nur virtuelle, werden sie doch gezeigt', webserver.adressenAus({
  'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.20.0.1' }] }),
  ['172.20.0.1']);

check('keine Schnittstellen, keine Adressen', webserver.adressenAus({}), []);
check('nichts uebergeben faellt nicht um', webserver.adressenAus(null), []);

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

console.log('');
console.log('-- Runde der Schleife --');

// Kurzschrift: 'v:eins' fuer einen Beitrag, 'timetable'/'prices' fuer die Infos
const kurz = (items) => items.map(i => i.type === 'video' ? 'v:' + i.video.file : i.type);
const bei = (...namen) => namen.map(n => ({ file: n, enabled: true, always: true }));

// Die Haeufigkeit kann nicht groesser sein als die Zahl der Beitraege - sonst
// muesste ein Beitrag ein zweites Mal laufen, nur damit die Rechnung aufgeht.
check('Haeufigkeit 3 bei 5 Beitraegen', wirksameHaeufigkeit(3, 5), 3);
check('Haeufigkeit 3 bei 2 Beitraegen', wirksameHaeufigkeit(3, 2), 2);
check('Haeufigkeit 5 bei 1 Beitrag', wirksameHaeufigkeit(5, 1), 1);
check('Haeufigkeit 0 heisst aus', wirksameHaeufigkeit(0, 5), 0);
check('ohne Beitraege nichts zu takten', wirksameHaeufigkeit(3, 0), 0);
check('krumme Eingabe wird abgeschnitten', wirksameHaeufigkeit('2.7', 9), 2);

// Genau der Fall von der Bar: zwei Bilder, Timetable "nach je 3"
let runde = rundeBauen({ aktiv: bei('eins.jpg', 'zwei.jpg'), hatTimetable: true,
                         timetableEvery: 3, pricesEvery: 0, zaehler: 0 });
check('zwei Beitraege, Timetable nach je 3', kurz(runde.items),
      ['v:eins.jpg', 'v:zwei.jpg', 'timetable']);
check('kein Beitrag doppelt in der Runde',
      new Set(kurz(runde.items).filter(x => x.startsWith('v:'))).size, 2);

// Und in der naechsten Runde genauso - der Zaehler laeuft weiter
runde = rundeBauen({ aktiv: bei('eins.jpg', 'zwei.jpg'), hatTimetable: true,
                     timetableEvery: 3, pricesEvery: 0, zaehler: runde.zaehler });
check('naechste Runde gleich', kurz(runde.items), ['v:eins.jpg', 'v:zwei.jpg', 'timetable']);

// Ein einziger Beitrag: er darf nicht dreimal laufen, bis etwas kommt
runde = rundeBauen({ aktiv: bei('nur.jpg'), hatTimetable: true, hatPreise: true,
                     timetableEvery: 3, pricesEvery: 5, zaehler: 0 });
check('ein Beitrag, beide Infos', kurz(runde.items), ['v:nur.jpg', 'timetable', 'prices']);

// Genug Beitraege: dann gilt die Einstellung wortwoertlich
runde = rundeBauen({ aktiv: bei('a', 'b', 'c', 'd', 'e', 'f'), hatTimetable: true,
                     hatPreise: true, timetableEvery: 3, pricesEvery: 5, zaehler: 0 });
check('sechs Beitraege, 3 und 5', kurz(runde.items),
      ['v:a', 'v:b', 'v:c', 'timetable', 'v:d', 'v:e', 'prices', 'v:f', 'timetable']);
check('Zaehler steht am Rundenende', runde.zaehler, 6);

// Weniger Beitraege als die Zahl: gedeckelt, statt einen Beitrag zu wiederholen
runde = rundeBauen({ aktiv: bei('a', 'b', 'c'), hatTimetable: false, hatPreise: true,
                     timetableEvery: 0, pricesEvery: 5, zaehler: 0 });
check('drei Beitraege, Preise nach je 5', kurz(runde.items),
      ['v:a', 'v:b', 'v:c', 'prices']);

// Abgeschaltet bleibt abgeschaltet
runde = rundeBauen({ aktiv: bei('a', 'b'), hatTimetable: true, hatPreise: true,
                     timetableEvery: 0, pricesEvery: 0, zaehler: 0 });
check('0 zeigt gar nichts', kurz(runde.items), ['v:a', 'v:b']);

// Ohne Beitraege wenigstens die Informationen
runde = rundeBauen({ aktiv: [], hatTimetable: true, hatPreise: true,
                     timetableEvery: 3, pricesEvery: 5, zaehler: 0 });
check('ohne Beitraege nur die Infos', kurz(runde.items), ['timetable', 'prices']);
check('ohne alles bleibt der Leerlauf',
      kurz(rundeBauen({ aktiv: [], zaehler: 0 }).items), ['idle']);

console.log('');
console.log('-- Uebergaenge --');

check('bekannte Uebergaenge', UEBERGAENGE.map(u => u.wert),
      ['fade', 'cut', 'schwarz', 'zoom', 'weg', 'schieben', 'hoch', 'kreis',
       'wipe', 'logo']);
check('jeder hat einen Namen', UEBERGAENGE.every(u => !!u.name), true);
check('fade ist einer', istUebergang('fade'), true);
check('quatsch ist keiner', istUebergang('quatsch'), false);
check('mix ist kein einzelner Uebergang', istUebergang('mix'), false);

// Auswahl fuer "Abwechselnd"
check('nichts angehakt -> weiche Blende', uebergangsAuswahl({}), ['fade']);
check('leere Liste -> weiche Blende', uebergangsAuswahl({ uebergaenge: [] }), ['fade']);
check('Unsinn faellt raus',
      uebergangsAuswahl({ uebergaenge: ['zoom', 'quatsch', 'wipe'] }), ['zoom', 'wipe']);
check('nur Unsinn -> weiche Blende',
      uebergangsAuswahl({ uebergaenge: ['quatsch'] }), ['fade']);

// Der Beutel: gemischt, aber vollstaendig
const wuerfelAus = (folge) => { let i = 0; return () => folge[i++ % folge.length]; };

let beutel = uebergangBeutel(['fade', 'zoom', 'wipe', 'logo'], '', wuerfelAus([0, 0, 0, 0]));
check('alle sind drin', beutel.slice().sort(), ['fade', 'logo', 'wipe', 'zoom']);
check('und keiner doppelt', beutel.length, new Set(beutel).size);

// Nahtstelle: der erste darf nicht der zuletzt gelaufene sein
for (const w of ['fade', 'zoom', 'wipe', 'logo']) {
  for (const folge of [[0, 0, 0], [0.9, 0.9, 0.9], [0.5, 0.1, 0.7]]) {
    const b = uebergangBeutel(['fade', 'zoom', 'wipe', 'logo'], w, wuerfelAus(folge));
    if (b[0] === w) { fail++; console.log('  FEHLER Nahtstelle: ' + w + ' kaeme zweimal'); }
    else pass++;
  }
}

check('ein einziger angehakter kommt eben immer',
      uebergangBeutel(['zoom'], 'zoom'), ['zoom']);
check('leere Auswahl faellt auf die weiche Blende zurueck',
      uebergangBeutel([], ''), ['fade']);
check('Unsinn in der Auswahl wird aussortiert',
      uebergangBeutel(['zoom', 'quatsch'], '', wuerfelAus([0, 0])).slice().sort(), ['zoom']);

// Ueber viele Runden hinweg soll jeder gleich oft drankommen
(function () {
  const auswahl = ['fade', 'zoom', 'schieben', 'wipe'];
  const zaehler = {};
  let zuletzt = '';
  let vorrat = [];
  let zweimalHintereinander = 0;
  for (let i = 0; i < 400; i++) {
    if (!vorrat.length) vorrat = uebergangBeutel(auswahl, zuletzt);
    const jetzt = vorrat.shift();
    if (jetzt === zuletzt) zweimalHintereinander++;
    zaehler[jetzt] = (zaehler[jetzt] || 0) + 1;
    zuletzt = jetzt;
  }
  check('nie zweimal hintereinander derselbe', zweimalHintereinander, 0);
  check('jeder kommt gleich oft dran', auswahl.map(w => zaehler[w]), [100, 100, 100, 100]);
})();

console.log('');
console.log('-- Starke Lichteffekte --');

// 2026-08-28 ist ein Freitag
const L = (start, end, note) => ({ id: start, date: '2026-08-28', start, end, note });
const FR2 = (h, m) => new Date(2026, 7, 28, h, m);
const SA2 = (h, m) => new Date(2026, 7, 29, h, m);

// Ohne Endzeit ist die Angabe wertlos - so ein Eintrag darf nicht erscheinen
check('vollstaendiger Eintrag zaehlt', lichtFenster([L('23:30', '01:00')]).length, 1);
check('ohne Ende faellt heraus', lichtFenster([{ date: '2026-08-28', start: '23:30' }]).length, 0);
check('ohne Anfang faellt heraus', lichtFenster([{ date: '2026-08-28', end: '01:00' }]).length, 0);
check('ohne Datum faellt heraus', lichtFenster([{ start: '23:30', end: '01:00' }]).length, 0);
check('leere Liste', lichtFenster(null).length, 0);

// Ueber MitterlichtNacht hinweg - derselbe Weg wie beim Timetable
const lichtNacht = lichtFenster([L('23:30', '01:00')]);
check('Ende liegt am naechsten Tag', lichtNacht[0].se.end.getTime(), SA2(1, 0).getTime());

// Ueberschneidung mit einem Act
const actSE = (start, end) => entryStartEnd({ date: '2026-08-28', start, end });
check('Act mittendrin', lichtTrifft(actSE('23:00', '01:30'), lichtNacht), true);
check('Act in der Nacht danach ueberschneidet sich',
      lichtTrifft(entryStartEnd({ date: '2026-08-29', start: '00:30', end: '02:00' }), lichtNacht), true);
// Dasselbe Uhrzeitpaar am Vortag meint den Freitagmorgen - und beruehrt die
// Nacht nicht. Die Datumsangabe entscheidet, genau wie beim Timetable.
check('dieselbe Uhrzeit am Vortag trifft nicht',
      lichtTrifft(actSE('00:30', '02:00'), lichtNacht), false);
check('Act davor', lichtTrifft(actSE('20:00', '22:00'), lichtNacht), false);
check('Act endet genau zum Beginn', lichtTrifft(actSE('22:00', '23:30'), lichtNacht), false);
check('Act beginnt genau zum Ende', lichtTrifft(actSE('01:00', '02:00'), lichtNacht), false);
check('Act ohne Ende wird mit einer Stunde gerechnet',
      lichtTrifft(entryStartEnd({ date: '2026-08-28', start: '23:00' }), lichtNacht), true);
check('ohne Fenster nichts betroffen', lichtTrifft(actSE('23:00', '01:00'), []), false);

// Was steht noch bevor? Danach entscheidet sich, ob die eigene Seite ueberhaupt
// mitlaeuft - mit lauter vergangenen Zeiten lief sie endlos mit dem Hinweis,
// dass nichts angemeldet ist.
(function () {
  const gemischt = [
    { id: 'a', date: '2020-01-01', start: '22:00', end: '23:00' },
    { id: 'b', date: '2026-08-28', start: '23:30', end: '01:00' }
  ];
  check('nur das Kommende zaehlt', lichtOffen(gemischt, FR2(20, 0)).length, 1);
  check('waehrend es laeuft, zaehlt es auch', lichtOffen(gemischt, SA2(0, 15)).length, 1);
  check('danach nichts mehr', lichtOffen(gemischt, SA2(2, 0)).length, 0);
  check('nur Vergangenes ergibt nichts',
        lichtOffen([{ id: 'a', date: '2020-01-01', start: '22:00', end: '23:00' }], FR2(20, 0)).length, 0);
})();

// Laeuft gerade?
check('mittendrin', !!lichtJetzt(lichtNacht, SA2(0, 15)), true);
check('davor', !!lichtJetzt(lichtNacht, FR2(23, 0)), false);
check('genau am Anfang', !!lichtJetzt(lichtNacht, FR2(23, 30)), true);
check('genau am Ende', !!lichtJetzt(lichtNacht, SA2(1, 0)), false);

// Zeilen fuer den Slide: nur die Acts. Die Lichtphasen stehen in einer eigenen
// Spalte daneben - siehe lichtSpuren().
(function () {
  const acts = [
    { date: '2026-08-28', start: '21:00', end: '23:00', act: 'Vorband' },
    { date: '2026-08-28', start: '23:00', end: '01:30', act: 'Nachtflug' }
  ];
  const jetzt = FR2(20, 0);
  const sicht = timetableView(acts, jetzt, 5);
  const zeilen = timetableZeilen(sicht);

  check('nur Acts in den Zeilen', zeilen.map(z => z.art), ['act', 'act']);
  check('in der Reihenfolge des Timetables',
        zeilen.map(z => z.eintrag.act), ['Vorband', 'Nachtflug']);
})();

// ---------------------------------------------------------------------------
// Die Lichtspalte: wo genau liegt die Phase innerhalb einer Zeile?
// ---------------------------------------------------------------------------
(function () {
  const zeile = (start, end) => entryStartEnd({ date: '2026-08-28', start, end });

  // Set 23:00-01:30 (150 Minuten), Licht 23:30-01:00 (90 Minuten ab Minute 30)
  let spur = lichtSpuren(zeile('23:00', '01:30'), lichtNacht);
  check('eine Ueberschneidung', spur.length, 1);
  check('faengt bei einem Fuenftel an', Math.round(spur[0].von * 100), 20);
  check('hoert bei vier Fuenfteln auf', Math.round(spur[0].bis * 100), 80);
  check('Anfang liegt in dieser Zeile', spur[0].beginntHier, true);
  check('Ende auch', spur[0].endetHier, true);

  // Set 21:00-23:00, Licht faengt erst 23:30 an - keine Ueberschneidung
  check('davor gibt es nichts zu zeichnen', lichtSpuren(zeile('21:00', '23:00'), lichtNacht).length, 0);

  // Eine Phase, die ueber zwei Acts laeuft: 22:30-23:45
  const ueber = lichtFenster([L('22:30', '23:45')]);
  const erste = lichtSpuren(zeile('21:00', '23:00'), ueber)[0];
  const zweite = lichtSpuren(zeile('23:00', '01:30'), ueber)[0];

  check('erste Zeile: faengt bei drei Vierteln an', Math.round(erste.von * 100), 75);
  check('erste Zeile: laeuft bis zum Ende durch', Math.round(erste.bis * 100), 100);
  check('erste Zeile: hier faengt die Phase an', erste.beginntHier, true);
  check('erste Zeile: hier hoert sie nicht auf', erste.endetHier, false);

  check('zweite Zeile: faengt oben an', Math.round(zweite.von * 100), 0);
  check('zweite Zeile: geht bis drei Zehntel', Math.round(zweite.bis * 100), 30);
  check('zweite Zeile: hier faengt sie nicht an', zweite.beginntHier, false);
  check('zweite Zeile: aber hier hoert sie auf', zweite.endetHier, true);

  // Ein Act ohne Ende wird mit einer Stunde gerechnet - dieselbe Annahme wie
  // ueberall sonst
  const ohneEnde = lichtSpuren(entryStartEnd({ date: '2026-08-28', start: '23:00' }), lichtNacht);
  check('Act ohne Ende: eine Stunde angesetzt', Math.round(ohneEnde[0].von * 100), 50);

  check('ohne Fenster nichts', lichtSpuren(zeile('23:00', '01:30'), []).length, 0);
  check('ohne Zeile nichts', lichtSpuren(null, lichtNacht).length, 0);
})();

// ---------------------------------------------------------------------------
// Phasen, zu denen kein Act danebensteht
// ---------------------------------------------------------------------------
(function () {
  const acts = [{ date: '2026-08-28', start: '21:00', end: '23:00', act: 'Vorband' }];
  const jetzt = FR2(20, 0);
  const zeilen = timetableZeilen(timetableView(acts, jetzt, 5));

  // Die Phase 23:30-01:00 beruehrt den einzigen Act nicht - sie darf trotzdem
  // nicht unter den Tisch fallen
  const offen = lichtOhneZeile(zeilen, lichtNacht, jetzt);
  check('faellt nicht unter den Tisch', offen.length, 1);
  check('und zwar die richtige', timeLabel(offen[0].se.start), '23:30');

  // Beruehrt sie einen Act, steht sie in der Spalte und nicht zusaetzlich
  const langeActs = [{ date: '2026-08-28', start: '23:00', end: '01:30', act: 'Nachtflug' }];
  check('sonst nicht doppelt',
        lichtOhneZeile(timetableZeilen(timetableView(langeActs, jetzt, 5)),
                       lichtNacht, jetzt).length, 0);

  // Vergangenes bleibt weg
  check('vorbei bleibt weg', lichtOhneZeile(zeilen, lichtNacht, SA2(2, 0)).length, 0);
})();

// Eine Lichtphase, die keinen der gezeigten Acts beruehrt, steht in keiner
// Spalte - dafuer gibt es die Zeile "Ausserdem" unter der Liste.
(function () {
  const acts = [{ date: '2026-08-28', start: '21:00', end: '22:00', act: 'Vorband' }];
  const jetzt = FR2(20, 0);
  const zeilen = timetableZeilen(timetableView(acts, jetzt, 5));
  const weit = lichtFenster([{ id: 'x', date: '2026-08-30', start: '23:00', end: '23:30' }]);
  check('kein Balken am Act', lichtSpuren(zeilen[0].se, weit).length, 0);
  check('aber gemerkt', lichtOhneZeile(zeilen, weit, jetzt).length, 1);
})();

// Uebersicht nach Naechten, nicht nach Kalendertagen
//
// Frueher wurde nach dem Kalendertag des Beginns gruppiert. Damit stand 01:00
// unter "Samstag", obwohl es zur Freitagnacht gehoert - eine Nacht wurde auf
// zwei Spalten zerrissen. Die Doku der Lichtcrew ordnet nach Naechten, und
// genau so denkt auch, wer abends davorsteht.
(function () {
  const um = (t, h, m) => new Date(2026, 9, t, h, m);

  check('abends gehoert zum eigenen Abend', todayISO(nachtVon(um(9, 22, 0))), '2026-10-09');
  check('nach Mitternacht noch zum Vorabend', todayISO(nachtVon(um(10, 1, 0))), '2026-10-09');
  check('kurz vor sechs noch zum Vorabend', todayISO(nachtVon(um(10, 5, 59))), '2026-10-09');
  check('ab sechs beginnt der neue Tag', todayISO(nachtVon(um(10, 6, 0))), '2026-10-10');
  check('mittags ebenfalls', todayISO(nachtVon(um(10, 14, 0))), '2026-10-10');

  // Genau die Zeiten vom Schirm an der Bar
  const liste = [
    { id: 'a', date: '2026-10-09', start: '22:00', end: '23:00' },
    { id: 'b', date: '2026-10-10', start: '01:00', end: '02:00' },
    { id: 'c', date: '2026-10-10', start: '03:00', end: '04:00' },
    { id: 'd', date: '2026-10-10', start: '23:00', end: '00:00' },
    { id: 'e', date: '2026-10-11', start: '02:00', end: '03:00' },
    { id: 'f', date: '2026-10-11', start: '04:00', end: '05:00' }
  ];
  const naechte = lichtUebersicht(liste, um(9, 18, 0));

  check('zwei Naechte statt drei Kalendertage', naechte.length, 2);
  check('erste Nacht vollstaendig', naechte[0].zeiten.map(z => z.von),
        ['22:00', '01:00', '03:00']);
  check('zweite Nacht vollstaendig', naechte[1].zeiten.map(z => z.von),
        ['23:00', '02:00', '04:00']);
  check('die laufende heisst HEUTE NACHT', naechte[0].titel, 'HEUTE NACHT');
  check('die naechste beim Namen', naechte[1].titel, 'NACHT AUF SONNTAG');
  check('Datum wie in der Doku', naechte[0].datum, '09.10. auf 10.10.');

  // Mitten in der Nacht ist immer noch dieselbe Nacht "heute nacht" - um genau
  // 04:00 waere die Phase 03:00-04:00 schon vorbei und faellt heraus, deshalb
  // hier halb vier.
  const spaet = lichtUebersicht(liste, um(10, 3, 30));
  check('um halb vier immer noch dieselbe Nacht', spaet[0].titel, 'HEUTE NACHT');
  check('und die gerade laufende ist markiert',
        spaet[0].zeiten.filter(z => z.laeuft).map(z => z.von), ['03:00']);

  // Vergangenes faellt heraus
  const danach = lichtUebersicht(liste, um(10, 12, 0));
  check('die durchgelaufene Nacht ist weg', danach.length, 1);
  check('und die verbliebene heisst wieder heute nacht', danach[0].titel, 'HEUTE NACHT');

  check('Bemerkung kommt mit',
        lichtUebersicht([{ id: 'x', date: '2026-10-09', start: '22:00', end: '23:00',
                           note: 'Hauptbuehne' }], um(9, 18, 0))[0].zeiten[0].hinweis,
        'Hauptbuehne');
})();

// Die eigene Seite in der Schleife
(function () {
  const bei = (...n) => n.map(x => ({ file: x, enabled: true, always: true }));
  const kurz = (items) => items.map(i => i.type === 'video' ? 'v:' + i.video.file : i.type);

  let runde = rundeBauen({ aktiv: bei('a', 'b'), hatTimetable: true, hatLicht: true,
                           timetableEvery: 3, lichtEvery: 2, zaehler: 0 });
  check('Lichtseite laeuft mit', kurz(runde.items), ['v:a', 'v:b', 'timetable', 'licht']);

  runde = rundeBauen({ aktiv: bei('a', 'b'), hatTimetable: true, hatLicht: true,
                       timetableEvery: 3, lichtEvery: 0, zaehler: 0 });
  check('0 laesst die Seite weg', kurz(runde.items), ['v:a', 'v:b', 'timetable']);

  runde = rundeBauen({ aktiv: bei('a'), hatTimetable: false, hatLicht: false,
                       lichtEvery: 3, zaehler: 0 });
  check('ohne angemeldete Zeiten keine Seite', kurz(runde.items), ['v:a']);

  runde = rundeBauen({ aktiv: [], hatTimetable: true, hatLicht: true,
                       timetableEvery: 3, lichtEvery: 2, zaehler: 0 });
  check('ohne Beitraege trotzdem beide Seiten', kurz(runde.items), ['timetable', 'licht']);

  runde = rundeBauen({ aktiv: [], hatTimetable: true, hatLicht: true,
                       timetableEvery: 3, lichtEvery: 0, zaehler: 0 });
  check('abgeschaltet bleibt sie auch ohne Beitraege weg',
        kurz(runde.items), ['timetable']);
})();

console.log('');
console.log('-- Getraenke und Speisen --');

check('zwei Darstellungen', PREIS_STILE.map(x => x.wert), ['liste', 'karten']);
check('ohne Angabe kompakt', preisStil({}), 'liste');
check('ohne Gruppe kompakt', preisStil(null), 'liste');
check('karten wird uebernommen', preisStil({ stil: 'karten' }), 'karten');
check('Unsinn faellt auf kompakt zurueck', preisStil({ stil: 'quatsch' }), 'liste');

// Was kommt ueberhaupt auf die Anzeige?
check('leere Gruppe nicht', gruppeHatInhalt({ category: 'Leer', items: [] }), false);
check('Gruppe mit leeren Zeilen nicht',
      gruppeHatInhalt({ items: [{ name: '', price: '' }] }), false);
check('ein Name reicht', gruppeHatInhalt({ items: [{ name: 'Pils' }] }), true);
check('ein Preis reicht auch', gruppeHatInhalt({ items: [{ price: '4,00' }] }), true);

// Eine Gruppe, die nur ein Hervorgehobenes hat, soll trotzdem erscheinen -
// beim Essenstand ist das Tagesgericht manchmal alles, was dransteht.
check('nur ein Tagesgericht reicht',
      gruppeHatInhalt({ items: [], spezial: { enabled: true, name: 'Chili sin Carne' } }), true);
check('abgeschaltet zaehlt nicht',
      gruppeHatInhalt({ items: [], spezial: { enabled: false, name: 'Chili' } }), false);
check('ohne Namen zaehlt nicht',
      gruppeHatInhalt({ items: [], spezial: { enabled: true, name: '' } }), false);

check('leere Gruppen fallen heraus', preisGruppen([
  { category: 'Bier', items: [{ name: 'Pils', price: '4,00' }] },
  { category: 'Leer', items: [] },
  { category: 'Grill', items: [], spezial: { enabled: true, name: 'Chili' } }
]).map(g => g.category), ['Bier', 'Grill']);
check('ohne Liste nichts', preisGruppen(null).length, 0);

// Reihenfolge der Rotation
check('ohne Angabe wird gemischt', uebergangsFolge({}), 'zufall');
check('Unsinn wird gemischt', uebergangsFolge({ uebergangsFolge: 'quatsch' }), 'zufall');
check('reihe wird uebernommen', uebergangsFolge({ uebergangsFolge: 'reihe' }), 'reihe');

check('der Reihe nach: unveraendert',
      uebergangBeutel(['fade', 'zoom', 'kreis'], '', null, 'reihe'),
      ['fade', 'zoom', 'kreis']);
check('der Reihe nach: auch wenn derselbe zuletzt lief',
      uebergangBeutel(['fade', 'zoom'], 'fade', null, 'reihe'), ['fade', 'zoom']);
check('der Reihe nach: Unsinn faellt trotzdem raus',
      uebergangBeutel(['fade', 'quatsch', 'kreis'], '', null, 'reihe'), ['fade', 'kreis']);

// Ueber viele Runden: der Reihe nach kommt jeder gleich oft und in Folge
(function () {
  const auswahl = ['fade', 'zoom', 'kreis'];
  const raus = [];
  let vorrat = [];
  for (let i = 0; i < 9; i++) {
    if (!vorrat.length) vorrat = uebergangBeutel(auswahl, raus[raus.length - 1], null, 'reihe');
    raus.push(vorrat.shift());
  }
  check('neun Wechsel der Reihe nach', raus,
        ['fade', 'zoom', 'kreis', 'fade', 'zoom', 'kreis', 'fade', 'zoom', 'kreis']);
})();

console.log('');
console.log('-- Info-Seiten nach der Uhr --');

check('ohne Angabe zaehlen Beitraege', infoEinheit({}, 'timetable'), 'beitraege');
check('Unsinn zaehlt Beitraege', infoEinheit({ timetableEinheit: 'quatsch' }, 'timetable'), 'beitraege');
check('minuten wird uebernommen', infoEinheit({ timetableEinheit: 'minuten' }, 'timetable'), 'minuten');
check('jede Seite fuer sich', infoEinheit({ pricesEinheit: 'minuten' }, 'timetable'), 'beitraege');
check('Takt als ganze Zahl', infoTakt({ pricesEvery: '2.7' }, 'prices'), 2);

check('nach der Uhr nur mit Einheit und Zahl',
      nachDerUhr({ timetableEinheit: 'minuten', timetableEvery: 2 }, 'timetable'), true);
check('mit 0 laeuft sie gar nicht',
      nachDerUhr({ timetableEinheit: 'minuten', timetableEvery: 0 }, 'timetable'), false);
check('mit Beitraegen nicht nach der Uhr',
      nachDerUhr({ timetableEinheit: 'beitraege', timetableEvery: 3 }, 'timetable'), false);

(function () {
  const s = { timetableEvery: 2, timetableEinheit: 'minuten',
              pricesEvery: 5, pricesEinheit: 'beitraege' };
  const hat = { timetable: true, prices: true, licht: false };
  const t0 = 1000000;
  const min = (n) => t0 + n * 60000;

  check('vor Ablauf nichts',
        faelligeInfoSeite(s, { hat, zuletzt: { timetable: t0 }, jetzt: min(1) }), null);
  check('genau nach zwei Minuten',
        faelligeInfoSeite(s, { hat, zuletzt: { timetable: t0 }, jetzt: min(2) }), 'timetable');
  check('spaeter erst recht',
        faelligeInfoSeite(s, { hat, zuletzt: { timetable: t0 }, jetzt: min(9) }), 'timetable');
  check('ohne Inhalt bleibt sie weg',
        faelligeInfoSeite(s, { hat: { timetable: false }, zuletzt: { timetable: t0 },
                               jetzt: min(9) }), null);
  check('gezaehlte Seiten kommen hier nicht vor',
        faelligeInfoSeite({ pricesEvery: 1, pricesEinheit: 'beitraege' },
                          { hat, zuletzt: { prices: t0 }, jetzt: min(9) }), null);

  // Sind zwei faellig, kommt die dran, die laenger wartet - sonst verdraengt
  // eine haeufige Seite die seltene dauerhaft.
  const zwei = { timetableEvery: 2, timetableEinheit: 'minuten',
                 lichtEvery: 1, lichtEinheit: 'minuten' };
  const beide = { timetable: true, prices: false, licht: true };
  check('die laengere Wartezeit gewinnt',
        faelligeInfoSeite(zwei, { hat: beide, zuletzt: { timetable: t0, licht: min(3) },
                                  jetzt: min(5) }), 'timetable');
  check('und andersherum genauso',
        faelligeInfoSeite(zwei, { hat: beide, zuletzt: { timetable: min(4), licht: t0 },
                                  jetzt: min(6) }), 'licht');
})();

// ---------------------------------------------------------------------------
console.log('-- Probezeit --');
(function () {
  check('ohne Einstellung kein Versatz', zeitVersatz({}), 0);
  check('ohne Settings auch nicht', zeitVersatz(null), 0);
  check('Unfug ergibt 0', zeitVersatz({ zeitVersatz: 'gleich' }), 0);
  check('unendlich ergibt 0', zeitVersatz({ zeitVersatz: Infinity }), 0);
  check('ein Wert kommt durch', zeitVersatz({ zeitVersatz: -5000 }), -5000);

  // Unter einer Minute ist Rundungsrest, kein Probelauf - sonst zeigte die
  // Anzeige dauerhaft einen Hinweis wegen ein paar Millisekunden.
  check('59 s sind keine Probezeit', probezeitLaeuft({ zeitVersatz: 59000 }), false);
  check('genau eine Minute schon', probezeitLaeuft({ zeitVersatz: 60000 }), true);
  check('auch rueckwaerts', probezeitLaeuft({ zeitVersatz: -60000 }), true);
  check('gar nichts eingestellt', probezeitLaeuft({}), false);

  const echtJetzt = new Date(2026, 7, 27, 20, 0, 0);
  check('zwei Stunden vor',
        versatzFuer(new Date(2026, 7, 27, 22, 0, 0), echtJetzt), 2 * 3600000);
  check('eine Stunde zurueck',
        versatzFuer(new Date(2026, 7, 27, 19, 0, 0), echtJetzt), -3600000);
  check('gleiche Zeit heisst kein Versatz', versatzFuer(echtJetzt, echtJetzt), 0);

  // Hin und zurueck: der Versatz muss die Zielzeit wieder ergeben
  const probeZiel = new Date(2026, 7, 28, 3, 30, 0);
  check('der Versatz fuehrt zur Zielzeit',
        new Date(echtJetzt.getTime() + versatzFuer(probeZiel, echtJetzt)).getTime(),
        probeZiel.getTime());
})();

// ---------------------------------------------------------------------------
console.log('-- Lichtblock in seiner Zeile --');
(function () {
  const rund = (x) => Math.round(x * 1000) / 1000;

  // Was lang genug ist, bleibt unveraendert
  const a = lichtAusschnitt(0.2, 0.8);
  check('lange Phase bleibt, wie sie ist', rund(a.von) + '/' + rund(a.bis), '0.2/0.8');

  // Eine sehr kurze Phase bekommt einen Mindestanteil - um die Mitte herum
  const b = lichtAusschnitt(0.5, 0.52, 0.2);
  check('kurze Phase waechst um ihre Mitte', rund(b.von) + '/' + rund(b.bis), '0.41/0.61');

  // ... aber nie ueber die Zeile hinaus. Das war der eigentliche Fehler:
  // eine Mindesthoehe im CSS schob den Block neben den naechsten Act.
  const c = lichtAusschnitt(0.95, 1, 0.3);
  check('am unteren Rand bleibt sie drin', rund(c.von) + '/' + rund(c.bis), '0.7/1');
  const d = lichtAusschnitt(0, 0.05, 0.3);
  check('am oberen Rand auch', rund(d.von) + '/' + rund(d.bis), '0/0.3');

  check('Unfug wird eingefangen', rund(lichtAusschnitt(-2, 5).bis), 1);
  check('und nach unten auch', rund(lichtAusschnitt(-2, 5).von), 0);

  // Die Beschriftung sitzt auf der Mitte ihres Blocks ...
  check('Marke mittig zum Block', rund(lichtMarkeLage(0.4, 0.6, 0.4)), 0.5);
  // ... wird aber hereingeholt, damit sie nicht beim Nachbaract landet
  check('unten hereingeholt', rund(lichtMarkeLage(0.9, 1, 0.4)), 0.8);
  check('oben hereingeholt', rund(lichtMarkeLage(0, 0.1, 0.4)), 0.2);
  check('eine hohe Marke landet in der Mitte', rund(lichtMarkeLage(0, 0.1, 1)), 0.5);
})();

// ---------------------------------------------------------------------------
console.log('-- Nachtgrenze --');
(function () {
  const nacht = (d) => nachtEnde(d).toISOString().slice(0, 16);

  // Die Nacht auf Samstag endet Samstag um 6
  check('abends', nacht(new Date(2026, 8, 11, 22, 0)),
        new Date(2026, 8, 12, 6, 0).toISOString().slice(0, 16));
  check('nach Mitternacht dieselbe Nacht', nacht(new Date(2026, 8, 12, 3, 0)),
        new Date(2026, 8, 12, 6, 0).toISOString().slice(0, 16));
  check('nach sechs beginnt die naechste', nacht(new Date(2026, 8, 12, 7, 0)),
        new Date(2026, 8, 13, 6, 0).toISOString().slice(0, 16));
})();

// ---------------------------------------------------------------------------
console.log('-- Lichtphasen ohne Zeile --');
(function () {
  const phase = (vonTag, vonStd, bisTag, bisStd) => ({
    eintrag: { note: '' },
    se: { start: new Date(2026, 8, vonTag, vonStd, 0),
          end: new Date(2026, 8, bisTag, bisStd, 0) }
  });
  const jetzt = new Date(2026, 8, 11, 21, 0);
  const echt = [
    phase(11, 23, 12, 0),   // heute Nacht
    phase(12, 2, 12, 3),    // heute Nacht
    phase(12, 23, 13, 0)    // morgen Nacht
  ];

  check('ohne Grenze steht auch die naechste Nacht dabei',
        lichtOhneZeile([], echt, jetzt).length, 3);
  // Genau das war unbrauchbar: unter dem Timetable von heute Nacht standen
  // die Zeiten von morgen.
  check('mit Nachtgrenze nur diese Nacht',
        lichtOhneZeile([], echt, jetzt, nachtEnde(jetzt)).length, 2);
  check('Vergangenes faellt weiter heraus',
        lichtOhneZeile([], echt, new Date(2026, 8, 12, 2, 30),
                       nachtEnde(new Date(2026, 8, 12, 2, 30))).length, 1);
})();

// ---------------------------------------------------------------------------
console.log('-- Durchgehender Kasten ueber mehrere Acts --');
(function () {
  const zeile = (vonStd, bisStd) => ({
    se: { start: new Date(2026, 8, 11, vonStd, 0),
          end: new Date(2026, 8, 11 + (bisStd <= vonStd ? 1 : 0), bisStd, 0) }
  });
  const phase = (vonStd, bisStd, tagVersatz) => ({
    eintrag: { note: '' },
    se: { start: new Date(2026, 8, 11, vonStd, 0),
          end: new Date(2026, 8, 11 + (tagVersatz || 0), bisStd, 0) }
  });

  // Zwei Acts von je zwei Stunden, eine Phase mitten ueber die Grenze
  const zeilen = [zeile(20, 22), zeile(22, 24)];
  const spalte = lichtSpalte(zeilen, [phase(21, 23)]);

  check('beide Zeilen bekommen ein Stueck',
        spalte[0].length + '/' + spalte[1].length, '1/1');
  check('das erste Stueck reicht bis zum Zeilenende', spalte[0][0].bis, 1);
  check('das zweite faengt am Zeilenanfang an', spalte[1][0].von, 0);
  check('nur das erste beginnt wirklich', spalte[0][0].beginntHier, true);
  check('das zweite nicht', spalte[1][0].beginntHier, false);
  check('nur das zweite endet wirklich', spalte[1][0].endetHier, true);

  // Kein Mindestmass fuer Stuecke eines durchgehenden Kastens - der ist ohnehin
  // hoch genug, und je Stueck angewandt waere es eine Luege.
  check('durchgehend heisst nicht einzeln', spalte[0][0].einzeln, false);

  // Die Uhrzeit steht einmal, und zwar in der Mitte des ganzen Kastens.
  // 21-22 ist die zweite Haelfte der ersten Zeile, 22-23 die erste Haelfte der
  // zweiten - die Mitte liegt genau auf der Naht.
  const marken = spalte.map(z => z.filter(x => x.marke !== null).length);
  check('genau eine Uhrzeit', marken[0] + marken[1], 1);
  check('und sie sitzt auf der Naht', spalte[0][0].marke, 1);

  // Eine Phase in nur einer Zeile bekommt ihr Mindestmass
  const eine = lichtSpalte(zeilen, [phase(20, 21)]);
  check('eine Phase in einer Zeile ist einzeln', eine[0][0].einzeln, true);
  check('und traegt dort die Uhrzeit', eine[0][0].marke, 0.25);

  // Drei Zeilen, Phase ueber alle drei: die Mitte liegt in der mittleren
  const drei = [zeile(20, 22), zeile(22, 24), { se: {
    start: new Date(2026, 8, 12, 0, 0), end: new Date(2026, 8, 12, 2, 0) } }];
  const lang = lichtSpalte(drei, [phase(21, 1, 1)]);
  check('drei Stuecke', lang.map(z => z.length).join(''), '111');
  check('die Uhrzeit steht in der mittleren Zeile',
        lang.map(z => z[0].marke === null ? '-' : 'x').join(''), '-x-');

  check('ohne Fenster bleibt jede Zeile leer',
        lichtSpalte(zeilen, []).map(z => z.length).join(''), '00');
  check('ohne Zeilen kommt nichts zurueck', lichtSpalte([], [phase(21, 23)]).length, 0);
})();

// ---------------------------------------------------------------------------
console.log('-- Karte auf mehrere Seiten --');
(function () {
  const g = (n) => Array.from({ length: n }, (_, i) => ({ category: 'G' + i }));
  const namen = (seiten) => seiten.map(s => s.map(x => x.category).join(',')).join(' | ');

  check('ohne Angabe alles auf eine Seite', namen(preisSeiten(g(6), 0)),
        'G0,G1,G2,G3,G4,G5');
  check('auch bei leerer Angabe', preisSeiten(g(3)).length, 1);
  check('zwei je Seite ergeben drei Seiten', namen(preisSeiten(g(6), 2)),
        'G0,G1 | G2,G3 | G4,G5');
  check('der Rest kommt auf die letzte Seite', namen(preisSeiten(g(5), 2)),
        'G0,G1 | G2,G3 | G4');
  check('eine je Seite', preisSeiten(g(4), 1).length, 4);

  // Passt ohnehin alles, gibt es keine zweite Seite - und damit auch keine
  // Seitenzahl auf der Anzeige.
  check('weniger Gruppen als erlaubt bleibt einseitig', preisSeiten(g(2), 4).length, 1);
  check('genau so viele wie erlaubt auch', preisSeiten(g(4), 4).length, 1);

  check('ohne Gruppen bleibt eine leere Seite', namen(preisSeiten([], 2)), '');
  check('und ohne alles auch', preisSeiten(null, 2).length, 1);
  check('Unfug zaehlt wie 0', preisSeiten(g(6), 'viele').length, 1);
  check('negative Angabe ebenso', preisSeiten(g(6), -2).length, 1);
})();

// ---------------------------------------------------------------------------
console.log('-- Restzeit des laufenden Acts --');
(function () {
  const jetzt = new Date(2026, 8, 11, 22, 0, 0);
  const bis = (min) => ({ end: new Date(jetzt.getTime() + min * 60000) });

  check('eine Stunde vorher steht nichts da', restzeitText(bis(60), jetzt), '');
  check('auch bei einunddreissig Minuten nicht', restzeitText(bis(31), jetzt), '');
  check('ab dreissig Minuten schon', restzeitText(bis(30), jetzt), 'nur noch 30 min');
  check('mittendrin', restzeitText(bis(12), jetzt), 'nur noch 12 min');

  // Aufgerundet: solange eine angefangene Minute laeuft, steht auch eine da.
  // "0 min" waere die einzige Angabe, die sicher falsch ist.
  check('halbe Minuten werden aufgerundet',
        restzeitText({ end: new Date(jetzt.getTime() + 90000) }, jetzt), 'nur noch 2 min');
  check('die letzte halbe Minute ist noch eine',
        restzeitText({ end: new Date(jetzt.getTime() + 30000) }, jetzt), 'nur noch 1 min');

  check('vorbei ist vorbei', restzeitText(bis(0), jetzt), '');
  check('und darueber hinaus auch', restzeitText(bis(-5), jetzt), '');
  check('ohne Endzeit gibt es nichts zu sagen', restzeitText({ end: null }, jetzt), '');
  check('ohne Zeiten erst recht', restzeitText(null, jetzt), '');
  check('ohne Jetzt auch nicht', restzeitText(bis(10), null), '');

  // Die Schwelle laesst sich verschieben - dafuer ist sie ein Parameter
  check('mit eigener Schwelle frueher', restzeitText(bis(45), jetzt, 60), 'nur noch 45 min');
  check('und damit auch spaeter', restzeitText(bis(20), jetzt, 10), '');
})();

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
