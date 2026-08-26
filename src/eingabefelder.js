'use strict';

// Datum und Uhrzeit tippen statt klicken.
//
// Die eingebauten Felder <input type="date"> und <input type="time"> verhalten
// sich je nach System unterschiedlich: mal lassen sie sich betippen, mal geht
// im Grunde nur die Auswahl auf. An einer Bar, wo jemand zwanzig Acts eintippt,
// ist das der Unterschied zwischen einer Minute und einer Viertelstunde.
//
// Deshalb steht vor jedem solchen Feld ein gewoehnliches Textfeld, und daneben
// ein Knopf, der die eingebaute Auswahl oeffnet. Beides fuehrt zum selben Wert.
//
// Wichtig fuer den Rest des Programms: das eingebaute Feld bleibt im Dokument
// und bleibt der Ort, an dem der Wert steht. Alles, was bisher darauf hoert
// oder es ausliest, funktioniert unveraendert weiter - beim Tippen wird das
// uebliche "input"-Ereignis darauf ausgeloest.

(function () {
  const MERKMAL = 'aufgewertet';

  function istDatum(el) { return el.type === 'date'; }

  function parsen(el, text) {
    return istDatum(el) ? datumParsen(text) : zeitParsen(text);
  }

  function anzeigen(el, wert) {
    return istDatum(el) ? datumAnzeige(wert) : zeitAnzeige(wert);
  }

  function feldAufwerten(nativ) {
    if (!nativ || nativ.dataset[MERKMAL]) return;
    nativ.dataset[MERKMAL] = '1';

    const paar = document.createElement('span');
    paar.className = 'feldPaar';
    nativ.parentNode.insertBefore(paar, nativ);

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'feldText';
    text.inputMode = 'numeric';
    text.autocomplete = 'off';
    text.placeholder = istDatum(nativ) ? 'TT.MM.JJJJ' : 'HH:MM';
    text.value = anzeigen(nativ, nativ.value);
    if (nativ.title) text.title = nativ.title;

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'feldWahl';
    knopf.tabIndex = -1;
    knopf.title = istDatum(nativ) ? 'Kalender öffnen' : 'Uhrzeit auswählen';
    knopf.innerHTML = istDatum(nativ) ? '&#128197;' : '&#128339;';

    paar.appendChild(text);
    paar.appendChild(knopf);
    paar.appendChild(nativ);
    nativ.classList.add('feldNativ');
    nativ.tabIndex = -1;

    // ---- Textfeld -> gespeicherter Wert ---------------------------------
    // Erst beim Verlassen oder mit Enter auswerten. Waehrend des Tippens waere
    // jede Zwischenstufe unfertig ("1.2.20"), und das Feld wuerde einem unter
    // den Fingern umspringen.
    const uebernehmen = () => {
      const neu = parsen(nativ, text.value);
      if (neu === null) {
        text.classList.add('feldFehler');
        return false;
      }
      text.classList.remove('feldFehler');
      text.value = anzeigen(nativ, neu);
      if (nativ.value !== neu) {
        nativ.value = neu;
        nativ.dispatchEvent(new Event('input', { bubbles: true }));
        nativ.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    };

    text.addEventListener('blur', uebernehmen);
    text.addEventListener('input', () => text.classList.remove('feldFehler'));
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); uebernehmen(); }
      if (e.key === 'Escape') { text.value = anzeigen(nativ, nativ.value);
                                text.classList.remove('feldFehler'); }
    });

    // ---- Auswahl -> Textfeld -------------------------------------------
    nativ.addEventListener('change', () => {
      const gezeigt = anzeigen(nativ, nativ.value);
      if (text.value !== gezeigt) text.value = gezeigt;
      text.classList.remove('feldFehler');
    });

    knopf.addEventListener('click', () => {
      // Was im Textfeld steht, zuerst uebernehmen - sonst oeffnet die Auswahl
      // beim alten Wert.
      uebernehmen();
      try {
        if (typeof nativ.showPicker === 'function') { nativ.showPicker(); return; }
      } catch (e) { /* gleich der Ersatzweg */ }
      nativ.focus();
      nativ.click();
    });
  }

  function felderAufwerten(wurzel) {
    const bereich = wurzel || document;
    if (bereich.querySelectorAll) {
      bereich.querySelectorAll('input[type=date], input[type=time]')
        .forEach(feldAufwerten);
    }
  }

  // Die Oberflaeche baut Zeilen staendig neu auf (Timetable, Zeitfenster,
  // Durchsagen). Statt jede Stelle einzeln anzufassen, werden neue Felder hier
  // erkannt - dadurch kann kein Aufruf vergessen werden.
  function beobachten() {
    const beobachter = new MutationObserver((aenderungen) => {
      for (const a of aenderungen) {
        for (const knoten of a.addedNodes) {
          if (knoten.nodeType !== 1) continue;
          if (knoten.matches && knoten.matches('input[type=date], input[type=time]')) {
            feldAufwerten(knoten);
          }
          felderAufwerten(knoten);
        }
      }
    });
    beobachter.observe(document.body, { childList: true, subtree: true });
  }

  function start() {
    felderAufwerten(document);
    beobachten();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.barDisplayFelder = { felderAufwerten, feldAufwerten };
})();
