import { SimulationEngine } from '../engine/SimulationEngine';
import {
  AirPumpComponent,
  DosingPumpComponent,
  DrainConsumerComponent,
  FloatProbeComponent,
  FluidTeeComponent,
  GeneratorComponent,
  GullyDrainComponent,
  InjectionPointComponent,
  MainWaterLineComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
  WaterMeterComponent,
} from '../engine/components/FluidComponents';
import {
  ChangeoverSwitchComponent,
  IndicatorLampComponent,
  PowerSupply230V,
  PowerSupply24V,
  SwitchComponent,
} from '../engine/components/PowerAndSwitch';
import { TimerRelayComponent, formatTeleDuration } from '../engine/components/Relays';
import { LogicGateComponent } from '../engine/components/SignalAndLogic';
import { FluidMedium, SerializedCircuit } from '../engine/types';
import {
  ComponentObstacle,
  RouteEndpoint,
  routeAllOrthogonalWires,
} from './orthogonalRouting';
import {
  SimulationEventEntry,
  captureEngineSnapshot,
  diffEngineSnapshots,
  formatSimClock,
} from './simulationEvents';

export interface HtmlAnimationExportOptions {
  durationHours: number;
  loopDefault: boolean;
  autoEnablePower: boolean;
  theme: 'dark' | 'light';
}

interface ExportCompFrame {
  on: boolean;
  headline: string;
  subline: string;
  badge?: string;
  pct?: number; // Tank oder Timer
  liters?: number;
  cap?: number;
  aerated?: boolean;
  airLpm?: number;
  medium?: FluidMedium;
  inflow?: number;
  outflow?: number;
  timerRatio?: number;
  timerText?: string;
  activePath?: string;
}

interface ExportConnFrame {
  active: boolean;
  flowLph: number;
  airLpm: number;
  medium: FluidMedium;
}

interface ExportKeyframe {
  t: number; // sim seconds
  clock: string;
  comps: Record<string, ExportCompFrame>;
  conns: Record<string, ExportConnFrame>;
  comment: string;
}

const HIDDEN_PROCESS_TYPES = new Set([
  'power_24v',
  'power_230v',
  'terminal_block',
  'contactor_relay',
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCompFrame(comp: ReturnType<SimulationEngine['components']['get']>): ExportCompFrame {
  if (!comp) return { on: false, headline: '', subline: '' };

  if (comp instanceof TankComponent) {
    const pct = Number(comp.getLevelPercent().toFixed(1));
    const liters = Math.round(comp.getLevelLiters());
    const cap = comp.getCapacity();
    const med = comp.getMedium();
    const aerated = Boolean(comp.runtimeState.aerated);
    const airLpm = Math.round(Number(comp.runtimeState.airFlowLpm ?? 0));
    const inflow = Math.round(Number(comp.runtimeState.inflowLph ?? 0));
    const outflow = Math.round(Number(comp.runtimeState.outflowLph ?? 0));
    return {
      on: inflow > 0 || outflow > 0 || aerated,
      headline: `${liters} L`,
      subline: `${pct.toFixed(1)}% / ${cap} L`,
      pct,
      liters,
      cap,
      aerated,
      airLpm,
      medium: med,
      inflow,
      outflow,
    };
  }

  if (comp instanceof TimerRelayComponent) {
    const switched = Boolean(comp.runtimeState.contactSwitched);
    const isTiming = Boolean(comp.runtimeState.isTiming);
    const elapsed = Number(comp.runtimeState.elapsedSeconds ?? 0);
    const target = Math.max(0.05, comp.getTargetSeconds());
    const ratio = Math.max(0, Math.min(1, elapsed / target));
    return {
      on: switched,
      headline: switched ? '15 → 18 AKTIV' : isTiming ? 'Zeit läuft…' : '15 → 16 Ruhe',
      subline: `${comp.getTeleFunction()} · ${formatTeleDuration(target)}`,
      timerRatio: ratio,
      timerText: `${formatSimClock(elapsed)} / ${formatTeleDuration(target)}`,
    };
  }

  if (comp instanceof GeneratorComponent) {
    const on = Boolean(comp.runtimeState.productionEnabled);
    const ano = Math.round(Number(comp.runtimeState.actualAnolyteLph ?? 0));
    const kat = Math.round(Number(comp.runtimeState.actualKatholyteLph ?? 0));
    return {
      on,
      headline: on ? 'PRODUZIERT' : String(comp.runtimeState.status ?? 'STANDBY').toUpperCase(),
      subline: `Ano ${ano} L/h · Kat ${kat} L/h`,
    };
  }

  if (comp instanceof SolenoidValve32Component) {
    const on = Boolean(comp.runtimeState.energized);
    const path = String(comp.runtimeState.activePath ?? 'P->A');
    return {
      on,
      headline: path === 'P->B' ? 'Pfad P → B' : 'Pfad P → A',
      subline: `${Math.round(Number(comp.runtimeState.activeFlowLph ?? 0))} L/h`,
      activePath: path,
    };
  }

  if (comp instanceof SolenoidValve22Component) {
    const open = Boolean(comp.runtimeState.isOpen);
    return {
      on: open,
      headline: open ? 'OFFEN' : 'ZU',
      subline: `${Math.round(Number(comp.runtimeState.activeFlowLph ?? 0))} L/h`,
    };
  }

  if (comp instanceof DrainConsumerComponent) {
    const open = comp.isOpen();
    return {
      on: open,
      headline: open ? 'GEÖFFNET' : 'GESCHLOSSEN',
      subline: `${Math.round(Number(comp.runtimeState.actualFlowLph ?? 0))} L/h`,
    };
  }

  if (comp instanceof AirPumpComponent) {
    const on = Boolean(comp.runtimeState.running);
    const lpm = Math.round(Number(comp.runtimeState.airFlowLpm ?? 0));
    return {
      on,
      headline: on ? `${lpm} L/min aktiv` : '0 L/min (AUS)',
      subline: `AquaForte ${comp.getModel()}`,
    };
  }

  if (comp instanceof DosingPumpComponent) {
    const on = comp.runtimeState.status === 'dosing';
    return {
      on,
      headline: on ? `${Number(comp.runtimeState.actualFlowLph ?? 0).toFixed(1)} L/h` : 'STANDBY',
      subline: String(comp.params.model ?? 'DDA'),
    };
  }

  if (comp instanceof MainWaterLineComponent) {
    const on = Boolean(comp.runtimeState.flowing);
    return {
      on,
      headline: `${Math.round(Number(comp.runtimeState.actualFlowLph ?? 0))} L/h`,
      subline: 'Rohwasser',
    };
  }

  if (comp instanceof WaterMeterComponent) {
    const flow = Math.round(Number(comp.runtimeState.currentFlowLph ?? 0));
    return {
      on: flow > 0,
      headline: `${flow} L/h`,
      subline: `${Number(comp.runtimeState.totalVolumeLiters ?? 0).toFixed(0)} L gesamt`,
    };
  }

  if (comp instanceof InjectionPointComponent) {
    const total = Number(comp.runtimeState.totalFlowLph ?? 0);
    return {
      on: total > 0,
      headline: `${Math.round(total)} L/h`,
      subline: `${Number(comp.runtimeState.concentrationPpm ?? 0).toFixed(0)} mL/m³`,
    };
  }

  if (comp instanceof GullyDrainComponent) {
    const flow = Math.round(Number(comp.runtimeState.actualFlowLph ?? 0));
    const total = Number(comp.runtimeState.totalDiscardedLiters ?? 0);
    return {
      on: flow > 0,
      headline: flow > 0 ? `${flow} L/h Ablauf` : 'Kein Ablauf',
      subline: `${total.toFixed(1)} L verworfen`,
    };
  }

  if (comp instanceof FluidTeeComponent) {
    const flow = Math.round(Number(comp.runtimeState.activeFlowLph ?? 0));
    return {
      on: flow > 0,
      headline: flow > 0 ? `${flow} L/h` : 'Verteiler / Sammler',
      subline: comp.getTeeMode() === 'merge' ? '2 → 1' : '1 → 2',
    };
  }

  if (comp instanceof FloatProbeComponent) {
    const on = Boolean(comp.runtimeState.minTriggered) || Boolean(comp.runtimeState.maxTriggered);
    return {
      on,
      headline: `Stand ${Number(comp.runtimeState.tankLevelPct ?? 0).toFixed(0)} %`,
      subline: 'Schwimmerlanze',
    };
  }

  if (comp instanceof SwitchComponent) {
    const on = comp.isContactClosed();
    return {
      on,
      headline: on ? 'EIN' : 'AUS',
      subline: 'Haupt-/Steuerschalter',
    };
  }

  if (comp instanceof ChangeoverSwitchComponent) {
    const sw = comp.isSwitched();
    return {
      on: Boolean(comp.runtimeState.inputEnergized) || sw,
      headline: sw ? 'Stellung II' : 'Stellung I',
      subline: 'Wechselschalter',
    };
  }

  if (comp instanceof IndicatorLampComponent) {
    const lit = Boolean(comp.runtimeState.lit);
    return {
      on: lit,
      headline: lit ? 'LEUCHTET' : 'AUS',
      subline: comp.getColor() === 'red' ? 'Rot-Melder' : 'Grün-Melder',
    };
  }

  if (comp instanceof LogicGateComponent) {
    const out = Boolean(comp.runtimeState.out);
    return {
      on: out,
      headline: out ? 'AUSGANG EIN' : 'AUSGANG AUS',
      subline: String(comp.params.gateType ?? 'AND'),
    };
  }

  return { on: false, headline: comp.label, subline: comp.type };
}

export function generateHtmlAnimationExport(
  circuit: SerializedCircuit,
  circuitName: string,
  options: HtmlAnimationExportOptions
): string {
  const engine = new SimulationEngine();
  engine.loadCircuit(circuit);
  engine.reset();

  if (options.autoEnablePower) {
    for (const comp of engine.components.values()) {
      if (comp instanceof PowerSupply24V || comp instanceof PowerSupply230V) {
        comp.params.enabled = true;
      } else if (comp instanceof SwitchComponent) {
        if ((comp.params.mode ?? 'toggle') === 'toggle') {
          comp.params.pressed = true;
        }
      } else if (comp instanceof AirPumpComponent) {
        comp.params.enabled = true;
      }
    }
    engine.evaluateInstant();
  }

  const visibleComps = Array.from(engine.components.values()).filter(
    (c) => !HIDDEN_PROCESS_TYPES.has(c.type)
  );
  const visibleIds = new Set(visibleComps.map((c) => c.id));
  const processConns = engine.connections.filter(
    (c) =>
      (c.domain === 'fluid' || c.domain === 'air') &&
      visibleIds.has(c.fromComponentId) &&
      visibleIds.has(c.toComponentId)
  );

  // Route wires once cleanly for static SVG geometry
  const compMap = new Map(visibleComps.map((c) => [c.id, c]));
  const obstacles: ComponentObstacle[] = visibleComps.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
  }));
  const endpoints: RouteEndpoint[] = [];
  for (const conn of processConns) {
    const fc = compMap.get(conn.fromComponentId);
    const tc = compMap.get(conn.toComponentId);
    if (!fc || !tc) continue;
    const p1 = fc.getPortWorldPosition(conn.fromPortId);
    const p2 = tc.getPortWorldPosition(conn.toPortId);
    if (!p1 || !p2) continue;
    endpoints.push({
      id: conn.id,
      domain: conn.domain,
      fromCompId: conn.fromComponentId,
      toCompId: conn.toComponentId,
      x1: p1.x,
      y1: p1.y,
      side1: p1.side,
      x2: p2.x,
      y2: p2.y,
      side2: p2.side,
    });
  }
  const routed = routeAllOrthogonalWires(endpoints, obstacles);

  // Compute bounding box
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of visibleComps) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 900;
    maxY = 540;
  }
  const pad = 48;
  const viewBox = `${Math.round(minX - pad)} ${Math.round(minY - pad)} ${Math.round(
    maxX - minX + pad * 2
  )} ${Math.round(maxY - minY + pad * 2)}`;

  // Simulate cycle and collect keyframes + events
  const totalDurationSec = Math.max(60, Math.round(options.durationHours * 3600));
  const targetSampleCount = 160;
  const sampleStep = Math.max(10, totalDurationSec / targetSampleCount);

  const keyframes: ExportKeyframe[] = [];
  const allEvents: SimulationEventEntry[] = [];

  const captureKeyframe = (comment: string) => {
    const comps: Record<string, ExportCompFrame> = {};
    for (const c of visibleComps) {
      comps[c.id] = buildCompFrame(c);
    }
    const conns: Record<string, ExportConnFrame> = {};
    for (const cn of processConns) {
      conns[cn.id] = {
        active: cn.active,
        flowLph: Number((cn.flowRateLph ?? 0).toFixed(1)),
        airLpm: Math.round(cn.airFlowLpm ?? 0),
        medium: cn.medium ?? 'water',
      };
    }
    keyframes.push({
      t: Math.round(engine.totalSimSeconds),
      clock: formatSimClock(engine.totalSimSeconds),
      comps,
      conns,
      comment,
    });
  };

  let prevSnap = captureEngineSnapshot(engine);
  const startMsg = `00:00:00 — Simulation gestartet (${options.durationHours}h Zyklus)`;
  allEvents.push({
    id: 'evt_start',
    simSeconds: 0,
    timeLabel: '00:00:00',
    message: 'Anlagen-Zyklus gestartet',
    severity: 'switch',
  });
  captureKeyframe(startMsg);

  let elapsed = 0;
  let latestComment = startMsg;

  while (elapsed < totalDurationSec - 0.5) {
    const dt = Math.min(sampleStep, totalDurationSec - elapsed);
    engine.fastForward(dt);
    elapsed += dt;

    const nextSnap = captureEngineSnapshot(engine);
    const evts = diffEngineSnapshots(prevSnap, nextSnap, engine.totalSimSeconds);
    if (evts.length > 0) {
      allEvents.push(...evts);
      latestComment = `${evts[evts.length - 1].timeLabel} — ${evts[evts.length - 1].message}`;
    }
    prevSnap = nextSnap;
    captureKeyframe(latestComment);
  }

  const staticLayout = {
    viewBox,
    components: visibleComps.map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    })),
    connections: processConns.map((cn) => {
      const r = routed.get(cn.id);
      return {
        id: cn.id,
        domain: cn.domain,
        d: r?.d ?? '',
        midX: r?.midX ?? 0,
        midY: r?.midY ?? 0,
      };
    }),
  };

  const payloadJson = JSON.stringify({
    title: circuitName || circuit.name || 'AnlagenSim Prozessanimation',
    durationHours: options.durationHours,
    totalDurationSec,
    loopDefault: options.loopDefault,
    defaultTheme: options.theme,
    layout: staticLayout,
    keyframes,
    events: allEvents,
  });

  const safeTitle = escapeHtml(circuitName || circuit.name || 'AnlagenSim Prozessanimation');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle} — Funktionsanimation</title>
<style>
  :root {
    --bg: #0B111A;
    --panel: #101826;
    --card: #141E2E;
    --header: #19263A;
    --border: #26364D;
    --text: #F1F5F9;
    --muted: #94A3B8;
    --well: #090E16;
  }
  html.light {
    --bg: #F1F5F9;
    --panel: #FFFFFF;
    --card: #FFFFFF;
    --header: #F8FAFC;
    --border: #CBD5E1;
    --text: #0F172A;
    --muted: #475569;
    --well: #E2E8F0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .title-wrap { display: flex; align-items: center; gap: 10px; }
  .title { font-weight: 700; font-size: 15px; }
  .badge {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(14, 165, 233, 0.15);
    color: #38BDF8;
    border: 1px solid rgba(56, 189, 248, 0.35);
  }
  .ticker {
    flex: 1;
    min-width: 240px;
    max-width: 680px;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--well);
    border: 1px solid var(--border);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stage {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  svg#scene {
    width: 100%;
    height: 100%;
    max-height: 100%;
    display: block;
  }
  .controls {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  button {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 11px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { border-color: #38BDF8; }
  button.primary { background: #0284C7; border-color: #0EA5E9; color: #FFFFFF; }
  button.active { background: rgba(16, 185, 129, 0.2); border-color: #10B981; color: #34D399; }
  html.light button.active { color: #047857; }
  input[type="range"] { flex: 1; min-width: 160px; accent-color: #0EA5E9; cursor: pointer; }
  .clock {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    font-weight: 700;
    min-width: 140px;
  }
  .copy { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; margin-left: auto; }
  @keyframes flowDash { from { stroke-dashoffset: 28; } to { stroke-dashoffset: 0; } }
  @keyframes spinImp { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes bubbleRise {
    0% { transform: translateY(0); opacity: 0; }
    15% { opacity: 0.95; }
    85% { opacity: 0.85; }
    100% { transform: translateY(-110px); opacity: 0; }
  }
  @keyframes waveMove {
    0% { transform: translateX(0); }
    100% { transform: translateX(-60px); }
  }
  .flow-anim { animation: flowDash 0.7s linear infinite; }
  .imp-spin { animation: spinImp 1.4s linear infinite; transform-box: fill-box; transform-origin: center; }
  .bub1 { animation: bubbleRise 1.3s ease-in infinite; }
  .bub2 { animation: bubbleRise 1.7s ease-in 0.4s infinite; }
  .bub3 { animation: bubbleRise 1.45s ease-in 0.8s infinite; }
  .wave-anim { animation: waveMove 1.8s linear infinite; }
  .log-drawer {
    position: absolute;
    right: 14px;
    bottom: 14px;
    width: 340px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 11px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    display: none;
  }
  .log-drawer.open { display: block; }
  .log-item { padding: 4px 0; border-bottom: 1px solid var(--border); }
  .log-item:last-child { border-bottom: none; }
</style>
</head>
<body>
<header>
  <div class="title-wrap">
    <span class="title">${safeTitle}</span>
    <span class="badge">Funktionsanimation · ${options.durationHours}h Zyklus</span>
  </div>
  <div id="ticker" class="ticker">Lade Simulation…</div>
  <div style="display:flex;gap:6px;align-items:center;">
    <button id="btnLog" type="button">Ablauf-Log</button>
    <button id="btnTheme" type="button">Hell / Dunkel</button>
  </div>
</header>

<div class="stage">
  <svg id="scene" preserveAspectRatio="xMidYMid meet"></svg>
  <div id="logDrawer" class="log-drawer"></div>
</div>

<div class="controls">
  <button id="btnPlay" class="primary" type="button">Pause</button>
  <button id="btnLoop" type="button">Endlos-Schleife: EIN</button>
  <span id="clock" class="clock">00:00:00</span>
  <input id="scrubber" type="range" min="0" max="1" value="0" step="1" />
  <select id="speedSel" style="background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;">
    <option value="0.5">0.5× Tempo</option>
    <option value="1" selected>1× Tempo</option>
    <option value="2">2× Tempo</option>
    <option value="5">5× Tempo</option>
    <option value="10">10× Tempo</option>
  </select>
  <span class="copy">Copyright © 2026 #MAT</span>
</div>

<script id="simData" type="application/json">${payloadJson}</script>
<script>
(function(){
  const data = JSON.parse(document.getElementById('simData').textContent);
  if (data.defaultTheme === 'light') document.documentElement.classList.add('light');

  const svg = document.getElementById('scene');
  svg.setAttribute('viewBox', data.layout.viewBox);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  const pipeLayer = el('g');
  const nodeLayer = el('g');
  svg.appendChild(pipeLayer);
  svg.appendChild(nodeLayer);

  const connRefs = {};
  data.layout.connections.forEach((cn) => {
    const g = el('g');
    const casing = el('path', { d: cn.d, fill: 'none', stroke: '#1E293B', 'stroke-width': cn.domain === 'air' ? 5 : 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const core = el('path', { d: cn.d, fill: 'none', stroke: '#334155', 'stroke-width': cn.domain === 'air' ? 3 : 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const pulse = el('path', { d: cn.d, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.2, 'stroke-dasharray': cn.domain === 'air' ? '6 14' : '8 20', 'stroke-linecap': 'round', class: 'flow-anim', style: 'display:none' });
    const lblG = el('g', { transform: 'translate(' + cn.midX + ',' + cn.midY + ')', style: 'display:none' });
    const lblRect = el('rect', { x: -30, y: -10, width: 60, height: 18, rx: 4, fill: '#0B111A', stroke: '#334155', 'stroke-width': 1 });
    const lblText = el('text', { x: 0, y: 2.5, 'text-anchor': 'middle', fill: '#E2E8F0', 'font-size': 9.5, 'font-family': 'monospace', 'font-weight': 700 });
    lblG.appendChild(lblRect); lblG.appendChild(lblText);
    g.appendChild(casing); g.appendChild(core); g.appendChild(pulse); g.appendChild(lblG);
    pipeLayer.appendChild(g);
    connRefs[cn.id] = { domain: cn.domain, core, pulse, lblG, lblRect, lblText };
  });

  const compRefs = {};
  data.layout.components.forEach((c) => {
    const g = el('g', { transform: 'translate(' + c.x + ',' + c.y + ')' });
    const card = el('rect', { width: c.width, height: c.height, rx: 8, fill: 'var(--card)', stroke: 'var(--border)', 'stroke-width': 1.5 });
    const hdr = el('rect', { width: c.width, height: 26, rx: 8, fill: 'var(--header)' });
    const hdrMask = el('rect', { y: 18, width: c.width, height: 8, fill: 'var(--header)' });
    const title = el('text', { x: 10, y: 17, fill: 'var(--text)', 'font-size': 11, 'font-weight': 700 });
    title.textContent = c.label;
    const led = el('circle', { cx: c.width - 14, cy: 13, r: 5.5, fill: '#1E293B', stroke: '#475569', 'stroke-width': 1.2 });
    g.appendChild(card); g.appendChild(hdr); g.appendChild(hdrMask); g.appendChild(title); g.appendChild(led);

    const ref = { type: c.type, width: c.width, height: c.height, led };

    if (c.type === 'tank' || c.type === 'anolyte_tank' || c.type === 'katholyte_tank') {
      const tw = c.width - 24, th = c.height - 80, tx = 12, ty = 44;
      const clipId = 'clip_' + c.id;
      const defs = el('defs');
      const cp = el('clipPath', { id: clipId });
      cp.appendChild(el('rect', { x: tx, y: ty, width: tw, height: th, rx: 4 }));
      defs.appendChild(cp);
      g.appendChild(defs);

      const well = el('rect', { x: tx, y: ty, width: tw, height: th, rx: 4, fill: 'var(--well)', stroke: 'var(--border)' });
      const inner = el('g', { 'clip-path': 'url(#' + clipId + ')' });
      const liq = el('rect', { x: tx, y: ty + th, width: tw, height: 0, fill: '#10B981', 'fill-opacity': 0.85 });
      const wave = el('path', { d: 'M0 4 Q15 -2 30 4 T60 4 T90 4 T120 4 T150 4 T180 4 T210 4 T240 4 T270 4 T300 4 L300 10 L0 10 Z', fill: '#6EE7B7', class: 'wave-anim', style: 'display:none' });
      const bubG = el('g', { style: 'display:none' });
      for (let i = 0; i < 8; i++) {
        const bx = tx + 14 + (i * (tw - 28)) / 7;
        const b = el('circle', { cx: bx, cy: ty + th - 6, r: i % 2 === 0 ? 3.2 : 2.3, fill: '#CFFAFE', class: i % 3 === 0 ? 'bub1' : i % 3 === 1 ? 'bub2' : 'bub3' });
        bubG.appendChild(b);
      }
      inner.appendChild(liq); inner.appendChild(wave); inner.appendChild(bubG);

      const readoutBox = el('rect', { x: tx + tw / 2 - 46, y: ty + th / 2 - 22, width: 92, height: 44, rx: 5, fill: 'rgba(15,23,42,0.75)' });
      const txtLiters = el('text', { x: tx + tw / 2, y: ty + th / 2 - 4, 'text-anchor': 'middle', fill: '#FFFFFF', 'font-size': 13, 'font-weight': 700, 'font-family': 'monospace' });
      const txtPct = el('text', { x: tx + tw / 2, y: ty + th / 2 + 12, 'text-anchor': 'middle', fill: '#E2E8F0', 'font-size': 10, 'font-family': 'monospace' });
      const txtAir = el('text', { x: tx + tw / 2, y: ty + th - 6, 'text-anchor': 'middle', fill: '#67E8F9', 'font-size': 9.5, 'font-weight': 700, 'font-family': 'monospace', style: 'display:none' });
      const txtMed = el('text', { x: 14, y: 38, fill: '#6EE7B7', 'font-size': 10, 'font-weight': 700 });
      const txtIn = el('text', { x: 14, y: c.height - 14, fill: '#10B981', 'font-size': 10, 'font-family': 'monospace' });
      const txtOut = el('text', { x: c.width - 14, y: c.height - 14, 'text-anchor': 'end', fill: '#F59E0B', 'font-size': 10, 'font-family': 'monospace' });

      g.appendChild(well); g.appendChild(inner); g.appendChild(readoutBox);
      g.appendChild(txtLiters); g.appendChild(txtPct); g.appendChild(txtAir);
      g.appendChild(txtMed); g.appendChild(txtIn); g.appendChild(txtOut);

      Object.assign(ref, { tx, ty, tw, th, liq, wave, bubG, txtLiters, txtPct, txtAir, txtMed, txtIn, txtOut });
    } else if (c.type === 'timer_relay') {
      const sub = el('text', { x: 12, y: 48, fill: '#A3E635', 'font-size': 11, 'font-weight': 700, 'font-family': 'monospace' });
      const head = el('text', { x: 12, y: 68, fill: 'var(--text)', 'font-size': 12, 'font-weight': 700, 'font-family': 'monospace' });
      const barBg = el('rect', { x: 12, y: 84, width: c.width - 24, height: 10, rx: 4, fill: 'var(--well)', stroke: 'var(--border)' });
      const barFill = el('rect', { x: 12, y: 84, width: 0, height: 10, rx: 4, fill: '#84CC16' });
      const tTxt = el('text', { x: 12, y: 112, fill: 'var(--muted)', 'font-size': 10, 'font-family': 'monospace' });
      g.appendChild(sub); g.appendChild(head); g.appendChild(barBg); g.appendChild(barFill); g.appendChild(tTxt);
      Object.assign(ref, { sub, head, barFill, barW: c.width - 24, tTxt });
    } else if (c.type === 'generator') {
      const ring = el('circle', { cx: 34, cy: 76, r: 19, fill: 'var(--well)', stroke: '#EAB308', 'stroke-width': 2.2 });
      const blades = el('path', { d: 'M34 61 L38 72 L34 76 L30 72 Z M49 76 L38 80 L34 76 L38 72 Z M34 91 L30 80 L34 76 L38 80 Z M19 76 L30 72 L34 76 L30 80 Z', fill: '#FACC15' });
      const head = el('text', { x: 66, y: 70, fill: 'var(--text)', 'font-size': 11.5, 'font-weight': 700, 'font-family': 'monospace' });
      const sub = el('text', { x: 66, y: 90, fill: 'var(--muted)', 'font-size': 10, 'font-family': 'monospace' });
      g.appendChild(ring); g.appendChild(blades); g.appendChild(head); g.appendChild(sub);
      Object.assign(ref, { blades, head, sub });
    } else {
      const head = el('text', { x: 12, y: 58, fill: 'var(--text)', 'font-size': 12, 'font-weight': 700, 'font-family': 'monospace' });
      const sub = el('text', { x: 12, y: 78, fill: 'var(--muted)', 'font-size': 10, 'font-family': 'monospace' });
      g.appendChild(head); g.appendChild(sub);
      Object.assign(ref, { head, sub });
    }

    nodeLayer.appendChild(g);
    compRefs[c.id] = ref;
  });

  const logDrawer = document.getElementById('logDrawer');
  logDrawer.innerHTML = data.events.map(e => '<div class="log-item"><strong style="color:#38BDF8">' + e.timeLabel + '</strong> — ' + e.message + '</div>').join('');

  const scrubber = document.getElementById('scrubber');
  scrubber.max = String(Math.max(0, data.keyframes.length - 1));
  const clockEl = document.getElementById('clock');
  const tickerEl = document.getElementById('ticker');
  const btnPlay = document.getElementById('btnPlay');
  const btnLoop = document.getElementById('btnLoop');
  const speedSel = document.getElementById('speedSel');

  let frameIdx = 0;
  let playing = true;
  let loop = Boolean(data.loopDefault);
  let lastTs = performance.now();
  let accum = 0;

  function updateLoopBtn() {
    btnLoop.textContent = loop ? 'Endlos-Schleife: EIN' : 'Endlos-Schleife: AUS';
    btnLoop.className = loop ? 'active' : '';
  }
  updateLoopBtn();

  function renderFrame(idx) {
    const kf = data.keyframes[idx];
    if (!kf) return;
    frameIdx = idx;
    scrubber.value = String(idx);
    clockEl.textContent = kf.clock + ' / ' + data.durationHours + 'h';
    tickerEl.textContent = kf.comment;

    for (const [cid, cf] of Object.entries(kf.conns)) {
      const r = connRefs[cid];
      if (!r) continue;
      if (r.domain === 'air') {
        const on = cf.active && cf.airLpm > 0;
        r.core.setAttribute('stroke', on ? '#22D3EE' : '#334155');
        r.pulse.style.display = on ? 'block' : 'none';
        r.pulse.setAttribute('stroke', '#ECFEFF');
        r.lblG.style.display = on ? 'block' : 'none';
        r.lblRect.setAttribute('stroke', '#06B6D4');
        r.lblText.textContent = cf.airLpm + ' L/min';
      } else {
        const on = cf.active && cf.flowLph > 0;
        const base = cf.medium === 'katholyte' ? '#10B981' : cf.medium === 'anolyte' ? '#EAB308' : '#1D4ED8';
        const pls = cf.medium === 'katholyte' ? '#A7F3D0' : cf.medium === 'anolyte' ? '#FEF08A' : '#93C5FD';
        r.core.setAttribute('stroke', on ? base : '#334155');
        r.pulse.style.display = on ? 'block' : 'none';
        r.pulse.setAttribute('stroke', pls);
        r.lblG.style.display = on ? 'block' : 'none';
        r.lblRect.setAttribute('stroke', base);
        r.lblText.textContent = (cf.flowLph < 10 ? cf.flowLph.toFixed(1) : Math.round(cf.flowLph)) + ' L/h';
      }
    }

    for (const [id, st] of Object.entries(kf.comps)) {
      const r = compRefs[id];
      if (!r) continue;
      r.led.setAttribute('fill', st.on ? '#34D399' : '#1E293B');
      r.led.setAttribute('stroke', st.on ? '#D1FAE5' : '#475569');

      if (r.liq) {
        const pct = Math.max(0, Math.min(100, st.pct || 0));
        const h = (pct / 100) * r.th;
        const topY = r.ty + r.th - h;
        const fillCol = st.medium === 'katholyte' ? '#10B981' : st.medium === 'anolyte' ? '#EAB308' : '#1D4ED8';
        const waveCol = st.medium === 'katholyte' ? '#34D399' : st.medium === 'anolyte' ? '#FACC15' : '#3B82F6';
        r.liq.setAttribute('y', topY);
        r.liq.setAttribute('height', h);
        r.liq.setAttribute('fill', fillCol);
        r.txtLiters.textContent = st.headline;
        r.txtPct.textContent = st.subline;
        r.txtMed.textContent = st.medium === 'katholyte' ? 'Katholyte' : st.medium === 'anolyte' ? 'Anolyt' : 'Wasser';
        r.txtMed.setAttribute('fill', fillCol);
        r.txtIn.textContent = '+' + (st.inflow || 0) + ' L/h';
        r.txtOut.textContent = '-' + (st.outflow || 0) + ' L/h';
        const bubOn = Boolean(st.aerated) && pct > 2;
        r.bubG.style.display = bubOn ? 'block' : 'none';
        r.wave.style.display = Boolean(st.aerated) && pct > 1 ? 'block' : 'none';
        if (Boolean(st.aerated) && pct > 1) {
          r.wave.setAttribute('fill', waveCol);
          r.wave.setAttribute('transform', 'translate(' + r.tx + ',' + (topY - 5) + ')');
        }
        r.txtAir.style.display = st.aerated ? 'block' : 'none';
        if (st.aerated) r.txtAir.textContent = 'Belüftet · ' + (st.airLpm || 0) + ' L/min';
      } else if (r.barFill) {
        r.sub.textContent = st.subline;
        r.head.textContent = st.headline;
        r.barFill.setAttribute('width', Math.max(0, Math.min(1, st.timerRatio || 0)) * r.barW);
        r.tTxt.textContent = st.timerText || '';
      } else if (r.blades) {
        r.head.textContent = st.headline;
        r.sub.textContent = st.subline;
        r.blades.setAttribute('class', st.on ? 'imp-spin' : '');
        r.blades.setAttribute('fill', st.on ? '#FACC15' : '#64748B');
      } else if (r.head) {
        r.head.textContent = st.headline;
        r.sub.textContent = st.subline;
      }
    }
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - lastTs) / 1000);
    lastTs = now;
    if (playing && data.keyframes.length > 1) {
      const speed = Number(speedSel.value) || 1;
      const baseFps = Math.max(4, data.keyframes.length / 32); // ~32 Sekunden je Zyklus bei 1x
      accum += dt * baseFps * speed;
      if (accum >= 1) {
        const step = Math.floor(accum);
        accum -= step;
        let next = frameIdx + step;
        if (next >= data.keyframes.length) {
          if (loop) {
            next = next % data.keyframes.length;
          } else {
            next = data.keyframes.length - 1;
            playing = false;
            btnPlay.textContent = 'Start';
          }
        }
        renderFrame(next);
      }
    }
    requestAnimationFrame(tick);
  }

  btnPlay.addEventListener('click', () => {
    playing = !playing;
    btnPlay.textContent = playing ? 'Pause' : 'Start';
    if (playing && frameIdx >= data.keyframes.length - 1) renderFrame(0);
  });
  btnLoop.addEventListener('click', () => {
    loop = !loop;
    updateLoopBtn();
  });
  scrubber.addEventListener('input', () => {
    renderFrame(Number(scrubber.value));
  });
  document.getElementById('btnTheme').addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
  });
  document.getElementById('btnLog').addEventListener('click', () => {
    logDrawer.classList.toggle('open');
  });

  renderFrame(0);
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>`;
}
