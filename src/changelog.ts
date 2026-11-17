export interface ChangelogEntry {
  version: string;
  title: string;
  date: string;
  changes: string[];
}

export const CURRENT_VERSION = '1.15';

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.15',
    title: 'Automatischer 24V-Potentialverteiler (Klemmblock X1) beim JSON-Import',
    date: '2026-11-17',
    changes: [
      'Automatischer Schaltschrank-Potentialverteiler: Beim Import externer Schaltpläne (wie katholyte.json) wird nun vollautomatisch ein zentraler 24V-Klemmblock (X1 24V-Potentialverteiler) zwischen Netzteil und Verbraucher geschaltet. Alle 24V-Versorgungsleitungen werden sauber über die Klemmen des Verteilers geleitet anstelle einer unübersichtlichen Direkt-Verdrahtung am Netzteil.',
    ],
  },
  {
    version: '1.14',
    title: 'Leitungs-Normalisierung für externe JSON-Projekte (Leuchten & Stromfluss)',
    date: '2026-11-17',
    changes: [
      'Automatische Leitungs-Ausrichtungs-Normalisierung beim Import externer JSON-Schaltpläne (wie katholyte.json): Alle Anschlüsse zwischen Netzteilen, Zeitrelais und Ventilen werden nun präzise von Ausgang zu Eingang geroutet, sodass beim Einschalten des Netzteils alle Leitungen korrekt rot aufleuchten und die Schaltung sofort fehlerfrei simuliert wird.',
    ],
  },
  {
    version: '1.13',
    title: 'Intelligenter JSON-Projekt-Adapter (z. B. für katholyte.json)',
    date: '2026-11-17',
    changes: [
      'Intelligenter JSON-Import-Adapter: Die App erkennt nun automatisch externe Projekt-JSON-Dateien (mit benutzerdefinierten Strukturen wie VoltageSource, Tele_E1ZM10, SolenoidValve und verschachtelten connections), konvertiert sie fehlerfrei und baut die Schaltung automatisch auf.',
    ],
  },
  {
    version: '1.12',
    title: 'Dynamische Verdrahtungs-Hilfe für TELE E1ZM10 Zeitrelais',
    date: '2026-11-17',
    changes: [
      'Dynamischer Anschluss-Leitfaden im Eigenschaften-Panel: Sobald das Zeitrelais ausgewählt wird, zeigt eine Live-Box direkt unter der Funktionsauswahl an, ob Klemme B1 (Steuerkontakt) benötigt wird oder frei bleiben muss sowie wie A1 und 15/16/18 zu beschalten sind.',
    ],
  },
  {
    version: '1.11',
    title: 'Hindernis-Umfahrung aller Leitungen & automatischer Bauteil-Abstand',
    date: '2026-11-17',
    changes: [
      'A*-Leitungsrouter mit Hindernis-Umfahrung: Elektro-, Analog- und Fluidleitungen werden ab sofort garantiert außen um alle Bauteile herumgeführt und laufen nicht mehr unter Bauteilen hindurch (Live-Neuverlegung beim Verschieben).',
      'Automatischer Mindestabstand (36 px): Wird ein Bauteil zu nah an ein anderes gesetzt oder geschoben, rückt es beim Loslassen automatisch ein Stück beiseite, damit alle Anschlüsse und Leitungsbahnen freien Raum haben.',
    ],
  },
  {
    version: '1.10',
    title: 'Elektrisches Brücken (z. B. A1 → 15) & klare Klemmen-Beschriftung',
    date: '2026-11-17',
    changes: [
      'Elektrisches Brücken / Durchschleifen: Klemmen lassen sich jetzt direkt am selben Bauteil (z. B. Brücke A1 → 15 am Zeitrelais oder 18 → B1) sowie über Eingänge benachbarter Bauteile (z. B. K1.A1 → K2.A1) ohne extra Igel-Leitung verdrahten.',
      'Klemmen-Übersicht im Eigenschaften-Panel erweitert: Jede Klemme zeigt nun direkt ihre vollständige Funktionsbeschreibung (z. B. 15 = Wechsler COM, 16 = Öffner NC, 18 = Schließer NO, B1 = Steuerkontakt) sowie einen deutlich beschrifteten „Trennen“-Button mit Ja/Nein-Bestätigung pro Einzelleitung.',
    ],
  },
  {
    version: '1.9',
    title: 'Bugfix: Einzelnes Bauteil-Verschieben & Klemmen-Verdrahtung',
    date: '2026-11-17',
    changes: [
      'Behoben: Fehlendes stopPropagation beim Ziehen von Bauteilen (zuvor wurde stattdessen die gesamte Arbeitsfläche verschoben).',
      'Behoben: Neu verbundene Leitungen wurden wegen In-Place-Array-Mutation im SimulationEngine nicht neu gerendert; zudem SVG-Glow-Filter bei exakt waagerechten/senkrechten 90°-Leitungen korrigiert.',
      'Klemmen-Verdrahtung überarbeitet: Leitungen lassen sich jetzt sowohl per Klick-auf-Klemme → Klick-auf-Zielklemme als auch per Ziehen von Klemme zu Klemme verbinden (inkl. vergrößerter 24-px-Trefferfläche und zuverlässiger Maus-/Touch-Verfolgung).',
    ],
  },
  {
    version: '1.8',
    title: 'Großes Fluidik-, TELE-Zeitrelais- & Ergonomie-Update',
    date: '2026-11-17',
    changes: [
      'Bedienung: 5-Pixel-Schwelle zum flüssigen Verschieben angeschlossener Bausteine (Leitungen ziehen mit), Kontextmenü am Baustein deaktiviert, Zahnrad-Button öffnet direkt die Eigenschaften.',
      'Rechtwinklige Leitungsführung (90° Manhattan-Routing) mit parallelen Leitungsbahnen sowie eindeutigen Kreuzungen (Brückensprung für Elektrik/Analog, Unterbrechungslücke für Fluidrohre).',
      'Einzelne Leitungen lassen sich per Sicherheitsabfrage (Ja/Nein) sowohl direkt an der Leitung als auch pro Klemme im Eigenschaften-Panel trennen.',
      'Leere Start-Arbeitsfläche, lokales Speichern/Verwalten eigener Simulationen in der Dropdown-Liste und lokaler PDF-/Bild-Schaltplan-Betrachter („PDF-Plan“).',
      'TELE ENYA E1ZM10 Zeitrelais exakt nach Datenblatt: Klemmen A1/B1/15–16–18, 7 Funktionen (E, R, Ws, Wa, Es, Wu, Bp), 7 Zeitbereiche (1s bis 100h), 5–100%-Skala und U/t- sowie R-LED.',
      'Erzeuger getrennt für Anolyte (blau) & Katholyte (grün) mit direktem Hand-Stopp-Schalter und MIN/MAX-Selbsthalte-Logik (Anolyte ist führend; Katholyte wird über 3/2-Wege-Ventil in den Gulli geleitet).',
      'Anolyte- & Katholyte-Tanks mit konfigurierbaren Schwimmerlanzen (0/3/4/5 Schaltpunkte, Kontakte je Punkt invertierbar) sowie 0–4 Sauglanzen-Anschlüssen.',
      'Neue Fluid-Bauteile: Gulli/Ablauf (animiert), Hauptwasserleitung, Wasserzähler (einstellbare Taktung in L/Impuls & Impulslänge + 4–20mA), Grundfos DDA Dosierpumpe (17-7, 60-10, 120-7, 200-4 mit 4–20mA/Puls/Manuell), T-Stück (1→2 / 2→1) und Impfstelle (direkt in bestehende Leitungen einfügbar, inkl. mL/m³-Berechnung).',
    ],
  },
  {
    version: '1.7',
    title: 'GitHub Actions Peer-Dependency-Fix',
    date: '2026-11-17',
    changes: [
      'npm install --legacy-peer-deps im GitHub Pages Workflow ergänzt, um den optionalen esbuild/vite8 Peer-Konflikt zu lösen.',
      'vite.config.ts auf modernes import.meta.dirname umgestellt.',
    ],
  },
  {
    version: '1.6',
    title: 'GitHub Actions Build-Fix (ohne package-lock.json)',
    date: '2026-11-17',
    changes: [
      'GitHub Pages Workflow korrigiert: Fehlermeldung wegen fehlender package-lock.json behoben (automatischer Fallback auf npm install).',
    ],
  },
  {
    version: '1.5',
    title: 'Installierbare App (PWA), Mobile-Ansicht & GitHub Pages',
    date: '2026-11-17',
    changes: [
      'PWA-Integration (vite-plugin-pwa): Installierbar auf Windows/Mac-PC sowie Android und iPhone/iPad (inkl. Offline-Cache und Installations-Button in der Steuerleiste).',
      'GitHub Actions Workflow (.github/workflows/deploy.yml) für automatisches Veröffentlichen über GitHub Pages eingerichtet.',
      'Mobile-Optimierung: Seitenleisten öffnen auf schmalen Handy-Displays als schwebende Overlays, Touch-Verschieben auf der Arbeitsfläche aktiviert.',
    ],
  },
  {
    version: '1.4',
    title: 'Fehlerbehebung Schwimmerlanze (levelPct undefined)',
    date: '2026-11-14',
    changes: [
      'Behoben: TypeError beim Zugriff auf toFixed bei undefiniertem levelPct in FloatProbeComponent.',
      'Sichere Fallbacks und automatisierte Tank-Füllstandsermittlung für separate Schwimmerlanzen integriert.',
    ],
  },
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
