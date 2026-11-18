export interface ChangelogEntry {
  version: string;
  title: string;
  date: string;
  changes: string[];
}

export const CURRENT_VERSION = '1.19';

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.19',
    title: 'EPLAN-Schaltplan-PDF: Grafische Kontakte, B1-Zweige, permanentes +24V & klares Schriftfeld',
    date: '2026-11-18',
    changes: [
      'EPLAN-/DIN-Aufmachung: Grüner Normrahmen mit oberer Spaltenleiste (0–9) und kompaktem Schriftfeld unten (Datum, Norm, Projekt, AnlagenSim, Copyright © 2026 #MAT, Blatt X von Y).',
      'Deckblatt bereinigt: Prüf- und Montagehinweise entfernt; stattdessen klare Übersicht zu Anlagentyp, Steuerspannung, Aderfarben (+24 V DC = blau, 0 V DC = blau-weiß), Klemmleisten und Stückliste (BOM).',
      'Grafische Schaltkontakte & Querverweise: Relais- und Zeitrelaiskontakte (15-16/18, 11-12/14, 21-22/24) sowie B1-Steuerzweige werden direkt zeichnerisch als Schließer/Öffner mit Klemmennummern und roten Blatt.Spalte-Querverweisen dargestellt.',
      'Permanentes +24V auf A1 & Drahtfarben im Plan: Fest angeschlossene Spulen (wie -K1, -K2, -K3 über -X1) werden als durchgehende blaue Leitung gezeichnet; 0V-Leitungen und -Schiene erscheinen blau-weiß.',
      'Lesbare Beschriftung unterhalb 0V: Betriebsarten, Zielzeiten und Bauteilnamen sitzen sauber im abgetrennten Feld weit unterhalb der 0V-Sammelschiene ohne Überlappung; Verdrahtungs-Hakenliste entfernt.',
    ],
  },
  {
    version: '1.18',
    title: 'Anlagenbau-Schaltplan (PDF), HTML-Animation, Prozessmodus, 230V AC (Orange) & Tank-Wellenschlag',
    date: '2026-11-18',
    changes: [
      'Modularer Anlagenbau-Schaltplan (PDF): Export im DIN-A4-Querformat mit einzeln abwählbaren Kapiteln (1. Deckblatt/Stückliste/Sollwerte, 2. Normnaher Stromlaufplan 230V/24V inkl. 0V-Sammelschiene & Koppelrelais, 3. Klemmenplan & Ader-Hakenliste, 4. Fluidik-/Pneumatik-R&I) zum direkten 1:1-Nachbau.',
      'Eigenständige HTML-Prozessanimation (.html): Exportiert eine interaktive, offlinefähige HTML-Animation für 24h / 48h / 72h (Endlos-Schleife standardmäßig EIN) ohne Klemmen & Kabel — inkl. Zeitregler, Tempo-Wahl & Ablauf-Log.',
      'Live-Animationsmodus in der App („Schaltplan | Animation“): Blendet Kabel, Klemmen & Schaltschrank-Hilfsblöcke aus, lässt Zeitrelais & Prozesse live laufen und zeigt Schaltkommentare im integrierten Ablauf-Ticker.',
      '230V AC Einspeisung (L/N/PE) in kräftigem Orange: Neues Netzanschluss-Bauteil sowie Wahl bei Luftpumpen zwischen 230V Direktanschluss (L/N/PE) und 24V-Steuersignal (im PDF automatisch mit 24V→230V Koppelrelais).',
      'Kräftigere Tank-Belüftung & Wellenbewegung: Mehr Sprudelblasen + animierte Flüssigkeitsoberfläche bei laufender Luftpumpe; Wasser-Medienfarbe zur besseren Unterscheidung von Druckluft auf tiefes Königsblau angepasst.',
      'Stillstand nach JSON-/Plan-Laden: Geöffnete Schaltpläne starten sauber im Pause-Zustand und laufen erst nach Druck auf „Start“.',
    ],
  },
  {
    version: '1.17',
    title: 'AnlagenSim Zahnrad-Menü, AquaForte Luftpumpen, Leuchtmelder, Wechselschalter & Signalleuchten',
    date: '2026-11-18',
    changes: [
      'Kopfleiste verschlankt & Zahnrad-Menü: Titel auf „AnlagenSim“ gekürzt; Pläne verwalten/löschen, JSON-Import/Export, PDF-Plan, Hell-/Dunkel-Modus, Ansicht-Zentrierung & App-Installation übersichtlich im neuen Zahnrad-Menü gebündelt.',
      'Offline-Hinweis & Copyright: Kompakter Offline-Status sitzt nun dezent neben „Copyright © 2026 #MAT“ rechts unten ohne die Zoom-Tasten zu verdecken.',
      'Startfüllstand bei Reset & Zeitraffer-Fix: Tanks starten nach Reset auf dem konfigurierbaren Startfüllstand (Standard 0% leer) und aktualisieren die Balkenfüllung im Zeitraffer ohne Verzögerung in Echtzeit.',
      'Helle grüne Schalt-Signalleuchten: Alle schaltenden und elektrisch angesteuerten Bauteile (Schalter, Zeitrelais, Schütz, Logikgatter, Magnetventile, Pumpen, Verbraucher) zeigen nun eine große, hell leuchtende grüne Status-LED.',
      'Neue Bauteile: Leuchtmelder (Grün/Rot) für schnelle Elektroschaltungstests, Wechselschalter (11 → 12/14) sowie AquaForte V-Serie Luftpumpe (V-10, V-20, V-30, V-60 nach Handbuch) mit Druckluftschlauch und animierten Sprudelblasen im Tank (Standard für Katholyte-Tanks).',
      'Neue Mediumfarben: Anolyt = Gelb, Katholyte = Grün, Wasser = Blau, Druckluft = Cyan.',
    ],
  },
  {
    version: '1.16',
    title: 'Hell/Dunkel-Design, Zeitsprung-Simulation, 5%-Mausrad-Zoom & UI-Feinschliff',
    date: '2026-11-17',
    changes: [
      'Hell/Dunkel-Umschaltung: Vollständige helle Benutzeroberfläche per Klick in der Kopfleiste umschaltbar (inkl. Schaltplan-Fläche, Klemmen, Bauteilen und Diagnose).',
      'Proportionaler Zeitsprung („Sprung“): Direkt auf beliebige Zielzeiten (z. B. 23:30) oder um feste Zeitspannen (+1 Min bis +24 Std) vorspulen — Tankfüllstände, Zeitrelais und Ventilschaltungen werden ereignisgenau so berechnet, als wäre die Zeit real abgelaufen.',
      'Mausrad-Zoom & 5%-Stufen: Direktes Hinein-/Herauszoomen über das Mausrad an der Cursorposition, feine 5%-Schritte auf den +/- Buttons und fixierte Kopfleiste, sodass sie auch im installierten PWA-Modus beim Zoomen nie verschwindet.',
      'Kopfleisten-Scroll-Pfeile & gespiegeltes Panel: Sichtbare Links-/Rechts-Pfeile zeigen verdeckte Werkzeuge in der Kopfleiste an; der Button zum Ausblenden des Eigenschaften-Panels sitzt nun links direkt an der Arbeitsfläche (spiegelbildlich zur Bauteil-Bibliothek).',
      'Copyright-Hinweis „© 2026 @MAT“ auf Arbeitsfläche und im Changelog ergänzt.',
    ],
  },
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
