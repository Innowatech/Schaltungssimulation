# Changelog — Mechatronik & Fluidik Baukasten

Alle Änderungen an diesem Projekt werden fortlaufend mit den Versionsnummern `1.0`, `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6`, `1.7`, `1.8`, `1.9`, `1.10`, `1.11`, `1.12` usw. dokumentiert.

## [1.12] — Aktuelle Version
### Hinzugefügt
- **Dynamische Verdrahtungs-Hilfe im Eigenschaften-Panel**: Sobald das Zeitrelais ausgewählt wird, zeigt eine übersichtliche Live-Box direkt unter der Funktionsauswahl an, wie die Klemmen (`A1`, `B1`, `15/16/18`) für die gerade aktive Funktion (`E`, `R`, `Ws`, etc.) verdrahtet werden müssen (z. B. ob `B1` angeschlossen sein muss oder offen bleiben darf).

## [1.11]
### Verbessert
- **Hindernis-Umfahrung für alle Leitungen (Hanan-Grid A\*)**: Sämtliche Elektro-, Analog- und Fluidleitungen umfahren alle Bauteile konsequent außen herum — keine Leitung läuft mehr versteckt unter einem Bauteil oder Igel hindurch, inklusive Live-Neuverlegung beim Verschieben.
- **Automatischer Mindestabstand beim Platzieren/Verschieben**: Liegt ein Bauteil beim Ablegen oder Verschieben näher als `36 px` an einem Nachbarbauteil, verschiebt es sich automatisch ein Stück auf den nächstgelegenen freien Platz, damit immer genug Leitungs- und Klemmenraum bleibt.

## [1.10]
### Hinzugefügt & Verbessert
- **Elektrisches Brücken & Durchschleifen**: Direkte Drahtbrücken zwischen Eingängen am selben Bauteil (z. B. `A1 → 15` oder `A1 → B1` am Zeitrelais, `A1 → 11` am Schütz), Selbsthalte-Rückführungen (z. B. `18 → B1` / `14 → A1`) sowie Weiterbrücken von Bauteil zu Bauteil (`K1 A1 → K2 A1`) werden vollständig simuliert.
- **Eigenschaften-Panel („Klemmen & Einzel-Leitungen“)**: Zeigt ab sofort unter jeder Klemme direkt deren volle Funktionsbeschreibung (z. B. `Öffner NC`, `Schließer NO`, `Wechsler COM`) und beschriftet das Einzel-Abklemmen klar mit **„Trennen“** samt `Ja/Nein`-Rückfrage.

## [1.9]
### Behoben
- **Bauteile einzeln verschieben**: `e.stopPropagation()` im `onPointerDown`-Handler von `ComponentNode` ergänzt und globales Fenster-Tracking für flüssiges Verschieben einzelner Bausteine ohne Mitbewegen des Hintergrunds umgesetzt.
- **Sichtbarkeit neu angeschlossener Leitungen**: Unveränderliche Array-Zuweisung (`this.connections = [...this.connections, conn]`) in `SimulationEngine` ergänzt, sodass `useMemo` die Leitungsdarstellung sofort neu zeichnet; außerdem `objectBoundingBox`-SVG-Filter auf exakt geraden 90°-Linien durch reine Vektor-Glow-Pfade ersetzt.
- **Kabel & Leitungen zuverlässig anschließen**: Verdrahtung unterstützt nun sowohl Klick-Klick als auch direktes Ziehen von Klemme zu Klemme mit vergrößerten 24-px-Klemmen-Trefferflächen und korrekter `z-index`-Schichtung über den Leitungsbahnen.

## [1.8]
### Hinzugefügt & Verbessert
- **TELE ENYA E1ZM10 Multifunktions-Zeitrelais (nach Datenblatt)**: Originalgetreue Klemmen (`A1`, `B1` Steuerkontakt, Wechsler `15–16–18`), alle 7 Funktionen (`E` Einschaltverzögert, `R` Rückfallverzögert, `Ws` Einschaltwischend, `Wa` Ausschaltwischend, `Es` Einschaltverzögert mit Steuerkontakt, `Wu` Einschaltwischend spannungsgesteuert, `Bp` Blinker pausenbeginnend), alle 7 Zeitbereiche (`1s` [50ms–1s] bis `100h` [5h–100h]), 5–100%-Skala sowie `U/t`- und `R`-LED-Statusanzeige.
- **Ergonomie & Bedienung**:
  - Bauteile lassen sich über eine **5-Pixel-Bewegungsschwelle** flüssig verschieben; alle angeschlossenen Leitungen wandern mit.
  - Browser-/Touch-Kontextmenü am Baustein deaktiviert; das **Zahnrad-Symbol** am Baustein öffnet direkt die Eigenschaften.
  - **90°-Orthogonales Routing**: Rechtwinklige Leitungsführung mit automatischer Abstandstrennung, Brücken-Sprungbogen bei Elektrik/Analog und Unterbrechungslücke bei kreuzenden Fluidrohren.
  - **Einzelnes Trennen mit Bestätigung**: Jede Leitung einzeln an der ausgewählten Leitung oder pro Klemme im Eigenschaften-Panel nach `Ja/Nein`-Bestätigung lösbar.
- **Leerer Start, Speicherliste & PDF-Plan-Viewer**: Start mit leerer Arbeitsfläche, lokale Simulations-Speicherliste (`localStorage`) und integrierter lokaler PDF-/Bild-Betrachter (`PDF-Plan`) zum direkten Nachbauen.
- **Erzeuger, Tanks & Dosiertechnik**:
  - **Erzeuger**: Getrennte Produktionsmengen für **Anolyte (blau)** und **Katholyte (grün)**, direkter Hand-Stopp-Taster, MIN/MAX-Hysterese (Anolyte ist führend; Überschuss-Katholyte wird über 3/2-Wege-Ventil in den Gulli geführt).
  - **Anolyte- & Katholyte-Tanks**: Konfigurierbare Schwimmerlanzen (inkl. Kontakte je Schaltpunkt invertierbar) und 0–4 Sauglanzen-Anschlüsse.
  - **Neue Bauteile**: **Gulli / Ablauf**, **Hauptwasserleitung**, **Wasserzähler** (Impuls-Taktung + 4–20mA), **Dosierpumpe (Grundfos DDA 17-7 / 60-10 / 120-7 / 200-4)**, **T-Stück** (`1→2` / `2→1`) und **Impfstelle** (inkl. Direkt-Einfügen in bestehende Rohre und `mL/m³`-Konzentrationsberechnung).

## [1.7]
### Behoben
- **GitHub Actions `ERESOLVE`-Fehler**: `npm install --legacy-peer-deps` in `.github/workflows/deploy.yml` ergänzt, um den optionalen Peer-Dependency-Konflikt zwischen `vite@8` und `esbuild@0.25` sauber aufzulösen.
- **Vite 8 Config**: `__dirname` in `vite.config.ts` auf `import.meta.dirname` umgestellt.

## [1.6]
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
