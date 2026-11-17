# Changelog — Mechatronik & Fluidik Baukasten

Alle Änderungen an diesem Projekt werden fortlaufend mit den Versionsnummern `1.0`, `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6` usw. dokumentiert.

## [1.6] — Aktuelle Version
### Behoben
- **GitHub Actions Build**: `cache: npm` und hartes `npm ci` in `.github/workflows/deploy.yml` durch automatische Lockfile-Prüfung (`npm ci` falls `package-lock.json` vorhanden, sonst `npm install`) ersetzt, damit der Build auch ohne `package-lock.json` sauber durchläuft.

## [1.5]
### Hinzugefügt
- **Installierbare PWA (PC & Smartphone)**: Vollständiges Web App Manifest (`standalone`), Service Worker mit Offline-Caching, hochauflösende App-Icons (`any`, `maskable`, `apple-touch-icon`), In-App-Installationsbutton (inkl. iOS-Safari-Anleitung) sowie Offline-Statusanzeige.
- **GitHub Pages Release-Workflow**: Automatisierte Build- und Deployment-Pipeline unter `.github/workflows/deploy.yml` mit dynamischer `base`-Pfad-Erkennung.
- **Mobile- & Touch-Optimierung**: Responsive Drawer-Panels auf schmalen Bildschirmen (`< 768px`), `100dvh`-Layout und `touch-none` auf der Arbeitsfläche für sauberes Verschieben auf Touch-Geräten.

## [1.4]
### Behoben & Verbessert
- **Schwimmerlanze (Separat)**: Behoben: `TypeError: can't access property "toFixed", levelPct is undefined` beim Rendern der getrennten Schwimmerlanze. `tankLevelPct` wird nun in der Simulation zuverlässig aus dem verknüpften Tank ermittelt und in der UI mit sicheren Fallbacks formatiert.

## [1.3]
### Hinzugefügt
- **Ein- und ausblendbare Seitenleisten**: Sowohl die linke **Bauteil-Bibliothek** als auch das rechte **Eigenschaften-/Fehler-Panel** lassen sich jetzt über die Schaltflächen in der Panel-Kopfzeile mit einem Klick ausblenden und über die schwebenden Rand-Buttons auf der Arbeitsfläche jederzeit wieder einblenden.

## [1.2]
### Hinzugefügt
- **Integriertes Changelog & Versionierung**: Einführung der fortlaufenden Versionszählung (`1.0`, `1.1`, `1.2`, …), gepflegt in `CHANGELOG.md` sowie direkt über die Versionsschaltfläche in der Steuerleiste abrufbar.

## [1.1]
### Hinzugefügt
- **Schaltplan Speichern & Laden (JSON)**: Explizite Buttons „Speichern“ und „Laden“ in der Steuerleiste zum Exportieren und Importieren kompletter Schaltpläne inklusive Parametern, Leitungen und Fehlerzuständen.
- **Fehler-Simulation & Diagnose**: Gezielte und zufällige Fehler (Kurzschluss, unterbrochene/blockierte Leitung, klemmendes Ventil, Ausfall der Spannungsversorgung) mit visueller Hervorhebung auf der Arbeitsfläche, Lokalisierung und Echtzeit-Auswirkungsanalyse im Diagnose-Tab.
- **Neue Bauteile (Logik & Messtechnik)**:
  - **Stromwandler**: Misst reale Stromstärke (A) nachgeschalteter Verbraucher und gibt `4–20 mA` oder `0–10 V` aus.
  - **Messumformer**: Wandelt Signale (`0–10 V → 4–20 mA`, `0–24 V → 4–20 mA`, `4–20 mA → 0–10 V`) inklusive einstellbarem 24V-Grenzwertausgang und Test-Slider.
  - **Logikgatter**: `AND`, `OR` und `NOT` für die 24V-Signalverarbeitung.
- **Neue Anlagen-Vorlage**: „Messtechnik & Logik (4–20mA + Gatter)“.

## [1.0]
### Hinzugefügt
- **Modulare Arbeitsfläche & OOP-Simulationskern**: Drag & Drop aus der Bauteil-Bibliothek, Klemmen-Verdrahtung per Mausklick, Pan & Zoom sowie erweiterbare `SimComponent`-Basisklasse.
- **Start-Bauteile**:
  - Spannungsquelle (`24V DC`) & Taster/Schalter (`Schalter rastend`, `Taster NO/NC`)
  - Zeitrelais (`Ansprechverzögert`, `Rückfallverzögert`, `Taktgeber` in `Sek / Min / Std`, Spule `A1`, Wechsler `15–16–18`)
  - Hilfsrelais / Schütz (Spule `A1`, `2x Wechsler`)
  - Tank (Liter einstellbar, animierte Füllstandsanzeige & manueller Test-Slider)
  - Schwimmerlanze (Tank-Zuordnung, Min-/Max-Schwellwerte in %)
  - Erzeuger-Anlage (`Liter/Stunde`, Freigabe & Sperre bei „Tank Voll“)
  - 3/2-Wege-Magnetventil & 2/2-Wege-Magnetventil (`NC / NO`)
  - Ablassventil / Verbraucher (`Liter/Stunde`)
- **Steuerleiste & Visualisierung**: Start/Pause, Einzelschritt (+1s), Reset, simulierte Gesamtzeit (`Tage : Stunden : Minuten`), stufenloser Zeitraffer (`1x`, `10x`, `60x`, `600x`, `3600x`), leuchtende 24V-Leitungen und animierte Fluid-Rohre.
