export interface ChangelogEntry {
  version: string;
  title: string;
  date: string;
  changes: string[];
}

export const CURRENT_VERSION = '1.3';

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.3',
    title: 'Ein-/Ausblendbare Bauteil-Bibliothek & Eigenschaften',
    date: '2026-11-14',
    changes: [
      'Linke Bauteil-Bibliothek und rechtes Eigenschaften-/Fehler-Panel lassen sich mit einem Klick auf das Einklapp-Symbol ausblenden.',
      'Schwebende Schaltflächen am Rand der Arbeitsfläche ermöglichen das direkte Wiedereinblenden für maximale Arbeitsfläche.',
      'Fehler-Aktionen in der Steuerleiste öffnen das rechte Diagnose-Panel bei Bedarf automatisch.',
    ],
  },
  {
    version: '1.2',
    title: 'Versionierung & In-App Changelog',
    date: '2026-11-14',
    changes: [
      'Fortlaufende Versionsnummerierung eingeführt (1.0 → 1.1 → 1.2).',
      'CHANGELOG.md im Projektverzeichnis angelegt und bei jeder Änderung aktualisiert.',
      'Changelog-Ansicht direkt über die Versionsschaltfläche in der oberen Steuerleiste integriert.',
    ],
  },
  {
    version: '1.1',
    title: 'Speichern/Laden, Fehler-Simulation & Logik/Messtechnik',
    date: '2026-11-14',
    changes: [
      'Schaltplan-Export und -Import als JSON-Datei über die Buttons „Speichern“ und „Laden“.',
      'Fehler-Simulation (Zufallsfehler & gezielte Störungen): Kurzschluss, Leitungsunterbrechung, klemmendes Ventil, Ausfall der Spannungsversorgung inklusive Auswirkungsanalyse.',
      'Stromwandler (Ampere-Messung mit 4–20 mA / 0–10 V Ausgang) ergänzt.',
      'Messumformer (0–10 V / 0–24 V ↔ 4–20 mA inkl. 24V-Grenzwertausgang) ergänzt.',
      'Logikgatter AND, OR und NOT sowie Vorlage „Messtechnik & Logik“ hinzugefügt.',
    ],
  },
  {
    version: '1.0',
    title: 'Erstveröffentlichung — Mechatronik & Fluidik Baukasten',
    date: '2026-11-14',
    changes: [
      'Objektorientierte Simulations-Architektur (SimComponent & ComponentRegistry) mit erweiterbarer Signal-Engine.',
      'Drag & Drop Arbeitsfläche mit Pan/Zoom, Klemmen-Verdrahtung, leuchtenden 24V-Leitungen und animierten Fluidrohren.',
      'Bauteile: 24V DC Netzteil, Taster/Schalter, Zeitrelais (TON/TOF/Taktgeber), Hilfsrelais/Schütz (2x Wechsler), Tank mit manuellem Slider, Schwimmerlanze, Erzeuger-Anlage, 3/2- & 2/2-Wege-Magnetventil, Ablassventil/Verbraucher.',
      'Zeitraffer-Steuerung (1x, 10x, 60x, 600x, 3600x sowie stufenloser Slider) und Gesamtzeitanzeige (Tage:Stunden:Minuten).',
    ],
  },
];
