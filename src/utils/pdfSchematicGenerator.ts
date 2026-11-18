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
  includeFluidAndAir: boolean;
  includeTerminalPlan?: boolean;
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

interface CouplingRelayVirtual {
  bmk: string;
  label: string;
  airPumpId: string;
  airPumpBmk: string;
  airPumpLabel: string;
  triggerCompId?: string;
  triggerPortId?: string;
  triggerLabel: string;
}

interface UpstreamContactInfo {
  kind: 'permanent' | 'relay_no' | 'relay_nc' | 'switch_no' | 'changeover_no' | 'changeover_nc' | 'open';
  contactBmk: string;
  contactCompId?: string;
  topTerm: string;
  botTerm: string;
  terminalTag: string; // z. B. "-X1:1"
}

interface SchematicColumnSpec {
  id: string; // compId oder virtual key
  compId?: string;
  kind: 'b1_trigger' | 'device';
  sheetNr: number;
  colNr: number; // 0..9
  refCode: string; // e.g. "2.0"
  title: string;
  modeLine: string;
  bmk: string;
  symbolType:
    | 'b1_branch'
    | 'timer'
    | 'contactor'
    | 'valve'
    | 'lamp'
    | 'generator'
    | 'drain'
    | 'dosing'
    | 'logic'
    | 'probe';
  topTerm: string;
  botTerm: string;
  upstream: UpstreamContactInfo;
  b1TargetRef?: string; // if this is a b1_trigger column, points right to coil col
  targetDeviceId?: string; // for b1_trigger linking
  mirrorRefs: Array<{
    termLabel: string;
    kind: 'NO' | 'NC';
    targetRef: string;
  }>;
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
    in: '13',
    out: '14',
    com: '11',
    nc: '12',
    no: '14',
    a1: 'A1',
    a2: 'A2',
    b1: 'B1',
    com_15: '15',
    nc_16: '16',
    no_18: '18',
    com_11: '11',
    nc_12: '12',
    no_14: '14',
    com_21: '21',
    nc_22: '22',
    no_24: '24',
    v24_in: '+24V',
    max_in: 'MAX',
    min_in: 'MIN',
    lock_in: 'SPERRE',
    l_230v: 'L',
    air_out: 'Luft AUS',
    air_in: 'Luft EIN',
    fluid_p: 'P',
    fluid_a: 'A (NC)',
    fluid_b: 'B (NO)',
    fluid_in: 'Fluid EIN',
    fluid_out: 'Fluid AUS',
    fluid_anolyte: 'Anolyt AUS',
    fluid_katholyte: 'Katholyte AUS',
    out_dry: 'Trocken',
    out_pre_low: 'Vor-Leer',
    out_min: 'MIN',
    out_max: 'MAX',
    out_overflow: 'Ueberlauf',
    pulse_out: 'Impuls AUS',
    pulse_in: 'Impuls EIN',
    analog_out: '4-20mA AUS',
    analog_in: '4-20mA EIN',
    elec_in: 'U-IN',
    thresh_out: 'Q 24V',
    i1: 'I1',
    i2: 'I2',
    q: 'Q',
    main_in: 'Hauptstrom',
    dosing_in: 'Impfung',
    fluid_in_1: 'EIN 1',
    fluid_in_2: 'EIN 2',
    fluid_out_1: 'AUS 1',
    fluid_out_2: 'AUS 2',
  };
  if (map[p]) return map[p];
  if (p.startsWith('out_')) return `Kl.${p.slice(4)}`;
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
    while (usedBmks.has(`-${prefix}${idx}`)) idx++;
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
        specSummary = '230V AC 50Hz, L / N / PE Hauptschalter';
        settingSummary = comp.params?.enabled === false ? 'AUS' : 'EIN';
        break;
      case 'power_24v':
        bmk = nextBmk('G');
        categoryLabel = '24V DC Netzteil (SELV)';
        specSummary = '230V AC -> +24V DC / 0V';
        settingSummary = comp.params?.enabled === false ? 'AUS' : 'EIN (24V DC)';
        break;
      case 'terminal_block':
        bmk = nextBmk('X');
        categoryLabel = '24V-Potentialverteiler';
        specSummary = `Reihenklemmleiste ${Number(comp.params?.outputCount ?? 10)}-fach`;
        settingSummary = `${Number(comp.params?.outputCount ?? 10)} Abgaenge`;
        break;
      case 'switch':
        bmk = nextBmk('S');
        categoryLabel = 'Steuerschalter / Taster';
        specSummary = 'Schaltkontakt 13-14';
        settingSummary = String(comp.params?.mode ?? 'toggle');
        break;
      case 'changeover_switch':
        bmk = nextBmk('S');
        categoryLabel = 'Wechselschalter';
        specSummary = 'Umschalter 11 -> 12/14';
        settingSummary = comp.params?.switched ? 'Stellung II' : 'Stellung I';
        break;
      case 'indicator_green':
      case 'indicator_red':
        bmk = nextBmk('H');
        categoryLabel = comp.type === 'indicator_red' ? 'Leuchtmelder Rot' : 'Leuchtmelder Gruen';
        specSummary = 'LED 24V DC (X1=+24V, X2=0V)';
        settingSummary = comp.type === 'indicator_red' ? 'Rot' : 'Gruen';
        break;
      case 'timer_relay': {
        bmk = nextBmk('K');
        categoryLabel = 'TELE E1ZM10 Zeitrelais';
        specSummary = 'A1/A2(0V), B1, 15-16/18';
        const fn = String(comp.params?.teleFunction ?? 'E');
        const targetSec = getTimerTargetSeconds(comp);
        settingSummary = `${fn} (${formatTeleDuration(targetSec)})`;
        break;
      }
      case 'contactor_relay':
        bmk = nextBmk('KA');
        categoryLabel = 'Hilfsrelais (2x Wechsler)';
        specSummary = 'A1/A2(0V), 11-12/14, 21-22/24';
        settingSummary = '2x Wechsler';
        break;
      case 'current_transformer':
        bmk = nextBmk('T');
        categoryLabel = 'Stromwandler';
        specSummary = '24V -> Analog';
        settingSummary = `Max ${Number(comp.params?.maxCurrentAmps ?? 10)}A`;
        break;
      case 'signal_transmitter':
        bmk = nextBmk('U');
        categoryLabel = 'Messumformer';
        specSummary = 'Analogwandler + Q24V';
        settingSummary = `Schwelle ${Number(comp.params?.thresholdPct ?? 50)}%`;
        break;
      case 'logic_and':
      case 'logic_or':
      case 'logic_not':
        bmk = nextBmk('D');
        categoryLabel = `Logikgatter ${comp.type.replace('logic_', '').toUpperCase()}`;
        specSummary = '24V Logik (+ 0V)';
        settingSummary = comp.type.replace('logic_', '').toUpperCase();
        break;
      case 'generator':
        bmk = nextBmk('E');
        categoryLabel = 'Erzeuger-Anlage';
        specSummary = '24V Steuerung + 0V';
        settingSummary = `Ano ${Number(comp.params?.anolyteFlowLph ?? 50)} / Kat ${Number(
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
        specSummary = `${Number(comp.params?.capacityLiters ?? 500)} L | ${String(
          comp.params?.probeMode ?? '3_points'
        )}`;
        settingSummary = `MIN ${Number(comp.params?.minPct ?? 40)}% / MAX ${Number(
          comp.params?.maxPct ?? 80
        )}%`;
        break;
      }
      case 'air_pump': {
        bmk = nextBmk('AP');
        const model = String(comp.params?.model ?? 'V-20');
        const pMode = String(comp.params?.powerMode ?? 'ac_230v_direct');
        categoryLabel = `Luftpumpe AquaForte ${model}`;
        specSummary =
          pMode === 'external_24v'
            ? '230V AC ueber 24V Koppelrelais'
            : '230V AC L/N/PE Direktanschluss';
        settingSummary = `${model} (${pMode})`;
        break;
      }
      case 'dosing_pump':
        bmk = nextBmk('DP');
        categoryLabel = `Dosierpumpe ${String(comp.params?.model ?? 'DDA')}`;
        specSummary = '24V / 4-20mA / Impuls (+0V)';
        settingSummary = `${Number(comp.params?.manualFlowLph ?? 5)} L/h`;
        break;
      case 'valve_32':
        bmk = nextBmk('Y');
        categoryLabel = '3/2-Wege-Magnetventil';
        specSummary = 'A1(+24V)/A2(0V), P->A/B';
        settingSummary = 'NC P->A / Bestr. P->B';
        break;
      case 'valve_22':
        bmk = nextBmk('Y');
        categoryLabel = '2/2-Wege-Magnetventil';
        specSummary = 'A1(+24V)/A2(0V)';
        settingSummary = `${String(comp.params?.normalState ?? 'NC')} | ${Number(
          comp.params?.flowRateLph ?? 200
        )} L/h`;
        break;
      case 'drain_consumer':
        bmk = nextBmk('V');
        categoryLabel = 'Verbraucher / Abnahme';
        specSummary = '24V DC (+ 0V)';
        settingSummary = `${Number(comp.params?.drainRateLph ?? 30)} L/h`;
        break;
      case 'water_meter':
        bmk = nextBmk('WM');
        categoryLabel = 'Kontakt-Wasserzaehler';
        specSummary = 'Reed +24V / 4-20mA';
        settingSummary = `${Number(comp.params?.litersPerPulse ?? 10)} L/Imp`;
        break;
      case 'main_water_line':
        bmk = nextBmk('W');
        categoryLabel = 'Hauptleitung Rohwasser';
        specSummary = 'Zulaufleitung';
        settingSummary = `${Number(comp.params?.flowRateLph ?? 1000)} L/h`;
        break;
      case 'injection_point':
        bmk = nextBmk('I');
        categoryLabel = 'Impfstelle';
        specSummary = 'Dosier-Einbindung';
        settingSummary = 'Mischstrecke';
        break;
      case 'fluid_tee':
        bmk = nextBmk('FT');
        categoryLabel = 'T-Stueck (Fluid)';
        specSummary = 'Verteiler / Sammler';
        settingSummary = String(comp.params?.teeMode ?? 'split');
        break;
      case 'gully_drain':
        bmk = nextBmk('GD');
        categoryLabel = 'Gulli / Ablauf';
        specSummary = 'Kanalablauf';
        settingSummary = 'Drucklos';
        break;
      case 'float_probe':
        bmk = nextBmk('SL');
        categoryLabel = 'Schwimmerlanze';
        specSummary = 'Potentialfreie Kontakte';
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

/**
 * EPLAN / DIN-angelehnter Rahmen mit gruener Linienfuehrung,
 * Spaltenleiste 0..9 oben und kompaktem Schriftfeld unten.
 */
function drawEplanFrame(
  doc: jsPDF,
  circuitName: string,
  sheetNr: number,
  totalSheets: number,
  dateStr: string,
  showColumnGrid: boolean,
  sectionTitle?: string
): void {
  const W = 297;
  const H = 210;
  const left = 10;
  const top = 8;
  const right = W - 10;
  const bottom = H - 8;
  const gridLeft = 14;
  const gridRight = right - 2;
  const colW = (gridRight - gridLeft) / 10; // ~27.1 mm pro Spalte

  // Gruener EPLAN Rahmen
  doc.setDrawColor(0, 128, 85);
  doc.setLineWidth(0.45);
  doc.rect(left, top, right - left, bottom - top);

  if (showColumnGrid) {
    // Obere Spaltenleiste 0..9 + "Bl."
    doc.line(left, top + 6.5, right, top + 6.5);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 110, 72);
    for (let c = 0; c < 10; c++) {
      const cx = gridLeft + c * colW;
      if (c > 0) {
        doc.setLineWidth(0.25);
        doc.line(cx, top, cx, top + 6.5);
      }
      doc.text(String(c), cx + colW / 2, top + 4.6, { align: 'center' });
    }
    doc.setFontSize(7);
    doc.text('Bl.', left + 2, top + 11);
  } else if (sectionTitle) {
    doc.line(left, top + 7, right, top + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 110, 72);
    doc.text(pdfSafe(sectionTitle), left + 4, top + 5);
  }

  // Schriftfeld unten (H - 21 bis H - 8 => 13 mm hoch)
  const sfTop = bottom - 13;
  doc.setDrawColor(0, 128, 85);
  doc.setLineWidth(0.45);
  doc.line(left, sfTop, right, sfTop);

  // Vertikale Unterteilungen im Schriftfeld
  const x1 = left + 52;
  const x2 = left + 162;
  const x3 = left + 214;
  const x4 = right - 32;
  doc.line(x1, sfTop, x1, bottom);
  doc.line(x2, sfTop, x2, bottom);
  doc.line(x3, sfTop, x3, bottom);
  doc.line(x4, sfTop, x4, bottom);

  // Linker Block: Datum & Aenderung
  doc.setLineWidth(0.25);
  doc.line(left, sfTop + 4.5, x1, sfTop + 4.5);
  doc.line(left, sfTop + 9, x1, sfTop + 9);
  doc.line(left + 22, sfTop, left + 22, bottom);
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(0, 110, 72);
  doc.text('Datum', left + 2, sfTop + 3.2);
  doc.text(pdfSafe(dateStr), left + 24, sfTop + 3.2);
  doc.text('Stand', left + 2, sfTop + 7.5);
  doc.text('Anlagenbau', left + 24, sfTop + 7.5);
  doc.text('Norm', left + 2, sfTop + 11.7);
  doc.text('IEC 60617 / DIN', left + 24, sfTop + 11.7);

  // Mitte: Projektname
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe(circuitName).slice(0, 30), (x1 + x2) / 2, sfTop + 8.5, { align: 'center' });

  // AnlagenSim Brand + Copyright
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('AnlagenSim', (x2 + x3) / 2, sfTop + 5.8, { align: 'center' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Copyright (c) 2026 #MAT', (x2 + x3) / 2, sfTop + 10.6, { align: 'center' });

  // Geprueft / Blattinfo
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 110, 72);
  doc.text(pdfSafe(sectionTitle ? sectionTitle.split(':')[0] : 'Stromlaufplan').slice(0, 22), x3 + 2.5, sfTop + 5.5);
  doc.text('230V AC / 24V DC / 0V', x3 + 2.5, sfTop + 10.5);

  doc.setLineWidth(0.25);
  doc.line(x4, sfTop + 6.5, right, sfTop + 6.5);
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe(`Blatt  ${sheetNr}`), x4 + 3, sfTop + 4.5);
  doc.text(pdfSafe(`von  ${totalSheets}  Bl.`), x4 + 3, sfTop + 10.8);
}

function drawTableRow(
  doc: jsPDF,
  x: number,
  y: number,
  colWidths: number[],
  cells: string[],
  rowHeight: number,
  isHeader = false
): void {
  if (isHeader) {
    doc.setFillColor(0, 110, 72);
    doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(x, y + rowHeight, x + colWidths.reduce((a, b) => a + b, 0), y + rowHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
  }

  let curX = x;
  for (let i = 0; i < cells.length; i++) {
    const w = colWidths[i];
    const txt = pdfSafe(cells[i]);
    const fitted = doc.splitTextToSize(txt, Math.max(8, w - 3));
    const line = Array.isArray(fitted) ? fitted[0] : String(fitted);
    doc.text(line || '', curX + 1.5, y + rowHeight * 0.66);
    curX += w;
  }
}

/**
 * Zeichnet eine blau-weisse Ader (0 V DC Standard: blaue Basislinie mit weissen Unterbrechungen).
 */
function drawBlueWhiteWire(
  doc: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width = 0.52
): void {
  doc.setDrawColor(29, 78, 216);
  doc.setLineWidth(width);
  doc.setLineDashPattern([], 0);
  doc.line(x1, y1, x2, y2);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(Math.max(0.24, width * 0.55));
  doc.setLineDashPattern([1.6, 1.6], 0);
  doc.line(x1, y1, x2, y2);
  doc.setLineDashPattern([], 0);
}

/**
 * Zeichnet ein normnahes IEC/EPLAN Kontakt-Symbol auf x=cx zwischen yTop..yBot (ca. y=42..70).
 */
function drawContactSymbol(
  doc: jsPDF,
  cx: number,
  yTop: number,
  yBot: number,
  upstream: UpstreamContactInfo,
  contactRefText?: string
): void {
  const yMid1 = yTop + 6;
  const yMid2 = yBot - 6;

  // Permanente +24V Verbindung (ohne Schaltkontakt -> durchgehende blaue Leitung!)
  if (upstream.kind === 'permanent') {
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.45);
    doc.line(cx, yTop, cx, yBot);
    return;
  }

  if (upstream.kind === 'open') {
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(cx, yTop, cx, yBot);
    doc.setLineDashPattern([], 0);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text('(offen)', cx + 2, (yTop + yBot) / 2);
    return;
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.42);
  doc.line(cx, yTop, cx, yMid1);
  doc.line(cx, yMid2, cx, yBot);

  if (upstream.kind === 'relay_nc' || upstream.kind === 'changeover_nc') {
    // Oeffner (NC): horizontaler Anschlagbalken rechts an yMid1, schraege Fahne beruehrt ihn
    doc.line(cx, yMid1, cx + 3.2, yMid1);
    doc.line(cx + 2.6, yMid1 - 0.8, cx, yMid2);
  } else {
    // Schliesser (NO): schraege Fahne links offen
    doc.line(cx - 4.2, yMid1 + 0.5, cx, yMid2);
  }

  // Bei Hand-Schalter zusaetzliche Betaetigungs-Linie
  if (upstream.kind === 'switch_no' || upstream.kind.startsWith('changeover')) {
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(cx - 6, (yMid1 + yMid2) / 2, cx - 2.1, (yMid1 + yMid2) / 2);
    doc.setLineDashPattern([], 0);
    doc.line(cx - 6, (yMid1 + yMid2) / 2 - 2.2, cx - 6, (yMid1 + yMid2) / 2 + 2.2);
  }

  // Klemmennummern (links am Kontakt, gut lesbar)
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text(pdfSafe(upstream.topTerm), cx - 5.5, yMid1 - 0.5, { align: 'right' });
  doc.text(pdfSafe(upstream.botTerm), cx - 5.5, yMid2 + 2, { align: 'right' });

  // BMK des Kontakts (rechts neben Kontakt) + roter Querverweis (wie im Referenz-PDF)
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe(upstream.contactBmk), cx + 3.8, yMid1 + 3);
  if (contactRefText) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(220, 38, 38);
    doc.text(pdfSafe(contactRefText), cx + 3.8, yMid2 + 0.5);
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
    options.includeFluidAndAir ||
    Boolean(options.includeTerminalPlan);
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

  // Verbindungen normalisieren (legacy a2 -> +24V im Plan sauber herausfiltern, da A2 immer 0V ist!)
  const validConnections: NormalizedConnection[] = [];
  for (const conn of circuit.connections) {
    const fc = compMap.get(conn.fromComponentId);
    const tc = compMap.get(conn.toComponentId);
    if (!fc || !tc) continue;
    const fp = normalizePortId(fc.type, conn.fromPortId);
    const tp = normalizePortId(tc.type, conn.toPortId);
    if (conn.domain === 'electrical' && (tp === 'a2' || fp === 'a2')) {
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

  // Luftpumpen & automatische Koppelrelais (bei external_24v)
  const airPumps = circuit.components.filter((c) => c.type === 'air_pump');
  const couplingRelays: CouplingRelayVirtual[] = [];
  let kaIdx =
    circuit.components.filter((c) => c.type === 'contactor_relay').length + 1;

  for (const ap of airPumps) {
    const pMode = String(ap.params?.powerMode ?? 'ac_230v_direct');
    const apBmk = bmkMap.get(ap.id)?.bmk ?? 'AP';
    if (pMode === 'external_24v') {
      const incoming = validConnections.find(
        (c) =>
          c.domain === 'electrical' &&
          ((c.toCompId === ap.id && c.toPortId === 'a1') ||
            (c.fromCompId === ap.id && c.fromPortId === 'a1'))
      );
      let triggerCompId: string | undefined;
      let triggerPortId: string | undefined;
      let triggerLabel = 'offen';
      if (incoming) {
        const isTo = incoming.toCompId === ap.id;
        triggerCompId = isTo ? incoming.fromCompId : incoming.toCompId;
        triggerPortId = isTo ? incoming.fromPortId : incoming.toPortId;
        const sc = compMap.get(triggerCompId);
        const sb = bmkMap.get(triggerCompId)?.bmk ?? '?';
        triggerLabel = `${sb}:${formatPortLabel(sc?.type ?? '', triggerPortId)}`;
      }
      couplingRelays.push({
        bmk: `-KA${kaIdx++}`,
        label: `Koppelrelais (${apBmk})`,
        airPumpId: ap.id,
        airPumpBmk: apBmk,
        airPumpLabel: ap.label,
        triggerCompId,
        triggerPortId,
        triggerLabel,
      });
    }
  }

  // =========================================================================
  // HILFSFUNKTION: Rueckwaerts-Tracer fuer reale Schaltkontakte vor einer Spule
  // =========================================================================
  const resolveUpstreamForTargetPort = (
    compId: string,
    portIds: string[]
  ): UpstreamContactInfo => {
    // Suche direkte elektrische Verbindung zu einem der Zielports
    const direct = validConnections.find(
      (cn) =>
        cn.domain === 'electrical' &&
        !cn.isSelfBridge &&
        ((cn.toCompId === compId && portIds.includes(cn.toPortId)) ||
          (cn.fromCompId === compId && portIds.includes(cn.fromPortId)))
    );

    if (!direct) {
      return {
        kind: 'open',
        contactBmk: '',
        topTerm: '',
        botTerm: '',
        terminalTag: '',
      };
    }

    const srcId = direct.toCompId === compId ? direct.fromCompId : direct.toCompId;
    const srcPort = direct.toCompId === compId ? direct.fromPortId : direct.toPortId;
    const srcComp = compMap.get(srcId);
    const srcBmk = bmkMap.get(srcId)?.bmk ?? '';

    if (!srcComp) {
      return { kind: 'open', contactBmk: '', topTerm: '', botTerm: '', terminalTag: '' };
    }

    // 1. Direkt von Klemmblock -X1 oder Netzteil -G1 -> permanentes +24V (durchgehend gezeichnet!)
    if (srcComp.type === 'terminal_block') {
      const klNr = srcPort.startsWith('out_') ? srcPort.slice(4) : srcPort;
      return {
        kind: 'permanent',
        contactBmk: srcBmk,
        contactCompId: srcId,
        topTerm: '',
        botTerm: '',
        terminalTag: `${srcBmk}:${klNr}`,
      };
    }
    if (srcComp.type === 'power_24v') {
      return {
        kind: 'permanent',
        contactBmk: srcBmk,
        contactCompId: srcId,
        topTerm: '',
        botTerm: '',
        terminalTag: '+24V',
      };
    }

    // Finde optionale Klemmblock-Klemme hinter dem COM des Kontakts (inkl. Selbst-Bruecken wie com_15 <-> a1 oder com_11 <-> com_21)
    const findTerminalUpstream = (
      cId: string,
      entryPorts: string[],
      visited = new Set<string>(),
      depth = 0
    ): string => {
      if (depth > 4) return '';
      const queue = [...entryPorts];
      const reachablePorts = new Set<string>(entryPorts);

      while (queue.length > 0) {
        const p = queue.shift()!;
        for (const cn of validConnections) {
          if (cn.domain !== 'electrical' || !cn.isSelfBridge) continue;
          if (cn.fromCompId === cId && cn.fromPortId === p && !reachablePorts.has(cn.toPortId)) {
            reachablePorts.add(cn.toPortId);
            queue.push(cn.toPortId);
          } else if (cn.toCompId === cId && cn.toPortId === p && !reachablePorts.has(cn.fromPortId)) {
            reachablePorts.add(cn.fromPortId);
            queue.push(cn.fromPortId);
          }
        }
      }

      for (const p of reachablePorts) {
        const key = `${cId}:${p}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const inc = validConnections.find(
          (cn) =>
            cn.domain === 'electrical' &&
            !cn.isSelfBridge &&
            ((cn.toCompId === cId && cn.toPortId === p) ||
              (cn.fromCompId === cId && cn.fromPortId === p))
        );
        if (!inc) continue;

        const upId = inc.toCompId === cId ? inc.fromCompId : inc.toCompId;
        const upPort = inc.toCompId === cId ? inc.fromPortId : inc.toPortId;
        const upComp = compMap.get(upId);
        const upBmk = bmkMap.get(upId)?.bmk ?? '';
        if (upComp?.type === 'terminal_block') {
          const kl = upPort.startsWith('out_') ? upPort.slice(4) : upPort;
          return `${upBmk}:${kl}`;
        }
        if (upComp?.type === 'power_24v') return '+24V';
        const nested = findTerminalUpstream(
          upId,
          ['in', 'com', 'com_15', 'com_11', 'com_21', 'a1'],
          visited,
          depth + 1
        );
        if (nested) return nested;
      }
      return '';
    };

    const seedPorts =
      srcComp.type === 'timer_relay'
        ? ['com_15']
        : srcComp.type === 'contactor_relay'
        ? srcPort.endsWith('22') || srcPort.endsWith('24')
          ? ['com_21']
          : ['com_11']
        : srcComp.type === 'switch'
        ? ['in']
        : srcComp.type === 'changeover_switch'
        ? ['com']
        : ['in', 'com', 'a1'];

    const termTag = findTerminalUpstream(srcId, seedPorts);

    // 2. Zeitrelais-Kontakte (15-16 NC / 15-18 NO)
    if (srcComp.type === 'timer_relay') {
      if (srcPort === 'nc_16') {
        return {
          kind: 'relay_nc',
          contactBmk: srcBmk,
          contactCompId: srcId,
          topTerm: '15',
          botTerm: '16',
          terminalTag: termTag,
        };
      }
      if (srcPort === 'no_18') {
        return {
          kind: 'relay_no',
          contactBmk: srcBmk,
          contactCompId: srcId,
          topTerm: '15',
          botTerm: '18',
          terminalTag: termTag,
        };
      }
    }

    // 3. Hilfsrelais-Kontakte (11-12/14 & 21-22/24)
    if (srcComp.type === 'contactor_relay') {
      if (srcPort === 'nc_12') {
        return {
          kind: 'relay_nc',
          contactBmk: srcBmk,
          contactCompId: srcId,
          topTerm: '11',
          botTerm: '12',
          terminalTag: termTag,
        };
      }
      if (srcPort === 'no_14') {
        return {
          kind: 'relay_no',
          contactBmk: srcBmk,
          contactCompId: srcId,
          topTerm: '11',
          botTerm: '14',
          terminalTag: termTag,
        };
      }
      if (srcPort === 'nc_22') {
        return {
          kind: 'relay_nc',
          contactBmk: srcBmk,
          contactCompId: srcId,
          topTerm: '21',
          botTerm: '22',
          terminalTag: termTag,
        };
      }
      if (srcPort === 'no_24') {
        return {
          kind: 'relay_no',
          contactBmk: srcBmk,
          contactCompId: srcId,
          topTerm: '21',
          botTerm: '24',
          terminalTag: termTag,
        };
      }
    }

    // 4. Schalter & Wechselschalter
    if (srcComp.type === 'switch') {
      return {
        kind: 'switch_no',
        contactBmk: srcBmk,
        contactCompId: srcId,
        topTerm: '13',
        botTerm: '14',
        terminalTag: termTag,
      };
    }
    if (srcComp.type === 'changeover_switch') {
      return {
        kind: srcPort === 'nc' ? 'changeover_nc' : 'changeover_no',
        contactBmk: srcBmk,
        contactCompId: srcId,
        topTerm: '11',
        botTerm: srcPort === 'nc' ? '12' : '14',
        terminalTag: termTag,
      };
    }

    // Fallback: permanenter Abgriff von anderer Quelle (z. B. Bruecke oder Sensorausgang)
    return {
      kind: 'permanent',
      contactBmk: srcBmk,
      contactCompId: srcId,
      topTerm: '',
      botTerm: '',
      terminalTag: `${srcBmk}:${formatPortLabel(srcComp.type, srcPort)}`,
    };
  };

  // =========================================================================
  // SPALTENPLANUNG FUER STROMLAUFPLAN (10 EPLAN-Spalten 0..9 je Blatt)
  // =========================================================================
  const consumerTypes = new Set([
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

  const consumerComps = [...circuit.components]
    .filter((c) => consumerTypes.has(c.type))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rawCols: Omit<SchematicColumnSpec, 'sheetNr' | 'colNr' | 'refCode'>[] = [];

  for (const c of consumerComps) {
    const bmk = bmkMap.get(c.id)?.bmk ?? c.label;
    const targetPorts =
      c.type === 'timer_relay' ||
      c.type === 'contactor_relay' ||
      c.type === 'valve_32' ||
      c.type === 'valve_22'
        ? ['a1']
        : c.type === 'generator'
        ? ['max_in', 'v24_in', 'min_in']
        : c.type === 'signal_transmitter'
        ? ['elec_in']
        : c.type.startsWith('logic_')
        ? ['i1', 'i2']
        : ['in', 'v24_in', 'pulse_in'];

    const upstream = resolveUpstreamForTargetPort(c.id, targetPorts);

    // Falls Zeitrelais einen angeschlossenen B1-Steuerkontakt hat,
    // zeichne dessen vorgelagerten Schaltkontakt direkt in die linke Nachbarspalte!
    if (c.type === 'timer_relay') {
      const b1Up = resolveUpstreamForTargetPort(c.id, ['b1']);
      if (b1Up.kind !== 'open') {
        rawCols.push({
          id: `${c.id}_b1`,
          kind: 'b1_trigger',
          title: `Steuerkontakt ${bmk}`,
          modeLine: `-> B1 (${bmk})`,
          bmk: b1Up.contactBmk || 'B1',
          symbolType: 'b1_branch',
          topTerm: '',
          botTerm: '',
          upstream: b1Up,
          targetDeviceId: c.id,
          mirrorRefs: [],
        });
      }
    }

    const modeLine =
      c.type === 'timer_relay'
        ? `${String(c.params?.teleFunction ?? 'E')} / ${formatTeleDuration(getTimerTargetSeconds(c))}`
        : bmkMap.get(c.id)?.settingSummary ?? '';

    rawCols.push({
      id: c.id,
      compId: c.id,
      kind: 'device',
      title: c.label,
      modeLine,
      bmk,
      symbolType:
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
      topTerm: c.type.startsWith('indicator') ? 'X1' : 'A1',
      botTerm: c.type.startsWith('indicator') ? 'X2' : 'A2',
      upstream,
      mirrorRefs: [],
    });
  }

  couplingRelays.forEach((kr, krIdx) => {
    const up: UpstreamContactInfo = kr.triggerCompId
      ? resolveUpstreamForTargetPort(kr.airPumpId, ['a1'])
      : { kind: 'open', contactBmk: '', topTerm: '', botTerm: '', terminalTag: '' };
    rawCols.push({
      id: `kr_${kr.bmk}`,
      kind: 'device',
      title: kr.label,
      modeLine: '24V -> 230V',
      bmk: kr.bmk,
      symbolType: 'contactor',
      topTerm: 'A1',
      botTerm: 'A2',
      upstream: up,
      mirrorRefs: [
        {
          termLabel: '11-14',
          kind: 'NO',
          targetRef: `PWR:${Math.min(9, 4 + krIdx * 2)}`, // wird unten durch exakte Energie-Blattnummer ersetzt
        },
      ],
    });
  });

  // Paginiere Spalten in 10er Blaetter (0..9), dabei B1-Trigger und dazugehoerigen Timer NIE trennen!
  const controlSheets: SchematicColumnSpec[][] = [];
  let currentSheetCols: SchematicColumnSpec[] = [];

  for (let i = 0; i < rawCols.length; i++) {
    const item = rawCols[i];
    if (
      item.kind === 'b1_trigger' &&
      currentSheetCols.length === 9
    ) {
      // B1-Kontakt nicht am Rand von seinem Timer abbrechen -> neues Blatt beginnen
      controlSheets.push(currentSheetCols);
      currentSheetCols = [];
    }
    if (currentSheetCols.length >= 10) {
      controlSheets.push(currentSheetCols);
      currentSheetCols = [];
    }
    const sheetIdx = (options.includeCoverAndBom ? 1 : 0) + 1 + controlSheets.length; // vorlaeufig, unten exakt berechnet
    const colNr = currentSheetCols.length;
    currentSheetCols.push({
      ...item,
      sheetNr: sheetIdx,
      colNr,
      refCode: `${sheetIdx}.${colNr}`,
    });
  }
  if (currentSheetCols.length > 0 || (options.includeElectrical && controlSheets.length === 0)) {
    controlSheets.push(currentSheetCols);
  }

  // Exakte Blattnummern berechnen (Blatt 0 = Deckblatt, Blatt 1 = Energieversorgung, Blatt 2.. = Steuerung, ...)
  const bomEntries = Array.from(bmkMap.values());
  const bomExtraPages = options.includeCoverAndBom
    ? Math.ceil(Math.max(0, bomEntries.length - 8) / 14)
    : 0;
  const coverSheetCount = options.includeCoverAndBom ? 1 + bomExtraPages : 0;
  const elecPowerSheetCount = options.includeElectrical ? 1 : 0;
  const elecCtrlSheetCount = options.includeElectrical ? controlSheets.length : 0;
  const terminalBlockComps = circuit.components.filter((c) => c.type === 'terminal_block');
  const terminalSheetCount =
    options.includeTerminalPlan && terminalBlockComps.length > 0 ? 1 : 0;
  const fluidAirConns = validConnections.filter(
    (c) => c.domain === 'fluid' || c.domain === 'air'
  );
  const fluidSheetCount = options.includeFluidAndAir
    ? 1 + (fluidAirConns.length > 0 ? Math.ceil(fluidAirConns.length / 18) : 0)
    : 0;

  const totalSheets =
    coverSheetCount +
    elecPowerSheetCount +
    elecCtrlSheetCount +
    terminalSheetCount +
    fluidSheetCount;

  // Weise allen Steuerungsspalten endgueltige Blatt.Spalte-Codes zu
  const expectedPwrSheetNr = coverSheetCount + 1;
  const firstCtrlSheetNr = coverSheetCount + elecPowerSheetCount + 1;
  const compToRefCode = new Map<string, string>();
  const couplingCoilRefMap = new Map<string, string>();
  controlSheets.forEach((cols, sIdx) => {
    const sNr = firstCtrlSheetNr + sIdx;
    cols.forEach((col, cIdx) => {
      col.sheetNr = sNr;
      col.colNr = cIdx;
      col.refCode = `${sNr}.${cIdx}`;
      if (col.compId) {
        compToRefCode.set(col.compId, col.refCode);
      }
      if (col.id.startsWith('kr_')) {
        couplingCoilRefMap.set(col.bmk, col.refCode);
      }
      col.mirrorRefs.forEach((mr) => {
        if (mr.targetRef.startsWith('PWR:')) {
          mr.targetRef = `${expectedPwrSheetNr}.${mr.targetRef.slice(4)}`;
        }
      });
    });
  });

  // Ergaenze B1-Zielverweis + Kontaktspiegel-Querverweise (Blatt.Spalte)
  const allCtrlCols = controlSheets.flat();
  for (const col of allCtrlCols) {
    if (col.kind === 'b1_trigger' && col.targetDeviceId) {
      col.b1TargetRef = compToRefCode.get(col.targetDeviceId);
    }
    if (col.compId) {
      // Wo wird dieser Relais-/Zeitrelais-Kontakt verwendet?
      const matches = allCtrlCols.filter(
        (other) => other.upstream.contactCompId === col.compId && other.upstream.kind !== 'permanent'
      );
      for (const m of matches) {
        const isNc =
          m.upstream.kind === 'relay_nc' || m.upstream.kind === 'changeover_nc';
        col.mirrorRefs.push({
          termLabel: `${m.upstream.topTerm}-${m.upstream.botTerm}`,
          kind: isNc ? 'NC' : 'NO',
          targetRef: m.refCode,
        });
      }
    }
  }

  let sheetCursor = 0;
  let hasStartedDoc = false;
  const nextPage = (showColumnGrid: boolean, sectionTitle?: string): number => {
    if (hasStartedDoc) doc.addPage();
    hasStartedDoc = true;
    sheetCursor++;
    drawEplanFrame(
      doc,
      cleanName,
      sheetCursor,
      totalSheets,
      dateStr,
      showColumnGrid,
      sectionTitle
    );
    return sheetCursor;
  };

  // =========================================================================
  // BLATT 1: DECKBLATT (ANLAGEN-INFO, ADERFARBEN, KLEMMLEISTEN & STUECKLISTE)
  // =========================================================================
  if (options.includeCoverAndBom) {
    nextPage(false, 'Deckblatt: Anlagen-Uebersicht, Aderfarben & Stueckliste');

    // Box links: Anlagentyp & Spannungssystem
    doc.setDrawColor(0, 128, 85);
    doc.setLineWidth(0.35);
    doc.rect(14, 20, 118, 46);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Anlagentyp / Projekt:', 18, 26);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.text(pdfSafe(cleanName), 18, 32);

    doc.setFont('courier', 'bold');
    doc.text('Steuerung / Versorgung:', 18, 41);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.text('Steuerspannung:   24 V DC / 0 V (SELV)', 18, 47);
    doc.text('Lastspannung:     230 V AC 50 Hz (L1 / N / PE)', 18, 52.5);
    doc.text(
      pdfSafe(`Bauteile gesamt:  ${circuit.components.length} Stueck`),
      18,
      58
    );

    // Box mitte: Aderfarben (wie Referenz-PDF)
    doc.rect(136, 20, 92, 46);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text('Aderfarben:', 140, 26);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.6);
    const colors: Array<[string, string, string]> = [
      ['Lastspannung', 'L1 (230V~)', 'braun / schwarz'],
      ['Neutralleiter', 'N', 'hellblau'],
      ['Schutzleiter', 'PE', 'gruen / gelb'],
      ['Steuerspannung', '+24 V DC', 'blau'],
      ['Steuerspannung', '0 V DC', 'blau-weiß'],
      ['Messleitung', '4-20 mA', 'weiss'],
    ];
    let cy = 32;
    for (const [k, p, col] of colors) {
      doc.text(pdfSafe(k), 140, cy);
      doc.text(pdfSafe(p), 174, cy);
      doc.text(pdfSafe(col), 196, cy);
      cy += 5.4;
    }

    // Box rechts: Klemmleisten
    doc.rect(232, 20, 51, 46);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text('Klemmleisten:', 235, 26);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.6);
    let ky = 32;
    doc.text('-X20.1   +24 V DC', 235, ky);
    ky += 5.5;
    doc.text('-X20.2   0 V DC', 235, ky);
    ky += 5.5;
    for (const tb of terminalBlockComps) {
      const tbBmk = bmkMap.get(tb.id)?.bmk ?? '-X1';
      doc.text(pdfSafe(`${tbBmk}     +24V Vert.`), 235, ky);
      ky += 5.5;
    }
    if (couplingRelays.length > 0) {
      doc.text(pdfSafe(`-KA..   ${couplingRelays.length}x Koppelr.`), 235, ky);
    }

    // Stueckliste direkt darunter (ohne Pruefhinweis-Kasten!)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Stueckliste (BOM) & Inbetriebnahme-Einstellwerte', 14, 73);

    const bomCols = [10, 18, 48, 54, 68, 71];
    drawTableRow(
      doc,
      14,
      76,
      bomCols,
      ['Pos', 'BMK', 'Bauteil-Typ', 'Bezeichnung', 'Anschluss / Spezifikation', 'Einstellwert'],
      7,
      true
    );

    let yCursor = 83;
    bomEntries.slice(0, 8).forEach((entry, i) => {
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
        11.8,
        false
      );
      yCursor += 11.8;
    });

    for (let offset = 8; offset < bomEntries.length; offset += 14) {
      nextPage(false, 'Stueckliste (BOM) - Fortsetzung');
      drawTableRow(
        doc,
        14,
        22,
        bomCols,
        ['Pos', 'BMK', 'Bauteil-Typ', 'Bezeichnung', 'Anschluss / Spezifikation', 'Einstellwert'],
        7,
        true
      );
      let yy = 29;
      bomEntries.slice(offset, offset + 14).forEach((entry, idx) => {
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
          10.8,
          false
        );
        yy += 10.8;
      });
    }
  }

  // =========================================================================
  // STROMLAUFPLAN BLATT 1: ENERGIEVERSORGUNG (230V AC L/N/PE -> 24V DC & PUMPEN)
  // =========================================================================
  if (options.includeElectrical) {
    const pwrSheetNr = nextPage(true, 'Stromlaufplan: Energieversorgung');
    const psu24s = circuit.components.filter((c) => c.type === 'power_24v');
    const psu230s = circuit.components.filter((c) => c.type === 'power_230v');
    const mainSwitch = circuit.components.find((c) => c.type === 'switch');

    // Obere 230V-Netzschienen
    const yL = 26;
    const yN = 32;
    const yPE = 38;
    doc.setLineWidth(0.55);
    doc.setDrawColor(180, 83, 9);
    doc.line(22, yL, 282, yL);
    doc.setDrawColor(37, 99, 235);
    doc.line(22, yN, 282, yN);
    doc.setDrawColor(22, 163, 74);
    doc.setLineDashPattern([3, 1.5], 0);
    doc.line(22, yPE, 282, yPE);
    doc.setLineDashPattern([], 0);

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(180, 83, 9);
    doc.text('L1 (230V~)', 12, yL + 1);
    doc.setTextColor(37, 99, 235);
    doc.text('N', 12, yN + 1);
    doc.setTextColor(22, 163, 74);
    doc.text('PE', 12, yPE + 1);

    // 24V DC Netzteil(e) in Spalten 0..2
    let gx = 28;
    for (const g of psu24s) {
      const gb = bmkMap.get(g.id)?.bmk ?? '-G1';
      doc.setLineWidth(0.45);
      doc.setDrawColor(180, 83, 9);
      doc.line(gx + 8, yL, gx + 8, 72);
      doc.circle(gx + 8, yL, 0.8, 'F');
      doc.setDrawColor(37, 99, 235);
      doc.line(gx + 22, yN, gx + 22, 72);
      doc.circle(gx + 22, yN, 0.8, 'F');
      doc.setDrawColor(22, 163, 74);
      doc.line(gx + 36, yPE, gx + 36, 72);
      doc.circle(gx + 36, yPE, 0.8, 'F');

      // Sicherung F1
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(15, 23, 42);
      doc.rect(gx + 5.5, 50, 5, 9, 'FD');
      doc.line(gx + 8, 50, gx + 8, 59);
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(15, 23, 42);
      doc.text('-F1 B6A', gx + 12, 55.5);

      // Netzteil Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.5);
      doc.rect(gx, 72, 46, 32, 'FD');
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.text(pdfSafe(`${gb} 24V DC`), gx + 23, 84, { align: 'center' });
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.text('230V AC -> 24V DC', gx + 23, 91, { align: 'center' });
      doc.text('L       N       PE', gx + 22, 76.5, { align: 'center' });
      doc.text('+24V          0V', gx + 23, 101.5, { align: 'center' });

      // +24V Ausgang (blau, ggf. ueber Hauptschalter S1) -> Klemme -X20.1 -> Weiterfuehrung zu Folgeseite
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.55);
      if (mainSwitch) {
        const sb = bmkMap.get(mainSwitch.id)?.bmk ?? '-S1';
        doc.line(gx + 12, 104, gx + 12, 114);
        doc.setDrawColor(15, 23, 42);
        doc.line(gx + 8, 115, gx + 12, 123);
        doc.setFontSize(6.5);
        doc.text(pdfSafe(`${sb} 13/14`), gx + 14.5, 120);
        doc.setDrawColor(29, 78, 216);
        doc.line(gx + 12, 123, gx + 12, 138);
      } else {
        doc.line(gx + 12, 104, gx + 12, 138);
      }
      // Klemme -X20.1
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(15, 23, 42);
      doc.circle(gx + 12, 138, 1.3, 'FD');
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.text('-X20.1', gx + 1, 139);

      // 0V Ausgang (blau-weiss) -> Klemme -X20.2
      drawBlueWhiteWire(doc, gx + 34, 104, gx + 34, 148, 0.62);
      doc.setDrawColor(15, 23, 42);
      doc.circle(gx + 34, 148, 1.3, 'FD');
      doc.text('-X20.2', gx + 22.5, 149);

      // Weiterleitung nach rechts mit Blatt-Querverweis
      const nextTargetRef =
        controlSheets.length > 0 ? `${firstCtrlSheetNr}.0` : `${pwrSheetNr}.9`;
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.55);
      doc.line(gx + 12, 138, 278, 138);
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(29, 78, 216);
      doc.text(pdfSafe(`+24V DC (blau) -> ${nextTargetRef}`), 278, 136, { align: 'right' });

      drawBlueWhiteWire(doc, gx + 34, 148, 278, 148, 0.62);
      doc.setTextColor(37, 99, 235);
      doc.text(pdfSafe(`0V DC (blau-weiß) -> ${nextTargetRef}`), 278, 146, { align: 'right' });

      gx += 64;
    }

    // 230V AC Verbraucher (Luftpumpen) rechts daneben (Spalten 4..9 sauber am EPLAN-Raster)
    const pwrColW = (285 - 14) / 10;
    airPumps.forEach((ap, apIdx) => {
      const targetCol = Math.min(8, 4 + apIdx * 2);
      const ax = Math.max(gx + 14, 14 + targetCol * pwrColW);
      const ab = bmkMap.get(ap.id)?.bmk ?? 'AP';
      const pMode = String(ap.params?.powerMode ?? 'ac_230v_direct');
      const kr = couplingRelays.find((k) => k.airPumpId === ap.id);

      doc.setLineWidth(0.45);
      doc.setDrawColor(234, 88, 12); // Kraftiges Orange fuer 230V L
      doc.line(ax + 10, yL, ax + 10, 52);
      doc.circle(ax + 10, yL, 0.8, 'F');
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(15, 23, 42);
      doc.rect(ax + 7.5, 52, 5, 8, 'FD');
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`-F${apIdx + 2}`, ax + 14, 57.5);

      doc.setDrawColor(234, 88, 12);
      doc.line(ax + 10, 60, ax + 10, 68);
      if (kr) {
        // Koppelrelais NO Kontakt 11-14 grafisch im 230V Pfad + roter Querverweis zur Spule
        doc.setDrawColor(15, 23, 42);
        doc.line(ax + 6, 68.5, ax + 10, 77);
        doc.setDrawColor(234, 88, 12);
        doc.line(ax + 10, 77, ax + 10, 88);
        doc.setFont('courier', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(pdfSafe(`${kr.bmk} (11/14)`), ax + 13.5, 73);
        const coilRef = couplingCoilRefMap.get(kr.bmk);
        if (coilRef) {
          doc.setFont('courier', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(220, 38, 38);
          doc.text(pdfSafe(coilRef), ax + 13.5, 77.5);
        }
      } else if (psu230s.length > 0 && pMode === 'ac_230v_direct') {
        const qb = bmkMap.get(psu230s[0].id)?.bmk ?? '-Q1';
        doc.setDrawColor(15, 23, 42);
        doc.line(ax + 6.5, 68.5, ax + 10, 77);
        doc.setDrawColor(234, 88, 12);
        doc.line(ax + 10, 77, ax + 10, 88);
        doc.setFont('courier', 'normal');
        doc.setFontSize(6.8);
        doc.text(pdfSafe(`${qb} EIN/AUS`), ax + 14, 74);
      } else {
        doc.line(ax + 10, 68, ax + 10, 88);
      }

      doc.setDrawColor(37, 99, 235);
      doc.line(ax + 24, yN, ax + 24, 88);
      doc.circle(ax + 24, yN, 0.8, 'F');
      doc.setDrawColor(22, 163, 74);
      doc.line(ax + 38, yPE, ax + 38, 88);
      doc.circle(ax + 38, yPE, 0.8, 'F');

      // Motor/Pumpen Box
      doc.setFillColor(255, 247, 237);
      doc.setDrawColor(234, 88, 12);
      doc.setLineWidth(0.5);
      doc.rect(ax, 88, 48, 28, 'FD');
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(154, 52, 18);
      doc.text(pdfSafe(`${ab} ${ap.label}`).slice(0, 20), ax + 24, 99, { align: 'center' });
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.8);
      doc.text('L       N      PE', ax + 24, 92.5, { align: 'center' });
      doc.text(pdfSafe(`AquaForte ${String(ap.params?.model ?? 'V-20')}`), ax + 24, 106, {
        align: 'center',
      });
      doc.text(
        pdfSafe(kr ? '24V Koppelrelais' : '230V AC direkt'),
        ax + 24,
        112.5,
        { align: 'center' }
      );
    });

    // =======================================================================
    // STEUERSTROMKREISE 24V DC / 0V (EPLAN 10-SPALTEN-BLATT MIT KONTAKTEN)
    // =======================================================================
    const gridLeft = 14;
    const gridRight = 285;
    const colW = (gridRight - gridLeft) / 10; // 27.1 mm je Spalte

    controlSheets.forEach((cols, sIdx) => {
      const sNr = nextPage(true, 'Stromlaufplan 24V DC');
      const y24 = 24;
      const y0 = 122;

      // +24V DC Schiene oben (Blau) & 0V DC Schiene unterhalb der Spulen (Blau-Weiss)
      doc.setLineWidth(0.55);
      doc.setDrawColor(29, 78, 216);
      doc.line(gridLeft, y24, gridRight, y24);
      drawBlueWhiteWire(doc, gridLeft, y0, gridRight, y0, 0.62);

      doc.setFont('courier', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(29, 78, 216);
      doc.text(
        pdfSafe(sIdx === 0 ? `${pwrSheetNr}.0 24V (blau)` : `${sNr - 1}.9 24V`),
        gridLeft - 1,
        y24 - 1.5
      );
      doc.setTextColor(37, 99, 235);
      doc.text(
        pdfSafe(sIdx === 0 ? `${pwrSheetNr}.0 0V (bl-ws)` : `${sNr - 1}.9 0V`),
        gridLeft - 1,
        y0 - 1.5
      );

      if (sIdx < controlSheets.length - 1) {
        doc.setTextColor(29, 78, 216);
        doc.text(pdfSafe(`${sNr + 1}.0 24V`), gridRight, y24 - 1.5, { align: 'right' });
        doc.setTextColor(37, 99, 235);
        doc.text(pdfSafe(`${sNr + 1}.0 0V`), gridRight, y0 - 1.5, { align: 'right' });
      }

      // Trennlinie zwischen Schaltfeld und unterem Text-/Kontaktspiegel-Bereich (klar unterhalb von 0V!)
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.line(gridLeft, 127, gridRight, 127);

      cols.forEach((col, cIdx) => {
        const cx = gridLeft + cIdx * colW + colW / 2;

        // Klemmenpunkt oben an +24V (blau)
        doc.setDrawColor(29, 78, 216);
        doc.setFillColor(29, 78, 216);
        doc.setLineWidth(0.42);
        if (col.upstream.kind !== 'open') {
          doc.circle(cx, y24, 0.75, 'F');
          doc.line(cx, y24, cx, 42);
        }

        // Optionale Klemmenbezeichnung (z. B. -X1:1)
        if (col.upstream.terminalTag) {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(15, 23, 42);
          doc.setLineWidth(0.3);
          doc.circle(cx, 33, 1.15, 'FD');
          doc.setFont('courier', 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(15, 23, 42);
          doc.text(pdfSafe(col.upstream.terminalTag), cx - 2, 33.8, { align: 'right' });
        }

        // Kontakt-Querverweis auf Spulen-Position
        const contactCoilRef = col.upstream.contactCompId
          ? compToRefCode.get(col.upstream.contactCompId)
          : undefined;

        // Grafisches Kontaktsymbol (y = 42..70)
        drawContactSymbol(doc, cx, 42, 70, col.upstream, contactCoilRef);

        if (col.kind === 'b1_trigger') {
          // Steuerkontakt B1: von y=70 nach rechts direkt auf Klemme B1 des naechsten Bauteils!
          const nextCx = cx + colW;
          doc.setDrawColor(217, 119, 6);
          doc.setLineWidth(0.42);
          doc.line(cx, 70, cx, 92);
          doc.line(cx, 92, nextCx - 7, 92);

          doc.setFont('courier', 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(180, 83, 9);
          doc.text(pdfSafe(col.modeLine), cx, 133, { align: 'center' });
          doc.text('Steuerkontakt', cx, 139, { align: 'center' });
          return;
        }

        // Verbindung vom Kontakt zur Spule A1
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.42);
        doc.line(cx, 70, cx, 84);

        // Spulen-/Ventil-/Melder-Symbol (y = 84..96)
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.5);

        if (col.symbolType === 'lamp') {
          doc.circle(cx, 90, 5.5, 'FD');
          doc.line(cx - 3.8, 86.2, cx + 3.8, 93.8);
          doc.line(cx - 3.8, 93.8, cx + 3.8, 86.2);
        } else {
          doc.rect(cx - 7, 84, 14, 12, 'FD');
          if (col.symbolType === 'valve') {
            // Schraegstrich im Magnetventilsymbol (DIN)
            doc.line(cx - 7, 96, cx + 7, 84);
          } else if (col.symbolType === 'timer') {
            // Kleiner Uhr-/Zeit-Querstrich links am Spulensymbol (wie E1ZM10)
            doc.line(cx - 4.5, 84, cx - 4.5, 96);
          }
        }

        // BMK links neben Spule
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(pdfSafe(col.bmk), cx - 8.2, 91, { align: 'right' });

        // Klemmen A1 / A2 / B1 direkt am Symbol (weit weg von 0V!)
        doc.setFont('courier', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(51, 65, 85);
        doc.text(pdfSafe(col.topTerm), cx + 1.8, 82.8);
        doc.text(pdfSafe(col.botTerm), cx + 1.8, 99.8);
        if (col.symbolType === 'timer') {
          doc.setTextColor(180, 83, 9);
          doc.text('B1', cx - 6.2, 95);
        }

        // 0V Rueckleitung (blau-weiss) gerade runter auf 0V-Sammelschiene (y = 96 -> 122)
        drawBlueWhiteWire(doc, cx, 96, cx, y0, 0.48);
        doc.setFillColor(29, 78, 216);
        doc.circle(cx, y0, 0.75, 'F');

        // SAUBERES BESCHRIFTUNGSFELD UNTERHALB 0V (y = 131..178) -> KEINE UEBERLAPPUNG!
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(15, 23, 42);
        const wrappedTitle = doc.splitTextToSize(pdfSafe(col.title), colW - 3);
        doc.text(wrappedTitle.slice(0, 2), cx, 132.5, { align: 'center' });

        if (col.modeLine) {
          doc.setFont('courier', 'bold');
          doc.setFontSize(6.3);
          doc.setTextColor(3, 105, 161);
          const modeWrapped = doc.splitTextToSize(pdfSafe(col.modeLine), colW - 2.5);
          doc.text(modeWrapped.slice(0, 2), cx, 141.5, { align: 'center' });
        }

        // Kontaktspiegel sauber ganz unten (y = 151..180)
        if (col.mirrorRefs.length > 0) {
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.22);
          doc.line(cx - 11, 148.5, cx + 11, 148.5);
          doc.setFont('courier', 'bold');
          doc.setFontSize(5.8);
          doc.setTextColor(71, 85, 105);
          doc.text('Kontakte:', cx, 152, { align: 'center' });
          doc.setFont('courier', 'normal');
          let my = 155.8;
          for (const mr of col.mirrorRefs.slice(0, 4)) {
            doc.setTextColor(15, 23, 42);
            doc.text(pdfSafe(`${mr.termLabel}`), cx - 10, my);
            doc.setTextColor(220, 38, 38);
            doc.text(pdfSafe(mr.targetRef), cx + 10, my, { align: 'right' });
            my += 4;
          }
        }
      });
    });
  }

  // =========================================================================
  // OPTIONAL: KOMPAKTER KLEMMENPLAN (-X1) FALLS ANGEWAEHLT
  // =========================================================================
  if (options.includeTerminalPlan && terminalBlockComps.length > 0) {
    nextPage(false, 'Klemmenbelegung (-X1 +24V-Potentialverteiler)');
    const tb = terminalBlockComps[0];
    const tbBmk = bmkMap.get(tb.id)?.bmk ?? '-X1';
    const outCount = Number(tb.params?.outputCount ?? 10);
    const tCols = [20, 32, 110, 105];
    drawTableRow(
      doc,
      14,
      24,
      tCols,
      ['Klemme', 'Potential', 'Ziel-Bauteil (BMK : Klemme)', 'Bezeichnung'],
      7.5,
      true
    );
    let ry = 31.5;
    for (let k = 1; k <= Math.min(outCount, 16); k++) {
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
                return `${ob}:${formatPortLabel(oc?.type ?? '', otherPort)}`;
              })
              .join(' / ')
          : '-- Reserve --';
      const labelDesc =
        conns.length > 0
          ? conns
              .map((c) => compMap.get(c.fromCompId === tb.id ? c.toCompId : c.fromCompId)?.label ?? '')
              .join(' / ')
          : 'Frei';
      drawTableRow(
        doc,
        14,
        ry,
        tCols,
        [`${tbBmk}:${k}`, '+24V DC (blau)', targetDesc, labelDesc],
        8.6,
        false
      );
      ry += 8.6;
    }
  }

  // =========================================================================
  // FLUIDIK- & PNEUMATIK-SCHEMA (R&I-FLIESSBILD & VERSCHLAUCHUNGSTABELLE)
  // =========================================================================
  if (options.includeFluidAndAir) {
    nextPage(false, 'Fluidik- & Pneumatik-Schema (R&I-Fliessbild)');

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
    const boxY = 20;
    const boxW = 265;
    const boxH = 152;
    const spanX = Math.max(200, maxX - minX + 80);
    const spanY = Math.max(150, maxY - minY + 80);
    const scale = Math.min(boxW / spanX, boxH / spanY);
    const offsetX = boxX + (boxW - spanX * scale) / 2 - (minX - 40) * scale;
    const offsetY = boxY + (boxH - spanY * scale) / 2 - (minY - 40) * scale;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(250, 252, 255);
    doc.rect(boxX, boxY, boxW, boxH, 'FD');

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
        doc.setDrawColor(8, 145, 178);
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
          doc.setDrawColor(5, 150, 105);
        } else if (med === 'anolyte') {
          doc.setDrawColor(202, 138, 4);
        } else {
          doc.setDrawColor(29, 78, 216);
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
    doc.text('Medien-Legende:', 16, 179);
    const legItems: Array<{ label: string; rgb: [number, number, number]; x: number }> = [
      { label: 'Anolyt (Gelb)', rgb: [202, 138, 4], x: 48 },
      { label: 'Katholyte (Gruen)', rgb: [5, 150, 105], x: 88 },
      { label: 'Wasser (Dunkelblau)', rgb: [29, 78, 216], x: 135 },
      { label: 'Druckluft (Cyan)', rgb: [8, 145, 178], x: 185 },
    ];
    for (const item of legItems) {
      doc.setDrawColor(...item.rgb);
      doc.setLineWidth(1.4);
      doc.line(item.x, 178, item.x + 8, 178);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(item.label, item.x + 10, 179);
    }

    if (fluidAirConns.length > 0) {
      const fCols = [12, 48, 36, 48, 36, 36, 53];
      for (let offset = 0; offset < fluidAirConns.length; offset += 18) {
        nextPage(false, 'Verschlauchungs- & Verrohrungstabelle');
        drawTableRow(
          doc,
          14,
          22,
          fCols,
          ['Nr.', 'Quelle (BMK / Name)', 'Ausgang', 'Ziel (BMK / Name)', 'Eingang', 'Medium', 'Leitungsart'],
          7.5,
          true
        );
        let fy = 29.5;
        fluidAirConns.slice(offset, offset + 18).forEach((cn, idx) => {
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
              cn.domain === 'air' ? 'Pneumatikschlauch 6/8mm' : 'Chemieschlauch / PVC',
            ],
            8.4,
            false
          );
          fy += 8.4;
        });
      }
    }
  }

  const safeSlug =
    cleanName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-|-$/g, '') || 'schaltplan';
  doc.save(`${safeSlug}-anlagenbau-schaltplan-${new Date().toISOString().slice(0, 10)}.pdf`);
}
