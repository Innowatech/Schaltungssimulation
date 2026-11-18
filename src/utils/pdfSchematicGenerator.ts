import { jsPDF } from 'jspdf';
import { TELE_TIME_RANGES, formatTeleDuration } from '../engine/components/Relays';
import {
  FluidMedium,
  SerializedCircuit,
  SerializedComponent,
} from '../engine/types';
import {
  ComponentObstacle,
  RouteEndpoint,
  routeAllOrthogonalWires,
} from './orthogonalRouting';

export interface PdfExportOptions {
  includeCoverAndBom: boolean;
  includeElectrical: boolean;
  includeWiringAndTerminals: boolean;
  includeFluidAndAir: boolean;
}

interface BmkEntry {
  comp: SerializedComponent;
  bmk: string;
  categoryLabel: string;
  specSummary: string;
  settingSummary: string;
}

interface NormalizedConnection {
  id: string;
  domain: 'electrical' | 'fluid' | 'air' | 'analog';
  fromCompId: string;
  fromPortId: string;
  toCompId: string;
  toPortId: string;
  isSelfBridge: boolean;
}

interface WireChecklistItem {
  nr: number;
  fromBmk: string;
  fromPort: string;
  toBmk: string;
  toPort: string;
  potential: string;
  colorSpec: string;
  note: string;
  isSynthesized: boolean;
}

interface CouplingRelayVirtual {
  bmk: string;
  label: string;
  airPumpId: string;
  airPumpBmk: string;
  airPumpLabel: string;
  triggerSourceText: string;
}

interface CurrentPathItem {
  pathNr: number;
  title: string;
  feederText: string;
  contactsText: string[];
  b1Text?: string;
  coilBmk: string;
  coilTopTerm: string;
  coilBottomTerm: string;
  coilKind: 'timer' | 'contactor' | 'valve' | 'lamp' | 'generator' | 'drain' | 'probe' | 'logic' | 'dosing';
  functionCode?: string;
  mirrorEntries: Array<{ term: string; kind: 'NO' | 'NC'; targetPathText: string }>;
}

const COMPONENT_SIZE_FALLBACK: Record<string, { w: number; h: number }> = {
  power_24v: { w: 160, h: 96 },
  power_230v: { w: 176, h: 104 },
  terminal_block: { w: 210, h: 180 },
  switch: { w: 164, h: 96 },
  changeover_switch: { w: 180, h: 114 },
  indicator_green: { w: 148, h: 104 },
  indicator_red: { w: 148, h: 104 },
  timer_relay: { w: 208, h: 172 },
  contactor_relay: { w: 200, h: 168 },
  current_transformer: { w: 196, h: 140 },
  signal_transmitter: { w: 204, h: 160 },
  logic_and: { w: 166, h: 112 },
  logic_or: { w: 166, h: 112 },
  logic_not: { w: 166, h: 112 },
  tank: { w: 224, h: 264 },
  anolyte_tank: { w: 224, h: 264 },
  katholyte_tank: { w: 224, h: 264 },
  generator: { w: 216, h: 176 },
  air_pump: { w: 208, h: 144 },
  dosing_pump: { w: 220, h: 186 },
  main_water_line: { w: 196, h: 124 },
  water_meter: { w: 208, h: 152 },
  injection_point: { w: 200, h: 132 },
  fluid_tee: { w: 148, h: 110 },
  valve_32: { w: 196, h: 136 },
  valve_22: { w: 186, h: 124 },
  gully_drain: { w: 164, h: 112 },
  drain_consumer: { w: 188, h: 128 },
  float_probe: { w: 188, h: 148 },
};

/**
 * Bereinigt Zeichenketten fuer Helvetica WinAnsi-Encoding in jsPDF
 * (Deutsche Umlaute bleiben voll erhalten, Sonderpfeile werden zu ASCII gewandelt).
 */
function pdfSafe(input: string | number | undefined | null): string {
  const s = String(input ?? '');
  return s
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↔/g, '<->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .replace(/·/g, '-')
    .replace(/•/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/~/g, '~')
    .replace(/[^\x20-\xFF]/g, '');
}

function normalizePortId(compType: string, portId: string): string {
  if (compType === 'generator') {
    if (portId === 'fluid_out') return 'fluid_anolyte';
    if (portId === 'enable_in') return 'v24_in';
  }
  if (compType === 'valve_32') {
    if (portId === 'p_in') return 'fluid_p';
    if (portId === 'a_out') return 'fluid_a';
    if (portId === 'b_out') return 'fluid_b';
    if (portId === 'v24_in') return 'a1';
  }
  if (compType === 'valve_22') {
    if (portId === 'p_in') return 'fluid_in';
    if (portId === 'a_out') return 'fluid_out';
    if (portId === 'v24_in') return 'a1';
  }
  if (compType === 'drain_consumer' && portId === 'ctrl_in') {
    return 'v24_in';
  }
  return portId;
}

function formatPortLabel(compType: string, portId: string): string {
  const p = normalizePortId(compType, portId);
  const map: Record<string, string> = {
    out_24v: '+24V',
    out_230v: 'L (230V~)',
    in_24v: '+24V IN',
    in: '13 (IN)',
    out: '14 (OUT)',
    com: '11 (COM)',
    nc: '12 (NC)',
    no: '14 (NO)',
    a1: 'A1 (+)',
    a2: 'A2 (0V)',
    b1: 'B1 (S)',
    com_15: '15 (COM)',
    nc_16: '16 (NC)',
    no_18: '18 (NO)',
    com_11: '11 (COM)',
    nc_12: '12 (NC)',
    no_14: '14 (NO)',
    com_21: '21 (COM)',
    nc_22: '22 (NC)',
    no_24: '24 (NO)',
    v24_in: '+24V',
    max_in: 'MAX (+24V)',
    min_in: 'MIN (+24V)',
    lock_in: 'SPERRE (+24V)',
    l_230v: 'L (230V~)',
    air_out: 'Druckluft AUS',
    air_in: 'Druckluft EIN',
    fluid_p: 'P (Eingang)',
    fluid_a: 'A (NC)',
    fluid_b: 'B (NO)',
    fluid_in: 'Fluid EIN',
    fluid_out: 'Fluid AUS',
    fluid_anolyte: 'Anolyt AUS',
    fluid_katholyte: 'Katholyte AUS',
    out_dry: 'S1 Trocken',
    out_pre_low: 'S2 Vor-Leer',
    out_min: 'S3 MIN',
    out_max: 'S4 MAX',
    out_overflow: 'S5 Ueberlauf',
    pulse_out: 'Impuls (+24V)',
    pulse_in: 'Impuls EIN',
    analog_out: '4-20mA AUS',
    analog_in: '4-20mA EIN',
    elec_in: 'U-IN (24V)',
    thresh_out: 'Q Grenzwert',
    i1: 'I1',
    i2: 'I2',
    q: 'Q',
    main_in: 'Hauptstrom EIN',
    dosing_in: 'Impfung EIN',
    fluid_in_1: 'EIN 1',
    fluid_in_2: 'EIN 2',
    fluid_out_1: 'AUS 1',
    fluid_out_2: 'AUS 2',
  };
  if (map[p]) return map[p];
  if (p.startsWith('out_')) return `Kl. ${p.slice(4)}`;
  if (p.startsWith('suction_')) return `Saug ${p.slice(8)}`;
  return p;
}

function getTimerTargetSeconds(comp: SerializedComponent): number {
  const rangeId = String(comp.params?.teleRange ?? '10s');
  const scalePct = Math.max(5, Math.min(100, Number(comp.params?.teleScalePct ?? 50)));
  const info = TELE_TIME_RANGES.find((r) => r.id === rangeId) ?? TELE_TIME_RANGES[1];
  return Math.max(0.05, (scalePct / 100) * info.maxSeconds);
}

function buildBmkEntries(components: SerializedComponent[]): Map<string, BmkEntry> {
  const result = new Map<string, BmkEntry>();
  const counters: Record<string, number> = {};
  const usedBmks = new Set<string>();

  const nextBmk = (prefix: string): string => {
    let idx = (counters[prefix] ?? 0) + 1;
    while (usedBmks.has(`-${prefix}${idx}`)) {
      idx++;
    }
    counters[prefix] = idx;
    const bmk = `-${prefix}${idx}`;
    usedBmks.add(bmk);
    return bmk;
  };

  const ordered = [...components].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const comp of ordered) {
    let bmk = '';
    let categoryLabel = comp.type;
    let specSummary = '-';
    let settingSummary = '-';

    switch (comp.type) {
      case 'power_230v':
        bmk = nextBmk('Q');
        categoryLabel = '230V AC Einspeisung (L/N/PE)';
        specSummary = '230V AC 50Hz, L / N / PE mit Hauptschalter';
        settingSummary = comp.params?.enabled === false ? 'Schalter: AUS' : 'Schalter: EIN';
        break;
      case 'power_24v':
        bmk = nextBmk('G');
        categoryLabel = '24V DC Netzteil (SELV)';
        specSummary = 'Primaer 230V AC -> Sekundaer +24V DC / 0V';
        settingSummary = comp.params?.enabled === false ? 'Netzteil: AUS' : 'Netzteil: EIN (24V)';
        break;
      case 'terminal_block':
        bmk = nextBmk('X');
        categoryLabel = '24V-Potentialverteiler';
        specSummary = `Reihenklemmenblock ${Number(comp.params?.outputCount ?? 10)}-fach (+24V)`;
        settingSummary = `${Number(comp.params?.outputCount ?? 10)} Abgaenge`;
        break;
      case 'switch':
        bmk = nextBmk('S');
        categoryLabel = 'Taster / Steuerschalter';
        specSummary = 'Schaltkontakt 13-14';
        settingSummary = `Modus: ${String(comp.params?.mode ?? 'toggle')}`;
        break;
      case 'changeover_switch':
        bmk = nextBmk('S');
        categoryLabel = 'Wechselschalter';
        specSummary = 'Umschalter 11 (COM) -> 12 (NC) / 14 (NO)';
        settingSummary = comp.params?.switched ? 'Stellung II (11->14)' : 'Stellung I (11->12)';
        break;
      case 'indicator_green':
      case 'indicator_red':
        bmk = nextBmk('H');
        categoryLabel = comp.type === 'indicator_red' ? 'Leuchtmelder Rot' : 'Leuchtmelder Gruen';
        specSummary = 'LED-Melder 24V DC (X1 = +24V, X2 = 0V)';
        settingSummary = comp.type === 'indicator_red' ? 'Farbe: Rot' : 'Farbe: Gruen';
        break;
      case 'timer_relay': {
        bmk = nextBmk('K');
        categoryLabel = 'TELE ENYA E1ZM10 Zeitrelais';
        specSummary = 'Spule A1(+24V)/A2(0V), B1, Wechsler 15-16/18';
        const fn = String(comp.params?.teleFunction ?? 'E');
        const targetSec = getTimerTargetSeconds(comp);
        settingSummary = `Fkt: ${fn} | Bereich: ${String(comp.params?.teleRange ?? '10s')} (${Number(
          comp.params?.teleScalePct ?? 50
        )}%) = ${formatTeleDuration(targetSec)}`;
        break;
      }
      case 'contactor_relay':
        bmk = nextBmk('KA');
        categoryLabel = 'Hilfsrelais / Schuetz (2x W)';
        specSummary = 'Spule A1(+24V)/A2(0V), 11-12/14 & 21-22/24';
        settingSummary = '2x potentialfreier Wechsler';
        break;
      case 'current_transformer':
        bmk = nextBmk('T');
        categoryLabel = 'Stromwandler';
        specSummary = '24V Messschleife -> Analogausgang';
        settingSummary = `Max: ${Number(comp.params?.maxCurrentAmps ?? 10)} A -> ${String(
          comp.params?.outputType ?? '4_20mA'
        )}`;
        break;
      case 'signal_transmitter':
        bmk = nextBmk('U');
        categoryLabel = 'Messumformer';
        specSummary = 'Analog-/Spannungswandler + Q24V Grenzwert';
        settingSummary = `${String(comp.params?.conversionMode ?? 'v10_to_ma')} | Schwelle ${Number(
          comp.params?.thresholdPct ?? 50
        )}%`;
        break;
      case 'logic_and':
      case 'logic_or':
      case 'logic_not':
        bmk = nextBmk('D');
        categoryLabel = `Logikgatter ${comp.type.replace('logic_', '').toUpperCase()}`;
        specSummary = '24V Logikbaustein (inkl. 0V Referenz)';
        settingSummary = comp.type.replace('logic_', '').toUpperCase();
        break;
      case 'generator':
        bmk = nextBmk('E');
        categoryLabel = 'Erzeuger-Anlage';
        specSummary = '24V Steuereingaenge (MAX/MIN/SPERRE), 0V GND';
        settingSummary = `Anolyt ${Number(comp.params?.anolyteFlowLph ?? 50)} L/h | Katholyte ${Number(
          comp.params?.katholyteFlowLph ?? 8
        )} L/h`;
        break;
      case 'tank':
      case 'anolyte_tank':
      case 'katholyte_tank': {
        bmk = nextBmk('B');
        const med = String(
          comp.params?.medium ??
            (comp.type === 'anolyte_tank'
              ? 'anolyte'
              : comp.type === 'katholyte_tank'
              ? 'katholyte'
              : 'water')
        );
        const medLabel = med === 'katholyte' ? 'Katholyte' : med === 'anolyte' ? 'Anolyt' : 'Wasser';
        categoryLabel = `Vorratsbehaelter (${medLabel})`;
        specSummary = `${Number(comp.params?.capacityLiters ?? 500)} L | Lanze: ${String(
          comp.params?.probeMode ?? '3_points'
        )}`;
        settingSummary = `MIN ${Number(comp.params?.minPct ?? 40)}% / MAX ${Number(
          comp.params?.maxPct ?? 80
        )}% | Start ${Number(comp.params?.initialLevelPct ?? 0)}%`;
        break;
      }
      case 'air_pump': {
        bmk = nextBmk('AP');
        const model = String(comp.params?.model ?? 'V-20');
        const pMode = String(comp.params?.powerMode ?? 'ac_230v_direct');
        categoryLabel = `Luftpumpe AquaForte ${model}`;
        specSummary =
          pMode === 'external_24v'
            ? '230V AC ueber 24V-Koppelrelais (L/N/PE + A1/A2)'
            : pMode === 'fixed_power'
            ? '230V AC Steckernetzteil (L/N/PE)'
            : '230V AC Direktanschluss (L/N/PE)';
        settingSummary = `Modell ${model} | Betrieb: ${pMode}`;
        break;
      }
      case 'dosing_pump':
        bmk = nextBmk('DP');
        categoryLabel = `Dosierpumpe Grundfos ${String(comp.params?.model ?? 'DDA 17-7')}`;
        specSummary = 'Steuerung 24V / Impuls / 4-20mA (+ 0V GND)';
        settingSummary = `Modus: ${String(comp.params?.controlMode ?? 'manual')} | Soll: ${Number(
          comp.params?.manualFlowLph ?? 5
        )} L/h`;
        break;
      case 'valve_32':
        bmk = nextBmk('Y');
        categoryLabel = '3/2-Wege-Magnetventil';
        specSummary = 'Spule A1(+24V)/A2(0V), Fluid P -> A(NC) / B(NO)';
        settingSummary = 'Ruhestellung P->A / Bestromt P->B';
        break;
      case 'valve_22':
        bmk = nextBmk('Y');
        categoryLabel = '2/2-Wege-Magnetventil';
        specSummary = 'Spule A1(+24V)/A2(0V), Nenn-Durchfluss';
        settingSummary = `${String(comp.params?.normalState ?? 'NC')} | max. ${Number(
          comp.params?.flowRateLph ?? 200
        )} L/h`;
        break;
      case 'drain_consumer':
        bmk = nextBmk('V');
        categoryLabel = 'Abnahmeventil / Verbraucher';
        specSummary = '24V angesteuert (+24V / 0V GND)';
        settingSummary = `Entnahme: ${Number(comp.params?.drainRateLph ?? 30)} L/h`;
        break;
      case 'water_meter':
        bmk = nextBmk('WM');
        categoryLabel = 'Kontakt-Wasserzaehler';
        specSummary = 'Reed-Kontakt +24V Impuls / 4-20mA';
        settingSummary = `${Number(comp.params?.litersPerPulse ?? 10)} L/Impuls`;
        break;
      case 'main_water_line':
        bmk = nextBmk('W');
        categoryLabel = 'Hauptleitung Rohwasser';
        specSummary = 'Versorgungsleitung';
        settingSummary = `${Number(comp.params?.flowRateLph ?? 1000)} L/h`;
        break;
      case 'injection_point':
        bmk = nextBmk('I');
        categoryLabel = 'Impfstelle';
        specSummary = 'Dosier-Einbindung in Hauptstrom';
        settingSummary = 'Mischstrecke';
        break;
      case 'fluid_tee':
        bmk = nextBmk('FT');
        categoryLabel = 'T-Stueck (Fluid)';
        specSummary = 'Rohr-Verteiler / Sammler';
        settingSummary = String(comp.params?.teeMode ?? 'split_1to2');
        break;
      case 'gully_drain':
        bmk = nextBmk('GD');
        categoryLabel = 'Gulli / Ablauf';
        specSummary = 'Freier Verwurf / Kanalablauf';
        settingSummary = 'Ablauf drucklos';
        break;
      case 'float_probe':
        bmk = nextBmk('SL');
        categoryLabel = 'Schwimmerlanze (Extern)';
        specSummary = 'Potentialfreie Fuellstandskontakte';
        settingSummary = `MIN ${Number(comp.params?.minPct ?? 40)}% / MAX ${Number(
          comp.params?.maxPct ?? 80
        )}%`;
        break;
      default:
        bmk = nextBmk('B');
        break;
    }

    result.set(comp.id, {
      comp,
      bmk,
      categoryLabel,
      specSummary,
      settingSummary,
    });
  }

  return result;
}

function drawPageChrome(
  doc: jsPDF,
  circuitName: string,
  sectionTitle: string,
  pageNumber: number,
  totalPages: number,
  dateStr: string
): void {
  const W = 297;
  const H = 210;

  // Aussenrahmen (DIN-angelehnt)
  doc.setDrawColor(40, 52, 70);
  doc.setLineWidth(0.5);
  doc.rect(8, 8, W - 16, H - 16);

  // Kopfzeile
  doc.setFillColor(241, 245, 249);
  doc.rect(8, 8, W - 16, 12, 'F');
  doc.line(8, 20, W - 8, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe(`AnlagenSim  |  ${circuitName}`), 12, 15.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(3, 105, 161);
  doc.text(pdfSafe(sectionTitle), 148.5, 15.5, { align: 'center' });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.text(pdfSafe(`Blatt ${pageNumber} / ${totalPages}`), W - 12, 15.5, { align: 'right' });

  // Fusszeilen-Schriftfeld
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(8, H - 15, W - 8, H - 15);
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    pdfSafe('Anlagenbau-Dokumentation (inkl. 230V AC / 24V DC / 0V GND / N / PE)'),
    12,
    H - 10.2
  );
  doc.text(pdfSafe(`Erstellt: ${dateStr}`), 175, H - 10.2);
  doc.setFont('helvetica', 'bold');
  doc.text(pdfSafe('Copyright (c) 2026 #MAT'), W - 12, H - 10.2, { align: 'right' });
}

function drawTableRow(
  doc: jsPDF,
  x: number,
  y: number,
  colWidths: number[],
  cells: string[],
  rowHeight: number,
  isHeader = false,
  highlightWarn = false
): void {
  if (isHeader) {
    doc.setFillColor(30, 41, 59);
    doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(248, 250, 252);
  } else {
    if (highlightWarn) {
      doc.setFillColor(254, 243, 199);
      doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
    }
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(x, y + rowHeight, x + colWidths.reduce((a, b) => a + b, 0), y + rowHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
  }

  let curX = x;
  for (let i = 0; i < cells.length; i++) {
    const w = colWidths[i];
    const txt = pdfSafe(cells[i]);
    const fitted = doc.splitTextToSize(txt, Math.max(8, w - 3));
    const line = Array.isArray(fitted) ? fitted[0] : String(fitted);
    doc.text(line || '', curX + 1.5, y + rowHeight * 0.65);
    curX += w;
  }
}

export function generateCircuitPdf(
  circuit: SerializedCircuit,
  circuitName: string,
  options: PdfExportOptions
): void {
  const hasAnySection =
    options.includeCoverAndBom ||
    options.includeElectrical ||
    options.includeWiringAndTerminals ||
    options.includeFluidAndAir;
  if (!hasAnySection) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const cleanName = circuitName || circuit.name || 'Mechatronik-Anlage';
  const dateStr = new Date().toLocaleDateString('de-DE');
  const compMap = new Map(circuit.components.map((c) => [c.id, c]));
  const bmkMap = buildBmkEntries(circuit.components);

  // Normalisierte Verbindungen + Plausibilitaetspruefung
  const warnings: string[] = [];
  const validConnections: NormalizedConnection[] = [];

  for (const conn of circuit.connections) {
    const fc = compMap.get(conn.fromComponentId);
    const tc = compMap.get(conn.toComponentId);
    if (!fc || !tc) continue;

    const fp = normalizePortId(fc.type, conn.fromPortId);
    const tp = normalizePortId(tc.type, conn.toPortId);

    // Pruefe Legacy-"a2" an +24V-Potentialverteiler oder Ausgang
    if (conn.domain === 'electrical' && (tp === 'a2' || fp === 'a2')) {
      const targetComp = tp === 'a2' ? tc : fc;
      const otherComp = tp === 'a2' ? fc : tc;
      const tBmk = bmkMap.get(targetComp.id)?.bmk ?? targetComp.label;
      const oBmk = bmkMap.get(otherComp.id)?.bmk ?? otherComp.label;
      warnings.push(
        `Korrektur A2: Im Simulations-JSON war ${tBmk} (${targetComp.label}) Klemme A2 an ${oBmk} (+24V) verdrahtet. Im Anlagenbau-PDF wurde A2 sicher auf 0V (GND) gelegt!`
      );
      continue;
    }

    validConnections.push({
      id: conn.id,
      domain: conn.domain,
      fromCompId: conn.fromComponentId,
      fromPortId: fp,
      toCompId: conn.toComponentId,
      toPortId: tp,
      isSelfBridge: conn.fromComponentId === conn.toComponentId,
    });
  }

  // Luftpumpen prüfen: Bei external_24v entsteht ein reales Koppelrelais (-KA_AP)
  const airPumps = circuit.components.filter((c) => c.type === 'air_pump');
  const couplingRelays: CouplingRelayVirtual[] = [];
  let kaIdx =
    circuit.components.filter((c) => c.type === 'contactor_relay').length + 1;

  for (const ap of airPumps) {
    const pMode = String(ap.params?.powerMode ?? 'ac_230v_direct');
    const apBmk = bmkMap.get(ap.id)?.bmk ?? 'AP';
    if (pMode === 'external_24v') {
      const incoming24v = validConnections.find(
        (c) =>
          c.domain === 'electrical' &&
          (c.toCompId === ap.id || c.fromCompId === ap.id) &&
          (c.toPortId === 'a1' || c.fromPortId === 'a1')
      );
      let triggerText = '+24V Steuersignal (offen / noch anschliessen)';
      if (incoming24v) {
        const srcId =
          incoming24v.toCompId === ap.id
            ? incoming24v.fromCompId
            : incoming24v.toCompId;
        const srcPort =
          incoming24v.toCompId === ap.id
            ? incoming24v.fromPortId
            : incoming24v.toPortId;
        const sc = compMap.get(srcId);
        const sb = bmkMap.get(srcId)?.bmk ?? '?';
        triggerText = `${sb}:${formatPortLabel(sc?.type ?? '', srcPort)}`;
      }
      couplingRelays.push({
        bmk: `-KA${kaIdx++}`,
        label: `Koppelrelais 24V->230V (${apBmk})`,
        airPumpId: ap.id,
        airPumpBmk: apBmk,
        airPumpLabel: ap.label,
        triggerSourceText: triggerText,
      });
    } else if (
      pMode === 'ac_230v_direct' &&
      !circuit.components.some((c) => c.type === 'power_230v')
    ) {
      warnings.push(
        `Hinweis 230V: Luftpumpe ${apBmk} (${ap.label}) steht auf 230V Direktanschluss, es ist jedoch kein Q1 230V-Block auf der Arbeitsflaeche platziert. Im Schaltplan wird 230V L/N/PE bauseits vorgesehen.`
      );
    }
  }

  // Synthetische 0V-Sammelschiene (-X0) & Verdrahtungs-Checkliste erzeugen
  const wireList: WireChecklistItem[] = [];
  let wireNr = 1;

  // 1) Reale Verbindungen aus der Simulation
  for (const cn of validConnections) {
    if (cn.domain !== 'electrical' && cn.domain !== 'analog') continue;
    const fc = compMap.get(cn.fromCompId)!;
    const tc = compMap.get(cn.toCompId)!;
    const fb = bmkMap.get(fc.id)?.bmk ?? fc.label;
    const tb = bmkMap.get(tc.id)?.bmk ?? tc.label;
    const is230v =
      fc.type === 'power_230v' ||
      cn.fromPortId === 'l_230v' ||
      cn.toPortId === 'l_230v';

    // Falls Luftpumpe im 24V Koppelrelais-Modus an a1 haengt -> geht im Schaltschrank auf Koppelrelais Spule A1
    const kr = couplingRelays.find(
      (k) => k.airPumpId === tc.id && cn.toPortId === 'a1'
    );

    wireList.push({
      nr: wireNr++,
      fromBmk: fb,
      fromPort: formatPortLabel(fc.type, cn.fromPortId),
      toBmk: kr ? kr.bmk : tb,
      toPort: kr ? 'A1 (+)' : formatPortLabel(tc.type, cn.toPortId),
      potential:
        cn.domain === 'analog'
          ? '4-20mA / 0-10V'
          : is230v
          ? '230V AC Phase (L)'
          : '+24V DC',
      colorSpec:
        cn.domain === 'analog'
          ? 'LiYCY 2x0.5 (WS/BN)'
          : is230v
          ? 'H07V-K 1.5 mm2 Braun'
          : cn.isSelfBridge
          ? 'H07V-K 0.75 mm2 Rot (Bruecke)'
          : 'H07V-K 0.75 mm2 Rot',
      note: cn.isSelfBridge
        ? 'Direkte Drahtbruecke am Bauteil'
        : kr
        ? `Steuert Koppelrelais fuer ${tb}`
        : '',
      isSynthesized: false,
    });
  }

  // 2) Synthetische 230V AC Netz- & 0V/N/PE Rueckleiter fuer echten Anlagenbau
  const psu24s = circuit.components.filter((c) => c.type === 'power_24v');
  const psu230s = circuit.components.filter((c) => c.type === 'power_230v');

  for (const g of psu24s) {
    const gb = bmkMap.get(g.id)?.bmk ?? '-G1';
    wireList.push(
      {
        nr: wireNr++,
        fromBmk: 'Netzeinspeisung',
        fromPort: 'L1 (230V~)',
        toBmk: gb,
        toPort: 'L (AC IN)',
        potential: '230V AC Phase (L)',
        colorSpec: 'H07V-K 1.5 mm2 Braun',
        note: 'Primaerversorgung 24V-Netzteil (ueber LS B6/B10)',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: 'Netzeinspeisung',
        fromPort: 'N',
        toBmk: gb,
        toPort: 'N (AC IN)',
        potential: '230V Neutralleiter (N)',
        colorSpec: 'H07V-K 1.5 mm2 Blau',
        note: 'Primaer-Neutralleiter',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: 'PE-Schiene',
        fromPort: 'PE',
        toBmk: gb,
        toPort: 'PE',
        potential: 'Schutzleiter PE',
        colorSpec: 'H07V-K 1.5 mm2 Gruen/Gelb',
        note: 'Schutzerdung Netzteilgehaeuse',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: gb,
        fromPort: '0V (-DC)',
        toBmk: '-X0',
        toPort: '0V-Sammelschiene',
        potential: '0V DC (GND / Masse)',
        colorSpec: 'H07V-K 1.0 mm2 Dunkelblau',
        note: 'Zentrale 0V-Masseverteilung (SELV)',
        isSynthesized: true,
      }
    );
  }

  for (const q of psu230s) {
    const qb = bmkMap.get(q.id)?.bmk ?? '-Q1';
    wireList.push(
      {
        nr: wireNr++,
        fromBmk: 'Netzeinspeisung',
        fromPort: 'N',
        toBmk: qb,
        toPort: 'N-Klemme',
        potential: '230V Neutralleiter (N)',
        colorSpec: 'H07V-K 1.5 mm2 Blau',
        note: 'Durchfuehrung fuer 230V-Verbraucher',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: 'PE-Schiene',
        fromPort: 'PE',
        toBmk: qb,
        toPort: 'PE-Klemme',
        potential: 'Schutzleiter PE',
        colorSpec: 'H07V-K 1.5 mm2 Gruen/Gelb',
        note: 'Schutzleiter fuer 230V-Verbraucher',
        isSynthesized: true,
      }
    );
  }

  // Alle 24V-Verbraucher mit realer 0V (GND) Rueckleitung
  const ZERO_V_TYPES = new Set([
    'timer_relay',
    'contactor_relay',
    'valve_32',
    'valve_22',
    'drain_consumer',
    'indicator_green',
    'indicator_red',
    'generator',
    'dosing_pump',
    'signal_transmitter',
    'current_transformer',
    'logic_and',
    'logic_or',
    'logic_not',
  ]);
  for (const comp of circuit.components) {
    if (!ZERO_V_TYPES.has(comp.type)) continue;
    const bmk = bmkMap.get(comp.id)?.bmk ?? comp.label;
    const termName =
      comp.type === 'timer_relay' ||
      comp.type === 'contactor_relay' ||
      comp.type === 'valve_32' ||
      comp.type === 'valve_22'
        ? 'A2 (0V)'
        : comp.type.startsWith('indicator')
        ? 'X2 (0V)'
        : '0V (GND)';

    wireList.push({
      nr: wireNr++,
      fromBmk: bmk,
      fromPort: termName,
      toBmk: '-X0',
      toPort: '0V-Sammelschiene',
      potential: '0V DC (GND)',
      colorSpec: 'H07V-K 0.75 mm2 Dunkelblau',
      note: 'Pflicht-Rueckleiter fuer Schaltfunktion',
      isSynthesized: true,
    });
  }

  // Koppelrelais 0V + 230V Lastkreis + N/PE aller Luftpumpen
  for (const kr of couplingRelays) {
    wireList.push(
      {
        nr: wireNr++,
        fromBmk: kr.bmk,
        fromPort: 'A2 (0V)',
        toBmk: '-X0',
        toPort: '0V-Sammelschiene',
        potential: '0V DC (GND)',
        colorSpec: 'H07V-K 0.75 mm2 Dunkelblau',
        note: 'Spulen-Rueckleiter Koppelrelais',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: psu230s[0] ? bmkMap.get(psu230s[0].id)!.bmk : '230V-Netz',
        fromPort: 'L (230V~)',
        toBmk: kr.bmk,
        toPort: '11 (COM 230V)',
        potential: '230V AC Phase (L)',
        colorSpec: 'H07V-K 1.5 mm2 Braun',
        note: 'Lastphase auf Koppelrelais-Schliesser',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: kr.bmk,
        fromPort: '14 (NO 230V)',
        toBmk: kr.airPumpBmk,
        toPort: 'L (230V~)',
        potential: '230V AC geschaltet (L\')',
        colorSpec: 'H07V-K 1.5 mm2 Schwarz/Braun',
        note: 'Geschaltete Phase zur Luftpumpe',
        isSynthesized: true,
      }
    );
  }

  for (const ap of airPumps) {
    const ab = bmkMap.get(ap.id)?.bmk ?? 'AP';
    const src230 = psu230s[0] ? bmkMap.get(psu230s[0].id)!.bmk : '230V-Netz';
    wireList.push(
      {
        nr: wireNr++,
        fromBmk: ab,
        fromPort: 'N',
        toBmk: src230,
        toPort: 'N-Klemme',
        potential: '230V Neutralleiter (N)',
        colorSpec: 'H07V-K 1.5 mm2 Blau',
        note: '230V Betriebsstromkreis Luftpumpe',
        isSynthesized: true,
      },
      {
        nr: wireNr++,
        fromBmk: ab,
        fromPort: 'PE',
        toBmk: src230,
        toPort: 'PE-Klemme',
        potential: 'Schutzleiter PE',
        colorSpec: 'H07V-K 1.5 mm2 Gruen/Gelb',
        note: 'Schutzleiter Luftpumpe',
        isSynthesized: true,
      }
    );
  }

  // Strompfade fuer Normnahen Stromlaufplan aufbauen
  const consumerTypesForPaths = new Set([
    'timer_relay',
    'contactor_relay',
    'valve_32',
    'valve_22',
    'indicator_green',
    'indicator_red',
    'drain_consumer',
    'generator',
    'dosing_pump',
    'signal_transmitter',
    'current_transformer',
    'logic_and',
    'logic_or',
    'logic_not',
  ]);

  const currentPaths: CurrentPathItem[] = [];
  const compToPathNr = new Map<string, number>();

  const consumerComps = [...circuit.components]
    .filter((c) => consumerTypesForPaths.has(c.type))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Erste Zuordnung der Pfadnummern
  let nextPathNr = 2; // Pfad 1 = 230V/24V Versorgung auf Blatt 1
  for (const c of consumerComps) {
    compToPathNr.set(c.id, nextPathNr++);
  }
  const krToPathNr = new Map<string, number>();
  for (const kr of couplingRelays) {
    krToPathNr.set(kr.bmk, nextPathNr++);
  }

  const findFeedersForPort = (compId: string, portIds: string[]): string[] => {
    const res: string[] = [];
    for (const cn of validConnections) {
      if (cn.domain !== 'electrical') continue;
      if (cn.toCompId === compId && portIds.includes(cn.toPortId)) {
        const sc = compMap.get(cn.fromCompId);
        const sb = bmkMap.get(cn.fromCompId)?.bmk ?? sc?.label ?? '?';
        res.push(`${sb}:${formatPortLabel(sc?.type ?? '', cn.fromPortId)}`);
      } else if (cn.fromCompId === compId && portIds.includes(cn.fromPortId)) {
        const dc = compMap.get(cn.toCompId);
        const db = bmkMap.get(cn.toCompId)?.bmk ?? dc?.label ?? '?';
        res.push(`${db}:${formatPortLabel(dc?.type ?? '', cn.toPortId)}`);
      }
    }
    return res;
  };

  for (const c of consumerComps) {
    const pNr = compToPathNr.get(c.id)!;
    const bmk = bmkMap.get(c.id)?.bmk ?? c.label;
    const targetCoilPorts =
      c.type === 'timer_relay' || c.type === 'contactor_relay' || c.type === 'valve_32' || c.type === 'valve_22'
        ? ['a1']
        : c.type === 'generator'
        ? ['max_in', 'v24_in', 'min_in']
        : c.type === 'signal_transmitter'
        ? ['elec_in']
        : c.type.startsWith('logic_')
        ? ['i1', 'i2']
        : ['in', 'v24_in', 'pulse_in'];

    const feeders = findFeedersForPort(c.id, targetCoilPorts);
    const b1Feeders = c.type === 'timer_relay' ? findFeedersForPort(c.id, ['b1']) : [];

    // Kontaktspiegel bei Relais aufbauen
    const mirrorEntries: CurrentPathItem['mirrorEntries'] = [];
    if (c.type === 'timer_relay' || c.type === 'contactor_relay') {
      const contactPorts =
        c.type === 'timer_relay'
          ? [
              { id: 'nc_16', label: '15-16', kind: 'NC' as const },
              { id: 'no_18', label: '15-18', kind: 'NO' as const },
            ]
          : [
              { id: 'nc_12', label: '11-12', kind: 'NC' as const },
              { id: 'no_14', label: '11-14', kind: 'NO' as const },
              { id: 'nc_22', label: '21-22', kind: 'NC' as const },
              { id: 'no_24', label: '21-24', kind: 'NO' as const },
            ];

      for (const cp of contactPorts) {
        const targets = validConnections
          .filter((cn) => cn.fromCompId === c.id && cn.fromPortId === cp.id)
          .map((cn) => {
            const tb = bmkMap.get(cn.toCompId)?.bmk ?? '?';
            const tPath = compToPathNr.get(cn.toCompId);
            const tLabel = `${tb}:${formatPortLabel(compMap.get(cn.toCompId)?.type ?? '', cn.toPortId)}`;
            return tPath ? `${tLabel} (Pf.${tPath})` : tLabel;
          });
        if (targets.length > 0) {
          mirrorEntries.push({
            term: cp.label,
            kind: cp.kind,
            targetPathText: targets.join(', '),
          });
        }
      }
    }

    currentPaths.push({
      pathNr: pNr,
      title: c.label,
      feederText: feeders[0] ?? 'Manuell / offen',
      contactsText: feeders.slice(0, 2),
      b1Text: b1Feeders[0],
      coilBmk: bmk,
      coilTopTerm: c.type.startsWith('indicator') ? 'X1' : 'A1',
      coilBottomTerm: c.type.startsWith('indicator') ? 'X2 (0V)' : 'A2 (0V)',
      coilKind:
        c.type === 'timer_relay'
          ? 'timer'
          : c.type === 'contactor_relay'
          ? 'contactor'
          : c.type === 'valve_32' || c.type === 'valve_22'
          ? 'valve'
          : c.type.startsWith('indicator')
          ? 'lamp'
          : c.type === 'generator'
          ? 'generator'
          : c.type === 'drain_consumer'
          ? 'drain'
          : c.type === 'dosing_pump'
          ? 'dosing'
          : c.type.startsWith('logic_')
          ? 'logic'
          : 'probe',
      functionCode:
        c.type === 'timer_relay'
          ? `${String(c.params?.teleFunction ?? 'E')} (${formatTeleDuration(getTimerTargetSeconds(c))})`
          : undefined,
      mirrorEntries,
    });
  }

  for (const kr of couplingRelays) {
    currentPaths.push({
      pathNr: krToPathNr.get(kr.bmk)!,
      title: kr.label,
      feederText: kr.triggerSourceText,
      contactsText: [kr.triggerSourceText],
      coilBmk: kr.bmk,
      coilTopTerm: 'A1',
      coilBottomTerm: 'A2 (0V)',
      coilKind: 'contactor',
      functionCode: '24V->230V',
      mirrorEntries: [
        {
          term: '11-14',
          kind: 'NO',
          targetPathText: `${kr.airPumpBmk}:L (230V Pf.1)`,
        },
      ],
    });
  }

  // Seiten-Planung vorab durchfuehren, um Blatt X / Y exakt auszugeben
  const bomEntries = Array.from(bmkMap.values());
  const bomRowsPerPage = 14;
  const coverBomPages = options.includeCoverAndBom
    ? Math.max(1, 1 + Math.ceil(Math.max(0, bomEntries.length - 7) / bomRowsPerPage))
    : 0;

  const pathsPerPage = 7;
  const elecControlPages = Math.max(1, Math.ceil(currentPaths.length / pathsPerPage));
  const elecPages = options.includeElectrical ? 1 + elecControlPages : 0;

  const terminalBlockComps = circuit.components.filter((c) => c.type === 'terminal_block');
  const wiresPerPage = 16;
  const wiringListPages = Math.max(1, Math.ceil(wireList.length / wiresPerPage));
  const wiringPages = options.includeWiringAndTerminals
    ? (terminalBlockComps.length > 0 ? 1 : 0) + wiringListPages
    : 0;

  const fluidAirConns = validConnections.filter(
    (c) => c.domain === 'fluid' || c.domain === 'air'
  );
  const fluidPages = options.includeFluidAndAir
    ? 1 + (fluidAirConns.length > 0 ? Math.ceil(fluidAirConns.length / 18) : 0)
    : 0;

  const totalPages = coverBomPages + elecPages + wiringPages + fluidPages;
  let currentPage = 0;
  let firstPageUsed = false;

  const beginNewPage = (sectionTitle: string) => {
    if (firstPageUsed) {
      doc.addPage();
    }
    firstPageUsed = true;
    currentPage++;
    drawPageChrome(doc, cleanName, sectionTitle, currentPage, totalPages, dateStr);
  };

  // =========================================================================
  // ABSCHNITT 1: DECKBLATT, STUECKLISTE (BOM) & INBETRIEBNAHMEWERTE
  // =========================================================================
  if (options.includeCoverAndBom) {
    beginNewPage('1. Deckblatt, Stueckliste & Inbetriebnahme');

    // Anlagen-Steckbrief
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, 24, 132, 42, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe('Anlagen-Uebersicht & Ausfuehrungshinweise'), 18, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe(`Projektname: ${cleanName}`), 18, 36);
    doc.text(
      pdfSafe(`Bauteile gesamt: ${circuit.components.length}  |  Verbindungen: ${circuit.connections.length}`),
      18,
      41
    );
    doc.text(
      pdfSafe(
        `Steuerspannung: 24V DC (SELV) + 0V (GND) Sammelschiene -X0  |  Lastspannung: 230V AC L/N/PE`
      ),
      18,
      46
    );
    doc.text(
      pdfSafe(
        `Koppelrelais (24V -> 230V): ${couplingRelays.length} Stueck automatisch generiert`
      ),
      18,
      51
    );
    doc.text(
      pdfSafe('Verdrahtungsfarben: +24V Rot | 0V Dunkelblau | 230V L Braun | N Blau | PE Gruen/Gelb'),
      18,
      56
    );
    doc.text(
      pdfSafe('Medienfarben (R&I): Anolyt Gelb | Katholyte Gruen | Wasser Dunkelblau | Druckluft Cyan'),
      18,
      61
    );

    // Pruefhinweis-Box (oder Bestaetigung)
    if (warnings.length > 0) {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(217, 119, 6);
    } else {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
    }
    doc.roundedRect(151, 24, 132, 42, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(warnings.length > 0 ? 146 : 6, warnings.length > 0 ? 64 : 95, warnings.length > 0 ? 14 : 70);
    doc.text(
      pdfSafe(
        warnings.length > 0
          ? `Pruef- & Montagehinweise (${warnings.length})`
          : 'Plausibilitaetspruefung: OK (Anlagenbau-konform)'
      ),
      155,
      30
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(30, 41, 59);
    const noteLines =
      warnings.length > 0
        ? warnings
        : [
            'Alle Spulen (A1/A2), Ventile, Leuchtmelder und Verbraucher wurden normgerecht mit 0V (GND) Rueckleitern auf -X0 ergaenzt.',
            'Alle 230V-Betriebsmittel erhalten L, N und Schutzleiter PE nach VDE 0100.',
          ];
    let wy = 35.5;
    for (const n of noteLines.slice(0, 4)) {
      const wrapped = doc.splitTextToSize(pdfSafe(`- ${n}`), 124);
      doc.text(wrapped.slice(0, 2), 155, wy);
      wy += Math.min(2, wrapped.length) * 3.4 + 1.5;
    }

    // Erste 7 BOM-Zeilen auf Seite 1
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe('Stueckliste (BOM) & Parametrierung'), 14, 73);

    const bomCols = [10, 18, 48, 52, 70, 71];
    drawTableRow(
      doc,
      14,
      76,
      bomCols,
      ['Pos', 'BMK', 'Bauteil-Typ', 'Bezeichnung', 'Anschluss / Spezifikation', 'Inbetriebnahme-Sollwert'],
      7,
      true
    );

    let yCursor = 83;
    const firstSlice = bomEntries.slice(0, 7);
    firstSlice.forEach((entry, i) => {
      drawTableRow(
        doc,
        14,
        yCursor,
        bomCols,
        [
          String(i + 1),
          entry.bmk,
          entry.categoryLabel,
          entry.comp.label,
          entry.specSummary,
          entry.settingSummary,
        ],
        13.5,
        false
      );
      yCursor += 13.5;
    });

    // Weitere BOM-Seiten falls noetig
    for (let offset = 7; offset < bomEntries.length; offset += bomRowsPerPage) {
      beginNewPage('1. Stueckliste (BOM) - Fortsetzung');
      drawTableRow(
        doc,
        14,
        24,
        bomCols,
        ['Pos', 'BMK', 'Bauteil-Typ', 'Bezeichnung', 'Anschluss / Spezifikation', 'Inbetriebnahme-Sollwert'],
        7,
        true
      );
      let yy = 31;
      const chunk = bomEntries.slice(offset, offset + bomRowsPerPage);
      chunk.forEach((entry, idx) => {
        drawTableRow(
          doc,
          14,
          yy,
          bomCols,
          [
            String(offset + idx + 1),
            entry.bmk,
            entry.categoryLabel,
            entry.comp.label,
            entry.specSummary,
            entry.settingSummary,
          ],
          11,
          false
        );
        yy += 11;
      });
    }
  }

  // =========================================================================
  // ABSCHNITT 2: NORMNAHER STROMLAUFPLAN (230V AC + 24V DC + 0V/N/PE)
  // =========================================================================
  if (options.includeElectrical) {
    // Blatt 2.1: Energieverteilung 230V AC (L/N/PE) -> 24V Netzteil (-G1) & 230V Luftpumpen
    beginNewPage('2. Stromlaufplan: Energieversorgung 230V AC (L/N/PE) & 24V DC Einspeisung');

    // Drei obere Netzschienen L, N, PE
    const yL = 34;
    const yN = 41;
    const yPE = 48;
    doc.setLineWidth(0.7);
    doc.setDrawColor(180, 83, 9); // Braun-Orange fuer L
    doc.line(22, yL, 280, yL);
    doc.setDrawColor(37, 99, 235); // Blau N
    doc.line(22, yN, 280, yN);
    doc.setDrawColor(22, 163, 74); // Gruen/Gelb PE
    doc.setLineDashPattern([3, 1.5], 0);
    doc.line(22, yPE, 280, yPE);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    doc.text('L1 (230V~)', 10, yL + 1);
    doc.setTextColor(37, 99, 235);
    doc.text('N', 10, yN + 1);
    doc.setTextColor(22, 163, 74);
    doc.text('PE', 10, yPE + 1);

    // Block 1: 24V Netzteil(e)
    let px = 42;
    for (const g of psu24s) {
      const gb = bmkMap.get(g.id)?.bmk ?? '-G1';
      // Zuleitung L/N/PE von Schienen runter
      doc.setLineWidth(0.5);
      doc.setDrawColor(180, 83, 9);
      doc.line(px + 10, yL, px + 10, 84);
      doc.circle(px + 10, yL, 0.9, 'F');
      doc.setDrawColor(37, 99, 235);
      doc.line(px + 22, yN, px + 22, 84);
      doc.circle(px + 22, yN, 0.9, 'F');
      doc.setDrawColor(22, 163, 74);
      doc.line(px + 34, yPE, px + 34, 84);
      doc.circle(px + 34, yPE, 0.9, 'F');

      // Sicherung F1 Symbol auf L
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(30, 41, 59);
      doc.rect(px + 7.5, 62, 5, 10, 'FD');
      doc.line(px + 10, 62, px + 10, 72);
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      doc.text('-F1 B6A', px + 14, 68);

      // Netzteil Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.6);
      doc.roundedRect(px, 84, 52, 42, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(pdfSafe(`${gb} 24V DC Netzteil`), px + 26, 95, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('230V AC -> 24V DC / 5A', px + 26, 103, { align: 'center' });
      doc.text('L       N      PE', px + 22, 89, { align: 'center' });
      doc.text('+24V            0V (GND)', px + 26, 123, { align: 'center' });

      // Ausgaenge +24V (Rot) & 0V (Dunkelblau)
      doc.setLineWidth(0.6);
      doc.setDrawColor(220, 38, 38);
      doc.line(px + 14, 126, px + 14, 152);
      doc.line(px + 14, 152, 276, 152);
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfSafe('+24V DC -> Klemmblock -X1 & Steuerstromkreise (Blatt ff.)'), px + 17, 150);

      doc.setDrawColor(29, 78, 216);
      doc.line(px + 38, 126, px + 38, 166);
      doc.line(px + 38, 166, 276, 166);
      doc.setTextColor(29, 78, 216);
      doc.text(pdfSafe('0V (GND) -> Sammelschiene -X0 & alle Spulen A2 / X2 / GND'), px + 41, 164);

      px += 78;
    }

    // Block 2: 230V AC Einspeisung(en) Q1 + Luftpumpen
    if (psu230s.length > 0 || airPumps.length > 0) {
      let ax = Math.max(px, 124);
      for (const ap of airPumps) {
        const ab = bmkMap.get(ap.id)?.bmk ?? 'AP';
        const pMode = String(ap.params?.powerMode ?? 'ac_230v_direct');
        const kr = couplingRelays.find((k) => k.airPumpId === ap.id);

        // L / N / PE Abgang
        doc.setLineWidth(0.5);
        doc.setDrawColor(234, 88, 12); // Kraftiges Orange fuer 230V L
        doc.line(ax + 12, yL, ax + 12, 62);
        doc.circle(ax + 12, yL, 0.9, 'F');
        doc.setFillColor(255, 255, 255);
        doc.rect(ax + 9.5, 62, 5, 9, 'FD');
        doc.setFontSize(6.8);
        doc.setTextColor(15, 23, 42);
        doc.text('-F2', ax + 16, 67.5);

        if (kr) {
          // Koppelrelais-Kontakt 11-14 im 230V Pfad
          doc.setDrawColor(234, 88, 12);
          doc.line(ax + 12, 71, ax + 12, 82);
          doc.line(ax + 12, 82, ax + 7.5, 91); // Schliesser
          doc.line(ax + 12, 92, ax + 12, 102);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.text(pdfSafe(`${kr.bmk} (11-14)`), ax + 15.5, 86);
          doc.setFont('helvetica', 'normal');
          doc.text(pdfSafe(`24V Spule: ${kr.triggerSourceText}`), ax + 15.5, 90.5);
        } else {
          // Direktschalter / Q1
          doc.setDrawColor(234, 88, 12);
          doc.line(ax + 12, 71, ax + 12, 82);
          doc.line(ax + 12, 82, ax + 8, 91);
          doc.line(ax + 12, 92, ax + 12, 102);
          doc.setFontSize(7.2);
          doc.text(pdfSafe(pMode === 'fixed_power' ? 'Stecker' : '-Q1 EIN/AUS'), ax + 15.5, 87);
        }

        // N & PE runter zur Pumpe
        doc.setDrawColor(37, 99, 235);
        doc.line(ax + 26, yN, ax + 26, 102);
        doc.circle(ax + 26, yN, 0.9, 'F');
        doc.setDrawColor(22, 163, 74);
        doc.line(ax + 38, yPE, ax + 38, 102);
        doc.circle(ax + 38, yPE, 0.9, 'F');

        // Pumpe Motor-Symbol Box
        doc.setFillColor(255, 247, 237);
        doc.setDrawColor(234, 88, 12);
        doc.setLineWidth(0.6);
        doc.roundedRect(ax, 102, 50, 32, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(154, 52, 18);
        doc.text(pdfSafe(`${ab} ${ap.label}`), ax + 25, 112, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.text(pdfSafe(`AquaForte ${String(ap.params?.model ?? 'V-20')} | 230V~`), ax + 25, 119, { align: 'center' });
        doc.text('L            N          PE', ax + 25, 107, { align: 'center' });
        doc.text(
          pdfSafe(kr ? 'Geschaltet ueber 24V Koppelrelais' : 'Dauerbetrieb 230V AC direkt'),
          ax + 25,
          127,
          { align: 'center' }
        );

        ax += 66;
      }
    }

    // Blatt 2.2+: Steuerstromkreise 24V DC / 0V Strompfade
    for (let offset = 0; offset < currentPaths.length; offset += pathsPerPage) {
      beginNewPage('2. Stromlaufplan 24V DC / 0V (Strompfade & Kontaktspiegel)');
      const slice = currentPaths.slice(offset, offset + pathsPerPage);

      const railTopY = 36;
      const railBotY = 166;
      doc.setLineWidth(0.65);
      doc.setDrawColor(220, 38, 38); // +24V DC Schiene
      doc.line(20, railTopY, 282, railTopY);
      doc.setDrawColor(29, 78, 216); // 0V GND Schiene
      doc.line(20, railBotY, 282, railBotY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text('+24V DC', 10, railTopY + 1);
      doc.setTextColor(29, 78, 216);
      doc.text('0V (GND)', 10, railBotY + 1);

      const colStep = 36;
      slice.forEach((p, idx) => {
        const cx = 40 + idx * colStep;

        // Pfadnummer oben
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.25);
        doc.rect(cx - 15, 24, 30, 7, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(`Pfad ${p.pathNr}`, cx, 28.8, { align: 'center' });

        // Vertikale Strompfad-Linie oben (+24V bis Spule)
        doc.setDrawColor(220, 38, 38);
        doc.setLineWidth(0.45);
        doc.circle(cx, railTopY, 0.85, 'F');
        doc.line(cx, railTopY, cx, 55);

        // Speisender Kontakt / Klemme oben
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.35);
        doc.line(cx, 55, cx - 4, 65); // Kontaktsymbol schraeg
        doc.line(cx, 66, cx, 98);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(51, 65, 85);
        const feederLines = doc.splitTextToSize(pdfSafe(p.feederText), 32);
        doc.text(feederLines.slice(0, 2), cx + 3.5, 58);

        // B1 Trigger-Abzweig bei Zeitrelais
        if (p.b1Text) {
          doc.setDrawColor(217, 119, 6);
          doc.line(cx - 14, 92, cx, 92);
          doc.setFontSize(6.2);
          doc.setTextColor(180, 83, 9);
          doc.text(pdfSafe(`B1: ${p.b1Text}`).slice(0, 20), cx - 15, 89.5);
          doc.setTextColor(15, 23, 42);
        }

        // Verbraucher / Spulensymbol (Mitte)
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.55);
        doc.rect(cx - 8, 98, 16, 12, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(pdfSafe(p.coilBmk), cx, 105.5, { align: 'center' });

        // Klemmen A1 / A2
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(pdfSafe(p.coilTopTerm), cx + 9, 100);
        doc.text(pdfSafe(p.coilBottomTerm), cx + 9, 110);

        // Funktion & Bezeichnung unter Spule
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        const titleLines = doc.splitTextToSize(pdfSafe(p.title), 32);
        doc.text(titleLines.slice(0, 2), cx, 115, { align: 'center' });
        if (p.functionCode) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(3, 105, 161);
          doc.text(pdfSafe(p.functionCode), cx, 122, { align: 'center' });
        }

        // 0V Rueckleitung runter bis 0V Sammelschiene
        doc.setDrawColor(29, 78, 216);
        doc.setLineWidth(0.45);
        doc.line(cx, 110, cx, railBotY);
        doc.circle(cx, railBotY, 0.85, 'F');

        // Kontaktspiegel unterhalb der 0V-Schiene
        if (p.mirrorEntries.length > 0) {
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.25);
          doc.rect(cx - 16, 170, 32, 19);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(51, 65, 85);
          doc.text('Kontaktspiegel:', cx - 14.5, 174);
          doc.setFont('helvetica', 'normal');
          let my = 178;
          for (const m of p.mirrorEntries.slice(0, 3)) {
            const lineTxt = `${m.kind} ${m.term} -> ${m.targetPathText}`;
            doc.text(pdfSafe(lineTxt).slice(0, 25), cx - 14.5, my);
            my += 3.6;
          }
        }
      });
    }
  }

  // =========================================================================
  // ABSCHNITT 3: KLEMMENPLAN (-X1 / -X0) & VERDRAHTUNGS-HAKENLISTE
  // =========================================================================
  if (options.includeWiringAndTerminals) {
    // 3.1 Klemmenplan -X1 (falls Klemmblock vorhanden)
    if (terminalBlockComps.length > 0) {
      beginNewPage('3. Klemmenplan (-X1 +24V-Potentialverteiler & -X0 0V-Sammelschiene)');
      let txCursor = 14;
      for (const tb of terminalBlockComps) {
        const tbBmk = bmkMap.get(tb.id)?.bmk ?? '-X1';
        const outCount = Number(tb.params?.outputCount ?? 10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(pdfSafe(`Klemmleiste ${tbBmk} (${tb.label}) - ${outCount}-fach +24V`), 14, 28);

        const tCols = [18, 28, 80, 62, 78];
        drawTableRow(
          doc,
          txCursor,
          31,
          tCols,
          ['Klemme', 'Potential', 'Angeschlossenes Betriebsmittel', 'Ader / Querschnitt', 'Hinweis'],
          7,
          true
        );

        let ry = 38;
        const maxRows = Math.min(outCount, 18);
        for (let k = 1; k <= maxRows; k++) {
          const portId = `out_${k}`;
          const conns = validConnections.filter(
            (c) =>
              (c.fromCompId === tb.id && c.fromPortId === portId) ||
              (c.toCompId === tb.id && c.toPortId === portId)
          );
          const targetDesc =
            conns.length > 0
              ? conns
                  .map((c) => {
                    const otherId = c.fromCompId === tb.id ? c.toCompId : c.fromCompId;
                    const otherPort = c.fromCompId === tb.id ? c.toPortId : c.fromPortId;
                    const oc = compMap.get(otherId);
                    const ob = bmkMap.get(otherId)?.bmk ?? '?';
                    return `${ob}:${formatPortLabel(oc?.type ?? '', otherPort)} (${oc?.label ?? ''})`;
                  })
                  .join(' / ')
              : '-- Reserve / frei --';

          drawTableRow(
            doc,
            txCursor,
            ry,
            tCols,
            [
              `${tbBmk}:${k}`,
              '+24V DC',
              targetDesc,
              conns.length > 0 ? 'H07V-K 0.75 mm2 Rot' : '-',
              conns.length > 1 ? 'Doppeladerendhuelse!' : conns.length === 1 ? 'Belegt' : 'Reserve',
            ],
            7.8,
            false
          );
          ry += 7.8;
        }
      }
    }

    // 3.2 Ader-fuer-Ader Verdrahtungs-Hakenliste
    const wireCols = [10, 12, 42, 42, 38, 48, 77];
    for (let offset = 0; offset < wireList.length; offset += wiresPerPage) {
      beginNewPage('3. Ader-fuer-Ader Verdrahtungs-Hakenliste (Werkstatt / Abhaken)');
      drawTableRow(
        doc,
        14,
        24,
        wireCols,
        ['OK', 'Nr.', 'Von (BMK : Klemme)', 'Nach (BMK : Klemme)', 'Potential', 'Aderfarbe / Querschnitt', 'Montagehinweis'],
        7.5,
        true
      );
      let wy = 31.5;
      const chunk = wireList.slice(offset, offset + wiresPerPage);
      chunk.forEach((w) => {
        drawTableRow(
          doc,
          14,
          wy,
          wireCols,
          [
            '[ ]',
            String(w.nr),
            `${w.fromBmk} : ${w.fromPort}`,
            `${w.toBmk} : ${w.toPort}`,
            w.potential,
            w.colorSpec,
            w.note || (w.isSynthesized ? 'Schaltschrank-Grundverdrahtung' : 'Steuerleitung'),
          ],
          9.4,
          false,
          w.potential.includes('230V')
        );
        wy += 9.4;
      });
    }
  }

  // =========================================================================
  // ABSCHNITT 4: FLUIDIK- & PNEUMATIK-SCHEMA (R&I-FLIESSBILD & VERSCHLAUCHUNG)
  // =========================================================================
  if (options.includeFluidAndAir) {
    beginNewPage('4. Fluidik- & Pneumatik-Schema (R&I-Fliessbild)');

    const fluidComps = circuit.components.filter(
      (c) =>
        ![
          'power_24v',
          'power_230v',
          'terminal_block',
          'switch',
          'changeover_switch',
          'indicator_green',
          'indicator_red',
          'timer_relay',
          'contactor_relay',
          'logic_and',
          'logic_or',
          'logic_not',
        ].includes(c.type)
    );

    const plotComps = fluidComps.length > 0 ? fluidComps : circuit.components;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const c of plotComps) {
      const sz = COMPONENT_SIZE_FALLBACK[c.type] ?? { w: 180, h: 120 };
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + sz.w);
      maxY = Math.max(maxY, c.y + sz.h);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 500;
    }

    const boxX = 16;
    const boxY = 26;
    const boxW = 265;
    const boxH = 148;
    const spanX = Math.max(200, maxX - minX + 80);
    const spanY = Math.max(150, maxY - minY + 80);
    const scale = Math.min(boxW / spanX, boxH / spanY);
    const offsetX = boxX + (boxW - spanX * scale) / 2 - (minX - 40) * scale;
    const offsetY = boxY + (boxH - spanY * scale) / 2 - (minY - 40) * scale;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(250, 252, 255);
    doc.rect(boxX, boxY, boxW, boxH, 'FD');

    // Leitungen im Fliessbild
    const obstacles: ComponentObstacle[] = plotComps.map((c) => {
      const sz = COMPONENT_SIZE_FALLBACK[c.type] ?? { w: 180, h: 120 };
      return { id: c.id, x: c.x, y: c.y, width: sz.w, height: sz.h };
    });
    const endpoints: RouteEndpoint[] = [];
    for (const cn of fluidAirConns) {
      const fc = compMap.get(cn.fromCompId);
      const tc = compMap.get(cn.toCompId);
      if (!fc || !tc) continue;
      const fs = COMPONENT_SIZE_FALLBACK[fc.type] ?? { w: 180, h: 120 };
      const ts = COMPONENT_SIZE_FALLBACK[tc.type] ?? { w: 180, h: 120 };
      endpoints.push({
        id: cn.id,
        domain: cn.domain,
        fromCompId: fc.id,
        toCompId: tc.id,
        x1: fc.x + fs.w,
        y1: fc.y + fs.h / 2,
        side1: 'right',
        x2: tc.x,
        y2: tc.y + ts.h / 2,
        side2: 'left',
      });
    }
    const routed = routeAllOrthogonalWires(endpoints, obstacles);

    const parseSvgPoints = (d: string): Array<{ x: number; y: number }> => {
      const pts: Array<{ x: number; y: number }> = [];
      const tokens = d.match(/[MLA][^MLA]*/gi) ?? [];
      for (const tok of tokens) {
        const cmd = tok[0].toUpperCase();
        const nums = tok
          .slice(1)
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => Number.isFinite(n));
        if ((cmd === 'M' || cmd === 'L') && nums.length >= 2) {
          pts.push({ x: nums[0], y: nums[1] });
        } else if (cmd === 'A' && nums.length >= 7) {
          pts.push({ x: nums[5], y: nums[6] });
        }
      }
      return pts;
    };

    for (const cn of fluidAirConns) {
      const r = routed.get(cn.id);
      const pts = r ? parseSvgPoints(r.d) : [];
      if (pts.length < 2) continue;

      if (cn.domain === 'air') {
        doc.setDrawColor(8, 145, 178); // Cyan Druckluft
        doc.setLineWidth(0.55);
      } else {
        const fc = compMap.get(cn.fromCompId);
        const tc = compMap.get(cn.toCompId);
        const med: FluidMedium =
          cn.fromPortId === 'fluid_anolyte' ||
          fc?.type === 'anolyte_tank' ||
          tc?.type === 'anolyte_tank'
            ? 'anolyte'
            : cn.fromPortId === 'fluid_katholyte' ||
              fc?.type === 'katholyte_tank' ||
              tc?.type === 'katholyte_tank'
            ? 'katholyte'
            : (fc?.params?.medium as FluidMedium) ??
              (tc?.params?.medium as FluidMedium) ??
              'water';
        if (med === 'katholyte') {
          doc.setDrawColor(5, 150, 105); // Gruen
        } else if (med === 'anolyte') {
          doc.setDrawColor(202, 138, 4); // Gelb/Ocker
        } else {
          doc.setDrawColor(29, 78, 216); // Dunkelblau Wasser
        }
        doc.setLineWidth(0.8);
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        doc.line(
          offsetX + p1.x * scale,
          offsetY + p1.y * scale,
          offsetX + p2.x * scale,
          offsetY + p2.y * scale
        );
      }
    }

    // Bauteile im Fliessbild
    for (const c of plotComps) {
      const sz = COMPONENT_SIZE_FALLBACK[c.type] ?? { w: 180, h: 120 };
      const rx = offsetX + c.x * scale;
      const ry = offsetY + c.y * scale;
      const rw = Math.max(16, sz.w * scale);
      const rh = Math.max(11, sz.h * scale);
      const bmk = bmkMap.get(c.id)?.bmk ?? '';

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.45);
      doc.roundedRect(rx, ry, rw, rh, 1.2, 1.2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafe(`${bmk} ${c.label}`).slice(0, 24), rx + rw / 2, ry + rh * 0.45, {
        align: 'center',
      });

      const sub = bmkMap.get(c.id)?.settingSummary ?? '';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(sub).slice(0, 26), rx + rw / 2, ry + rh * 0.72, {
        align: 'center',
      });
    }

    // Legende unten im R&I-Diagramm
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Medien-Legende:', 16, 182);
    const legItems: Array<{ label: string; rgb: [number, number, number]; x: number }> = [
      { label: 'Anolyt (Gelb)', rgb: [202, 138, 4], x: 48 },
      { label: 'Katholyte (Gruen)', rgb: [5, 150, 105], x: 88 },
      { label: 'Wasser (Dunkelblau)', rgb: [29, 78, 216], x: 135 },
      { label: 'Druckluft (Cyan)', rgb: [8, 145, 178], x: 185 },
    ];
    for (const item of legItems) {
      doc.setDrawColor(...item.rgb);
      doc.setLineWidth(1.4);
      doc.line(item.x, 181, item.x + 8, 181);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(item.label, item.x + 10, 182);
    }

    // Verschlauchungs-Tabelle auf Folgeseite
    if (fluidAirConns.length > 0) {
      const fCols = [12, 48, 36, 48, 36, 36, 53];
      for (let offset = 0; offset < fluidAirConns.length; offset += 18) {
        beginNewPage('4. Verschlauchungs- & Verrohrungstabelle');
        drawTableRow(
          doc,
          14,
          24,
          fCols,
          ['Nr.', 'Quelle (BMK / Name)', 'Ausgang', 'Ziel (BMK / Name)', 'Eingang', 'Medium', 'Hinweis / Nennweite'],
          7.5,
          true
        );
        let fy = 31.5;
        const chunk = fluidAirConns.slice(offset, offset + 18);
        chunk.forEach((cn, idx) => {
          const fc = compMap.get(cn.fromCompId)!;
          const tc = compMap.get(cn.toCompId)!;
          const fb = bmkMap.get(fc.id)?.bmk ?? '';
          const tb = bmkMap.get(tc.id)?.bmk ?? '';
          const med =
            cn.domain === 'air'
              ? 'Druckluft'
              : cn.fromPortId === 'fluid_anolyte' || fc.type === 'anolyte_tank'
              ? 'Anolyt'
              : cn.fromPortId === 'fluid_katholyte' || fc.type === 'katholyte_tank'
              ? 'Katholyte'
              : fc.params?.medium === 'katholyte'
              ? 'Katholyte'
              : fc.params?.medium === 'anolyte'
              ? 'Anolyt'
              : 'Wasser';
          drawTableRow(
            doc,
            14,
            fy,
            fCols,
            [
              String(offset + idx + 1),
              `${fb} ${fc.label}`,
              formatPortLabel(fc.type, cn.fromPortId),
              `${tb} ${tc.label}`,
              formatPortLabel(tc.type, cn.toPortId),
              med,
              cn.domain === 'air' ? 'Pneumatikschlauch 6/8mm' : 'Chemieschlauch / PVC-Rohr',
            ],
            8.4,
            false
          );
          fy += 8.4;
        });
      }
    }
  }

  const safeSlug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/^-|-$/g, '') || 'schaltplan';
  doc.save(`${safeSlug}-anlagenbau-schaltplan-${new Date().toISOString().slice(0, 10)}.pdf`);
}
