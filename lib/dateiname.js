'use strict';

// Dateinamen entschaerfen, bevor etwas im Medienordner landet.
//
// Leerzeichen und Umlaute machen file://-Adressen fragil, und alles, was von
// aussen kommt - eine Handy-Datei ueber die Bedienseite genauso wie eine per
// Dialog gewaehlte - darf keinen Pfad enthalten. Deshalb wird hier konsequent
// nur der reine Name betrachtet und alles Uebrige ersetzt.
//
// Wird von main.js (Electron) und pi/server.js gleichermassen benutzt, damit
// eine Datei auf beiden Wegen denselben Namen bekommt.

const fs = require('fs');
const path = require('path');

function sicherName(original, dir) {
  // basename zweimal: einmal fuer Posix-, einmal fuer Windows-Trenner. Ein
  // hochgeladener Name wie "..\\..\\etc\\passwd" wird damit zu "passwd".
  const nurName = path.basename(String(original || '').replace(/\\/g, '/'));
  const ext = path.extname(nurName).toLowerCase();

  let base = path.basename(nurName, path.extname(nurName));
  base = base
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!base) base = 'datei';
  if (base.length > 60) base = base.slice(0, 60);

  const sichereExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';

  let name = base + sichereExt;
  let i = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = base + '_' + i + sichereExt;
    i++;
  }
  return name;
}

module.exports = { sicherName };
