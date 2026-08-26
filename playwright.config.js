'use strict';

// Playwright ist reines Entwicklungswerkzeug - es steht in devDependencies und
// wird nie mitgeliefert. Ins gebaute Programm gehen nur die Dateien aus
// "build.files" in der package.json.
//
// Geprueft werden die Wege, auf denen das Programm laeuft:
//
//   test/e2e/anzeige.spec.js      die Anzeige, wie sie am Raspberry Pi laeuft
//   test/e2e/bedienseite.spec.js  die Bedienseite ueber das Netz
//   test/e2e/handy.spec.js        dieselbe Seite auf einem Telefon-Bildschirm
//   test/e2e/electron/*.spec.js   das Fenster am Bar-Rechner
//
// Die schnellen Rechen-Tests (test/schedule.test.js, test/dienst.test.js)
// bleiben davon unberuehrt und laufen weiter mit "npm test".

const { defineConfig, devices } = require('@playwright/test');

const ELECTRON = /electron[\\/]/;
const HANDY = /handy\.spec\.js/;

module.exports = defineConfig({
  testDir: './test/e2e',
  // Jeder Test bringt seinen eigenen Dienst auf einem eigenen Port mit, darf
  // also nebeneinander laufen.
  fullyParallel: true,
  // Eine vergessene .only soll nicht stillschweigend den Rest ueberspringen
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  timeout: 60000,
  expect: { timeout: 10000 },

  use: {
    // Bei einem Fehlschlag will man sehen, was auf dem Schirm stand
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  },

  projects: [
    {
      name: 'browser',
      testIgnore: [ELECTRON, HANDY],
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'handy',
      testMatch: HANDY,
      use: { ...devices['iPhone 13'] }
    },
    {
      name: 'electron',
      testMatch: ELECTRON,
      // Electron bringt seinen eigenen Browser mit - die Geraeteangaben von
      // oben gelten hier nicht.
      use: {}
    }
  ]
});
