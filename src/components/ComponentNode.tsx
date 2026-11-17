import React from 'react';
import { Settings } from 'lucide-react';
import { SimComponent } from '../engine/SimComponent';
import {
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
import { PowerSupply24V, SwitchComponent } from '../engine/components/PowerAndSwitch';
import {
  ContactorRelayComponent,
  TimerRelayComponent,
  formatTeleDuration,
} from '../engine/components/Relays';
import {
  CurrentTransformerComponent,
  LogicGateComponent,
  SignalTransmitterComponent,
} from '../engine/components/SignalAndLogic';
import { TerminalBlockComponent } from '../engine/components/TerminalBlock';
import {
  AnalogSignal,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  PortDomain,
} from '../engine/types';

export interface PendingWireStart {
  componentId: string;
  portId: string;
  domain: PortDomain;
  direction: 'input' | 'output';
}

interface ComponentNodeProps {
  component: SimComponent;
  allComponents: SimComponent[];
  isSelected: boolean;
  pendingWire: PendingWireStart | null;
  onStartDrag: (e: React.PointerEvent, componentId: string) => void;
  onSelect: (componentId: string) => void;
  onOpenProperties: (componentId: string) => void;
  onPortClick: (e: React.MouseEvent, componentId: string, port: PortDefinition) => void;
  onMutateComponent: () => void;
}

function isPortCompatible(
  pending: PendingWireStart | null,
  componentId: string,
  port: PortDefinition
): boolean {
  if (!pending) return false;
  if (pending.componentId === componentId) return false;
  if (pending.domain !== port.domain) return false;
  return pending.direction !== port.direction;
}

function getFaultBadgeText(fault: ComponentFaultType): string | null {
  if (fault === 'power_failure') return 'NETZAUSFALL';
  if (fault === 'short_circuit') return 'KURZSCHLUSS';
  if (fault === 'valve_stuck_closed') return 'KLEMMT (ZU)';
  if (fault === 'valve_stuck_open') return 'KLEMMT (OFFEN)';
  return null;
}

export const ComponentNode: React.FC<ComponentNodeProps> = ({
  component,
  allComponents,
  isSelected,
  pendingWire,
  onStartDrag,
  onSelect,
  onOpenProperties,
  onPortClick,
  onMutateComponent,
}) => {
  const ports = component.getPorts();
  const hasFault = component.fault !== 'none';
  const faultText = getFaultBadgeText(component.fault);

  const stopDrag = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  const renderBody = () => {
    // 1. Spannungsquelle 24V DC
    if (component instanceof PowerSupply24V) {
      const enabled = Boolean(component.params.enabled ?? true);
      const active = Boolean(component.runtimeState.active);
      const tripped = Boolean(component.runtimeState.trippedShortCircuit);
      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`font-mono text-base font-bold ${
                tripped ? 'text-red-400' : active ? 'text-slate-100' : 'text-slate-500'
              }`}
            >
              {active ? '24.0 V' : '0.0 V'}
            </span>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                component.togglePower();
                onMutateComponent();
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                enabled
                  ? 'bg-red-500/20 text-red-300 border-red-500/50 hover:bg-red-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-slate-200'
              }`}
            >
              {enabled ? 'EIN' : 'AUS'}
            </button>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {tripped
              ? 'ÜBERLAST / KURZSCHLUSS'
              : component.fault === 'power_failure'
              ? 'Versorgung ausgefallen'
              : 'Gleichspannung DC'}
          </div>
        </div>
      );
    }

    // 2. Klemmblock (Igel)
    if (component instanceof TerminalBlockComponent) {
      const count = component.getOutputCount();
      const energized = Boolean(component.runtimeState.inputEnergized);
      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[11px]">
          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2.5 py-1.5">
            <span className="text-slate-400">24V Potential</span>
            <span className={`font-mono font-semibold ${energized ? 'text-red-400' : 'text-slate-500'}`}>
              {energized ? '24V AKTIV' : '0V'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 text-center">
            {count} Ausgänge (Igel-Layout)
          </div>
        </div>
      );
    }

    // 3. Taster / Schalter
    if (component instanceof SwitchComponent) {
      const mode = String(component.params.mode ?? 'toggle');
      const closed = component.isContactClosed();
      const inputEnergized = Boolean(component.runtimeState.inputEnergized);
      const activeOutput = closed && inputEnergized && component.fault === 'none';
      const isMomentary = mode === 'momentary_no' || mode === 'momentary_nc';

      return (
        <div className="px-3 py-1.5 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <svg viewBox="0 0 64 24" className="w-16 h-6">
              <line x1="4" y1="16" x2="20" y2="16" stroke={inputEnergized ? '#EF4444' : '#64748B'} strokeWidth="2.2" />
              <line
                x1="20"
                y1="16"
                x2={closed ? '44' : '41'}
                y2={closed ? '16' : '5'}
                stroke={activeOutput ? '#EF4444' : closed ? '#E2E8F0' : '#94A3B8'}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <line x1="44" y1="16" x2="60" y2="16" stroke={activeOutput ? '#EF4444' : '#64748B'} strokeWidth="2.2" />
              <circle cx="20" cy="16" r="2.5" fill={inputEnergized ? '#EF4444' : '#94A3B8'} />
              <circle cx="44" cy="16" r="2.5" fill={activeOutput ? '#EF4444' : '#94A3B8'} />
            </svg>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (isMomentary) {
                  component.setPressed(true);
                  onMutateComponent();
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (isMomentary) {
                  component.setPressed(false);
                  onMutateComponent();
                }
              }}
              onPointerLeave={() => {
                if (isMomentary && Boolean(component.params.pressed)) {
                  component.setPressed(false);
                  onMutateComponent();
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isMomentary) {
                  component.toggle();
                  onMutateComponent();
                }
              }}
              className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer select-none ${
                closed
                  ? 'bg-red-500/20 text-red-200 border-red-500/50 hover:bg-red-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
              }`}
            >
              {isMomentary ? 'Tasten' : closed ? 'EIN' : 'AUS'}
            </button>
          </div>
          <div className="text-[10px] text-slate-400">
            {mode === 'toggle'
              ? 'Schalter (rastend)'
              : mode === 'momentary_nc'
              ? 'Taster Öffner (NC)'
              : 'Taster Schließer (NO)'}
          </div>
        </div>
      );
    }

    // 4. TELE ENYA E1ZM10 Zeitrelais
    if (component instanceof TimerRelayComponent) {
      const fn = component.getTeleFunction();
      const rangeId = component.getTeleRange();
      const target = component.getTargetSeconds();
      const uOn = Boolean(component.runtimeState.coilEnergized);
      const b1On = Boolean(component.runtimeState.b1Energized);
      const switched = Boolean(component.runtimeState.contactSwitched);
      const elapsed = Number(component.runtimeState.elapsedSeconds ?? 0);
      const ledUt = String(component.runtimeState.ledUt ?? 'off');
      const pct = target > 0 ? Math.min(100, Math.round((elapsed / target) * 100)) : 0;

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="px-1.5 py-0.5 rounded bg-lime-500/15 border border-lime-500/40 font-mono font-bold text-lime-300">
              {fn}
            </span>
            <span className="font-mono text-slate-200 text-[11px]">
              {formatTeleDuration(target)}{' '}
              <span className="text-[9px] text-slate-400">({rangeId})</span>
            </span>
          </div>

          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full border ${
                  ledUt === 'blink'
                    ? 'bg-emerald-400 border-emerald-200 animate-pulse shadow-[0_0_6px_#34d399]'
                    : ledUt === 'on'
                    ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_6px_#10b981]'
                    : 'bg-slate-800 border-slate-600'
                }`}
              />
              <span className="font-mono text-slate-300">U/t</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full border ${
                  switched
                    ? 'bg-amber-400 border-amber-200 shadow-[0_0_6px_#fbbf24]'
                    : 'bg-slate-800 border-slate-600'
                }`}
              />
              <span className="font-mono text-slate-300">R</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9.5px] text-slate-400 font-mono">
              <span>
                U:{uOn ? '24V' : '0V'} · S:{b1On ? '1' : '0'}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  switched ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1">
            <span className="text-[10px] text-slate-400">TELE E1ZM10</span>
            <span className={`font-mono text-[10.5px] font-semibold ${switched ? 'text-amber-300' : 'text-sky-300'}`}>
              {switched ? '15 → 18 (NO)' : '15 → 16 (NC)'}
            </span>
          </div>
        </div>
      );
    }

    // 5. Hilfsrelais / Schütz
    if (component instanceof ContactorRelayComponent) {
      const coilOn = Boolean(component.runtimeState.coilEnergized);
      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[11px]">
          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1">
            <span className="text-slate-400">Spule A1</span>
            <span className={`font-mono font-semibold ${coilOn ? 'text-red-400' : 'text-slate-500'}`}>
              {coilOn ? '24V ANZUG' : '0V RUHE'}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between bg-[#0B111A]/80 border border-[#1E2A3B] rounded px-2 py-1">
              <span className="text-[10px] text-slate-400">K1</span>
              <span className={`font-mono text-[11px] ${coilOn ? 'text-red-400' : 'text-sky-300'}`}>
                {coilOn ? '11 → 14' : '11 → 12'}
              </span>
            </div>
            <div className="flex items-center justify-between bg-[#0B111A]/80 border border-[#1E2A3B] rounded px-2 py-1">
              <span className="text-[10px] text-slate-400">K2</span>
              <span className={`font-mono text-[11px] ${coilOn ? 'text-red-400' : 'text-sky-300'}`}>
                {coilOn ? '21 → 24' : '21 → 22'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // 6. Stromwandler
    if (component instanceof CurrentTransformerComponent) {
      const amps = Number(component.runtimeState.measuredAmps ?? 0);
      const aVal = Number(component.runtimeState.analogValue ?? 4);
      const aUnit = String(component.runtimeState.analogUnit ?? 'mA');
      const maxAmps = Number(component.params.maxCurrentAmps ?? 10);
      const energized = Boolean(component.runtimeState.inputEnergized);

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[10px]">Laststrom</span>
            <span className="font-mono text-sm font-bold text-slate-100">
              {amps.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">A</span>
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${amps > maxAmps ? 'bg-red-500' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, (amps / Math.max(0.5, maxAmps)) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1">
            <span className="text-[10px] text-slate-400">
              {energized ? 'Aktiv' : '0V'} · Max {maxAmps}A
            </span>
            <span className="font-mono font-semibold text-emerald-400">
              {aVal.toFixed(1)} {aUnit}
            </span>
          </div>
        </div>
      );
    }

    // 7. Messumformer
    if (component instanceof SignalTransmitterComponent) {
      const mode = String(component.params.conversionMode ?? 'v10_to_ma');
      const inVal = Number(component.runtimeState.inputValue ?? 0);
      const inUnit = String(component.runtimeState.inputUnit ?? 'V');
      const outVal = Number(component.runtimeState.outputValue ?? 4);
      const outUnit = String(component.runtimeState.outputUnit ?? 'mA');
      const triggered = Boolean(component.runtimeState.thresholdTriggered);
      const hasExt = Boolean(component.runtimeState.hasExternalSignal);
      const testVal = Number(component.params.manualTestInput ?? 0);

      const modeText =
        mode === 'v10_to_ma'
          ? '0–10V → 4–20mA'
          : mode === 'v24_to_ma'
          ? '0–24V → 4–20mA'
          : '4–20mA → 0–10V';

      const sliderMin = mode === 'ma_to_v10' ? 4 : 0;
      const sliderMax = mode === 'v10_to_ma' ? 10 : mode === 'v24_to_ma' ? 24 : 20;

      return (
        <div className="px-3 py-1.5 flex flex-col justify-between h-[calc(100%-28px)] text-[11px]">
          <div className="text-[10px] font-mono text-emerald-300 text-center">{modeText}</div>
          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1 font-mono">
            <span className="text-slate-300">
              {inVal.toFixed(1)} {inUnit}
            </span>
            <span className="text-slate-500">→</span>
            <span className="text-emerald-400 font-semibold">
              {outVal.toFixed(1)} {outUnit}
            </span>
          </div>
          {!hasExt ? (
            <div onPointerDown={stopDrag} className="space-y-0.5">
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>Test-Eingang</span>
                <span className="font-mono">
                  {testVal.toFixed(1)} {inUnit}
                </span>
              </div>
              <input
                type="range"
                aria-label="Messumformer Test-Eingang"
                min={sliderMin}
                max={sliderMax}
                step={0.2}
                value={Math.max(sliderMin, Math.min(sliderMax, testVal))}
                onChange={(e) => {
                  component.params.manualTestInput = Number(e.target.value);
                  onMutateComponent();
                }}
                className="w-full h-1.5 accent-emerald-400 cursor-pointer"
              />
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 text-center">Externes Eingangssignal aktiv</div>
          )}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Grenzwert ≥{Number(component.params.thresholdPct ?? 50)}%</span>
            <span className={`font-mono font-semibold ${triggered ? 'text-red-400' : 'text-slate-500'}`}>
              {triggered ? 'Q: 24V' : 'Q: 0V'}
            </span>
          </div>
        </div>
      );
    }

    // 8. Logikgatter
    if (component instanceof LogicGateComponent) {
      const in1 = Boolean(component.runtimeState.in1);
      const in2 = Boolean(component.runtimeState.in2);
      const out = Boolean(component.runtimeState.out);
      const sym = component.gateKind === 'AND' ? '&' : component.gateKind === 'OR' ? '≥1' : '1';

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-center gap-2">
            <div className="w-14 h-12 rounded border border-violet-500/40 bg-[#0B111A] flex flex-col items-center justify-center">
              <span className="font-mono text-base font-bold text-violet-300">{sym}</span>
              <span className="font-mono text-[9px] text-slate-400">{component.gateKind}</span>
            </div>
          </div>
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-slate-400">
              {component.gateKind === 'NOT' ? `I1:${in1 ? '1' : '0'}` : `${in1 ? '1' : '0'} / ${in2 ? '1' : '0'}`}
            </span>
            <span className={out ? 'text-red-400 font-semibold' : 'text-slate-500'}>
              Q: {out ? '24V' : '0V'}
            </span>
          </div>
        </div>
      );
    }

    // 9. Anolyte / Katholyte Tank
    if (component instanceof TankComponent) {
      const medium = component.getMedium();
      const isKat = medium === 'katholyte';
      const cap = component.getCapacity();
      const liters = component.getLevelLiters();
      const pct = component.getLevelPercent();
      const inflow = Number(component.runtimeState.inflowLph ?? 0);
      const outflow = Number(component.runtimeState.outflowLph ?? 0);
      const isFull = component.isFull();
      const probeMode = component.getProbeMode();
      const suctionCount = component.getSuctionCount();

      const liquidClass = isFull
        ? 'bg-gradient-to-t from-amber-600/80 to-amber-400/75'
        : isKat
        ? 'bg-gradient-to-t from-emerald-700/85 to-emerald-400/75'
        : 'bg-gradient-to-t from-sky-700/85 to-sky-400/75';

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span
              className={`font-semibold px-1.5 py-0.5 rounded border ${
                isKat
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-sky-500/15 text-sky-300 border-sky-500/40'
              }`}
            >
              {isKat ? 'Katholyt' : 'Anolyt'}
            </span>
            <span className="font-mono text-[9.5px] text-slate-400">
              {probeMode === 'none' ? 'Ohne Lanze' : probeMode === '5_points' ? '5-Pkt' : '3-Pkt'} · {suctionCount}× Saug
            </span>
          </div>

          <div className="relative flex-1 min-h-[96px] w-full bg-[#090E16] border border-[#2A3B55] rounded overflow-hidden">
            <div
              className={`absolute bottom-0 left-0 right-0 transition-[height] duration-100 ${liquidClass}`}
              style={{ height: `${Math.max(0, Math.min(100, pct))}%` }}
            >
              {pct > 1 && (
                <div className={`h-[2px] w-full ${isKat ? 'bg-emerald-200/80' : 'bg-sky-200/80'}`} />
              )}
            </div>

            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between py-2 px-1.5 text-[9px] font-mono text-slate-400/80">
              <div className="flex justify-between items-center border-b border-dashed border-slate-600/40 pb-0.5">
                <span>100%</span>
                {isFull && <span className="text-amber-300 font-bold">VOLL</span>}
              </div>
              <div className="border-b border-dashed border-slate-600/30">50%</div>
              <div>0%</div>
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none drop-shadow">
              <span className="font-mono text-sm font-bold text-white">{Math.round(liters)} L</span>
              <span className="font-mono text-[10px] text-slate-200">
                {pct.toFixed(1)}% / {cap} L
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono mt-1">
            <span className={inflow > 0 ? (isKat ? 'text-emerald-400' : 'text-sky-400') : 'text-slate-500'}>
              +{Math.round(inflow)} L/h
            </span>
            <span className={outflow > 0 ? 'text-amber-400' : 'text-slate-500'}>
              -{Math.round(outflow)} L/h
            </span>
          </div>

          <div className="mt-1 pt-1 border-t border-[#1E2A3B]" onPointerDown={stopDrag}>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
              <span>Manuell testen</span>
              <span className="font-mono text-slate-300">{Math.round(pct)}%</span>
            </div>
            <input
              type="range"
              aria-label={`${component.label} Füllstand manuell einstellen`}
              min={0}
              max={100}
              step={1}
              value={Math.round(pct)}
              onChange={(e) => {
                component.setManualLevelPercent(Number(e.target.value));
                onMutateComponent();
              }}
              className={`w-full h-1.5 cursor-pointer ${isKat ? 'accent-emerald-400' : 'accent-sky-400'}`}
            />
          </div>
        </div>
      );
    }

    // 10. Schwimmerlanze (Separat)
    if (component instanceof FloatProbeComponent) {
      const tankId = String(component.params.tankId ?? '');
      const linkedTank = allComponents.find((c) => c.id === tankId) as TankComponent | undefined;
      const minPct = Number(component.params.minPct ?? component.params.minPercent ?? 40);
      const maxPct = Number(component.params.maxPct ?? component.params.maxPercent ?? 80);
      const rawLevel =
        typeof component.runtimeState.tankLevelPct === 'number'
          ? component.runtimeState.tankLevelPct
          : linkedTank
          ? linkedTank.getLevelPercent()
          : Number(component.params.levelPct ?? 50);
      const levelPct = Number.isFinite(rawLevel) ? rawLevel : 50;
      const minActive = Boolean(component.runtimeState.minTriggered);
      const maxActive = Boolean(component.runtimeState.maxTriggered);
      const powered = Boolean(component.runtimeState.powered);

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[11px]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400 truncate max-w-[110px]">
              {linkedTank ? linkedTank.label : 'Kein Tank zugeordnet'}
            </span>
            <span className="font-mono text-sky-300">{levelPct.toFixed(0)}%</span>
          </div>

          <div className="relative h-2.5 bg-[#090E16] border border-[#243247] rounded overflow-hidden my-1">
            <div
              className="h-full bg-sky-500/75"
              style={{ width: `${Math.max(0, Math.min(100, levelPct))}%` }}
            />
            <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400" style={{ left: `${minPct}%` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-400" style={{ left: `${maxPct}%` }} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">MIN ({minPct}%)</span>
              <span className={`font-mono text-[10px] font-semibold ${powered && minActive ? 'text-red-400' : 'text-slate-500'}`}>
                {!powered ? 'KEINE 24V' : minActive ? '24V AKTIV' : '0V'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">MAX ({maxPct}%)</span>
              <span className={`font-mono text-[10px] font-semibold ${powered && maxActive ? 'text-red-400' : 'text-slate-500'}`}>
                {!powered ? 'KEINE 24V' : maxActive ? '24V AKTIV' : '0V'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // 11. Erzeuger-Anlage (Anolyt + Katholyt + Hand-Stopp)
    if (component instanceof GeneratorComponent) {
      const status = String(component.runtimeState.status ?? 'standby');
      const actualAno = Number(component.runtimeState.actualAnolyteLph ?? 0);
      const actualKat = Number(component.runtimeState.actualKatholyteLph ?? 0);
      const nomAno = component.getAnolyteNominalLph();
      const nomKat = component.getKatholyteNominalLph();
      const manualStop = Boolean(component.params.manualStop);
      const mode = component.getControlMode();
      const running = status === 'running';

      const statusText =
        component.fault === 'power_failure'
          ? 'STÖRUNG: SPANNUNG'
          : component.fault === 'short_circuit'
          ? 'KURZSCHLUSS'
          : manualStop
          ? 'HAND-STOPP AKTIV'
          : status === 'running'
          ? 'PRODUZIERT'
          : status === 'locked_full'
          ? 'TANK VOLL (STOPP)'
          : status === 'locked_ext'
          ? 'GESPERRT: EXTERN'
          : status === 'blocked'
          ? 'AUSGANG ZU / LEER'
          : 'STANDBY (WARTET)';

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <svg viewBox="0 0 36 36" className="w-8 h-8 shrink-0">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="#0B111A"
                  stroke={running ? '#0EA5E9' : manualStop ? '#F59E0B' : '#475569'}
                  strokeWidth="2"
                />
                <g className={running ? 'animate-spin-impeller' : ''} style={{ transformOrigin: '18px 18px' }}>
                  <path
                    d="M18 6 L21 15 L18 18 L15 15 Z M30 18 L21 21 L18 18 L21 15 Z M18 30 L15 21 L18 18 L21 21 Z M6 18 L15 15 L18 18 L15 21 Z"
                    fill={running ? '#38BDF8' : '#64748B'}
                  />
                </g>
              </svg>
              <div className="text-[10px] font-mono space-y-0.5">
                <div className="text-sky-300">
                  Ano: <span className="font-bold">{Math.round(actualAno)}</span>/{Math.round(nomAno)} L/h
                </div>
                <div className="text-emerald-300">
                  Kat: <span className="font-bold">{Math.round(actualKat)}</span>/{Math.round(nomKat)} L/h
                </div>
              </div>
            </div>

            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                component.params.manualStop = !manualStop;
                onMutateComponent();
              }}
              className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer shrink-0 ${
                manualStop
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
              }`}
              title="Zwischen Hand-Stopp und Automatik umschalten"
            >
              {manualStop ? 'STOPP' : 'AUTO'}
            </button>
          </div>

          <div className="flex items-center justify-between text-[9.5px] text-slate-400 font-mono">
            <span>Modus: {mode === 'tank_minmax' ? 'MIN/MAX' : '24V EN'}</span>
            {mode === 'tank_minmax' && (
              <span className={Boolean(component.runtimeState.latchActive) ? 'text-sky-300' : 'text-slate-500'}>
                {Boolean(component.runtimeState.latchActive) ? 'HALTUNG EIN' : 'HALTUNG AUS'}
              </span>
            )}
          </div>

          <div
            className={`text-[10px] font-semibold px-2 py-1 rounded border text-center truncate ${
              hasFault
                ? 'bg-red-500/15 text-red-300 border-red-500/40'
                : manualStop
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : running
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
          >
            {statusText}
          </div>
        </div>
      );
    }

    // 12. 3/2-Wege-Magnetventil
    if (component instanceof SolenoidValve32Component) {
      const energized = Boolean(component.runtimeState.energized);
      const pathB = component.runtimeState.activePath === 'P->B';
      const flow = Number(component.runtimeState.activeFlowLph ?? 0);
      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <svg viewBox="0 0 80 42" className="w-20 h-10 shrink-0">
              <rect x="4" y="6" width="34" height="30" fill={!pathB ? '#0EA5E922' : '#0B111A'} stroke={!pathB ? '#38BDF8' : '#475569'} strokeWidth="1.5" />
              <rect x="38" y="6" width="34" height="30" fill={pathB ? '#0EA5E922' : '#0B111A'} stroke={pathB ? '#38BDF8' : '#475569'} strokeWidth="1.5" />
              <line x1="12" y1="32" x2="28" y2="10" stroke={!pathB ? '#38BDF8' : '#64748B'} strokeWidth="2" />
              <line x1="46" y1="10" x2="62" y2="32" stroke={pathB ? '#38BDF8' : '#64748B'} strokeWidth="2" />
            </svg>
            <div className="text-right">
              <div className={`font-mono text-xs font-bold ${pathB ? 'text-amber-400' : 'text-sky-300'}`}>
                {pathB ? 'P → B' : 'P → A'}
              </div>
              <div className="font-mono text-[10px] text-slate-400">{Math.round(flow)} L/h</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Spule A1: {energized ? '24V' : '0V'}</span>
            <span>{pathB ? 'Ausg. B' : 'Ausg. A'}</span>
          </div>
        </div>
      );
    }

    // 13. 2/2-Wege-Magnetventil
    if (component instanceof SolenoidValve22Component) {
      const energized = Boolean(component.runtimeState.energized);
      const isOpen = Boolean(component.runtimeState.isOpen);
      const normalState = String(component.params.normalState ?? 'NC');
      const flow = Number(component.runtimeState.activeFlowLph ?? 0);
      const cap = component.getFlowRateLimitLph();

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <svg viewBox="0 0 64 28" className="w-16 h-7">
              <polygon points="6,6 32,14 6,22" fill={isOpen ? '#0EA5E933' : '#1E293B'} stroke={isOpen ? '#38BDF8' : '#64748B'} strokeWidth="1.5" />
              <polygon points="58,6 32,14 58,22" fill={isOpen ? '#0EA5E933' : '#1E293B'} stroke={isOpen ? '#38BDF8' : '#64748B'} strokeWidth="1.5" />
              {!isOpen && <line x1="32" y1="4" x2="32" y2="24" stroke="#F59E0B" strokeWidth="2.2" />}
            </svg>
            <div className="text-right">
              <div className={`text-xs font-semibold ${isOpen ? 'text-sky-300' : 'text-slate-400'}`}>
                {isOpen ? 'OFFEN' : 'ZU'}
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                {Math.round(flow)}/{Math.round(cap)} L/h
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Typ: {normalState}</span>
            <span>A1: {energized ? '24V' : '0V'}</span>
          </div>
        </div>
      );
    }

    // 14. Verbraucher
    if (component instanceof DrainConsumerComponent) {
      const isOpen = component.isOpen();
      const actualFlow = Number(component.runtimeState.actualFlowLph ?? 0);
      const nominal = component.getDrainRateLph();
      const manual = Boolean(component.params.manualOverride);

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-sm font-bold text-slate-100">
                {Math.round(actualFlow)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </div>
              <div className="font-mono text-[10px] text-slate-400">Soll: {Math.round(nominal)} L/h</div>
            </div>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                component.params.manualOverride = !manual;
                onMutateComponent();
              }}
              className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                isOpen
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-slate-200'
              }`}
            >
              {manual ? 'TEST EIN' : isOpen ? 'AKTIV' : 'ZU'}
            </button>
          </div>
          <div className="text-[10px] text-slate-400">
            {actualFlow > 0 ? 'Verbrauch aktiv' : isOpen ? 'Kein Zufluss / Tank leer' : 'Wartet auf 24V'}
          </div>
        </div>
      );
    }

    // 15. Gulli / Ablauf
    if (component instanceof GullyDrainComponent) {
      const flow = Number(component.runtimeState.actualFlowLph ?? 0);
      const discarded = Number(component.runtimeState.totalDiscardedLiters ?? 0);
      const medium = String(component.runtimeState.lastMedium ?? 'water');
      const color =
        flow <= 0
          ? '#64748B'
          : medium === 'katholyte'
          ? '#10B981'
          : '#0EA5E9';

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 36 36" className="w-8 h-8 shrink-0">
              <rect x="4" y="18" width="28" height="12" rx="2" fill="#0B111A" stroke="#334155" strokeWidth="1.5" />
              <line x1="9" y1="22" x2="9" y2="27" stroke={color} strokeWidth="2" />
              <line x1="15" y1="22" x2="15" y2="27" stroke={color} strokeWidth="2" />
              <line x1="21" y1="22" x2="21" y2="27" stroke={color} strokeWidth="2" />
              <line x1="27" y1="22" x2="27" y2="27" stroke={color} strokeWidth="2" />
              <path
                d="M18 4 L18 14 M13 10 L18 15 L23 10"
                fill="none"
                stroke={color}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <div className="font-mono text-sm font-bold text-slate-100">
                {Math.round(flow)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                Verworfen: {discarded.toFixed(1)} L
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400">
            {flow > 0 ? 'Ablauf aktiv in Kanal' : 'Kein Zulauf'}
          </div>
        </div>
      );
    }

    // 16. Hauptleitung (Rohwasser)
    if (component instanceof MainWaterLineComponent) {
      const actual = Number(component.runtimeState.actualFlowLph ?? 0);
      const nom = component.getNominalFlowLph();
      const open = Boolean(component.params.manualOpen ?? true);
      const active = Boolean(component.runtimeState.flowing);

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className={`font-mono text-sm font-bold ${active ? 'text-sky-300' : 'text-slate-300'}`}>
                {Math.round(actual)} <span className="text-[10px] font-normal text-slate-400">L/h</span>
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                {(nom / 1000).toFixed(2)} m³/h Soll
              </div>
            </div>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                component.params.manualOpen = !open;
                onMutateComponent();
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                open
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-600'
              }`}
            >
              {open ? 'AUF' : 'ZU'}
            </button>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {active ? 'Rohwasser strömt' : open ? 'Leitung offen (0 Durchfluss)' : 'Absperrschieber ZU'}
          </div>
        </div>
      );
    }

    // 17. Kontakt-Wasserzähler
    if (component instanceof WaterMeterComponent) {
      const flow = Number(component.runtimeState.currentFlowLph ?? 0);
      const totalL = Number(component.runtimeState.totalVolumeLiters ?? 0);
      const totalPulses = Number(component.runtimeState.totalPulses ?? 0);
      const pulseOn = Boolean(component.runtimeState.pulseActive);
      const ma = Number(component.runtimeState.analogMa ?? 4);
      const lpp = Number(component.params.litersPerPulse ?? 10);

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[10.5px]">
          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1 font-mono">
            <span className="text-sky-300 font-bold">{Math.round(flow)} L/h</span>
            <span className="text-emerald-400">{ma.toFixed(1)} mA</span>
          </div>

          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-slate-300">{totalL.toFixed(1)} L ges.</span>
            <span className="text-slate-400">1 Imp / {lpp} L</span>
          </div>

          <div className="flex items-center justify-between bg-[#0B111A]/80 border border-[#1E2A3B] rounded px-2 py-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  pulseOn ? 'bg-red-400 shadow-[0_0_6px_#f87171]' : 'bg-slate-600'
                }`}
              />
              <span className="text-slate-400 text-[10px]">Kontakte</span>
            </div>
            <span className="font-mono text-slate-200 font-semibold">{totalPulses} Imp</span>
          </div>
        </div>
      );
    }

    // 18. Grundfos DDA Dosierpumpe
    if (component instanceof DosingPumpComponent) {
      const model = String(component.params.model ?? 'DDA 17-7');
      const mode = component.getOperatingMode();
      const maxFlow = component.getMaxFlowLph();
      const actual = Number(component.runtimeState.actualFlowLph ?? 0);
      const dosedL = Number(component.runtimeState.totalDosedLiters ?? 0);
      const manualStop = Boolean(component.params.manualStop);
      const dryFault = Boolean(component.runtimeState.dryFault);
      const status = String(component.runtimeState.status ?? 'standby');

      const modeLabel = mode === 'manual' ? 'Manuell' : mode === 'pulse' ? 'Impuls' : '4–20mA';

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[10.5px]">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[10px] font-bold text-indigo-300">
              {model} ({maxFlow} L/h)
            </span>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                component.params.manualStop = !manualStop;
                onMutateComponent();
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                manualStop
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {manualStop ? 'STOPP' : 'RUN'}
            </button>
          </div>

          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1 font-mono">
            <span className={actual > 0 ? 'text-sky-300 font-bold text-xs' : 'text-slate-400 text-xs'}>
              {actual.toFixed(2)} L/h
            </span>
            <span className="text-[10px] text-slate-400">{modeLabel}</span>
          </div>

          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
            <span>Dosiert: {dosedL.toFixed(2)} L</span>
            {mode === 'pulse' ? (
              <span>{Number(component.params.mlPerPulse ?? 2)} mL/Imp</span>
            ) : mode === 'analog' ? (
              <span>{Number(component.runtimeState.analogInMa ?? 4).toFixed(1)} mA</span>
            ) : (
              <span>Soll: {Number(component.params.manualFlowLph ?? 5).toFixed(1)} L/h</span>
            )}
          </div>

          <div
            className={`text-[9.5px] font-semibold px-2 py-0.5 rounded border text-center truncate ${
              dryFault
                ? 'bg-red-500/15 text-red-300 border-red-500/40'
                : status === 'dosing'
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
          >
            {dryFault
              ? 'STÖRUNG: TROCKENLAUF / KEIN MEDIUM'
              : status === 'dosing'
              ? 'DOSIERT AKTIV'
              : status === 'blocked'
              ? 'DRUCKSEITE BLOCKIERT'
              : manualStop
              ? 'MANUELL GESTOPPT'
              : 'BEREIT (STANDBY)'}
          </div>
        </div>
      );
    }

    // 19. T-Stück (Fluid)
    if (component instanceof FluidTeeComponent) {
      const teeMode = component.getTeeMode();
      const flow = Number(component.runtimeState.activeFlowLph ?? 0);

      return (
        <div className="px-2.5 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[10px]">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono font-bold text-slate-200">{Math.round(flow)} L/h</span>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                component.params.teeMode = teeMode === 'split' ? 'merge' : 'split';
                onMutateComponent();
              }}
              className="px-1.5 py-0.5 rounded bg-[#0B111A] border border-[#243247] text-sky-300 hover:border-sky-500 cursor-pointer"
              title="Zwischen Verteiler (1→2) und Sammler (2→1) umschalten"
            >
              {teeMode === 'split' ? '1 → 2' : '2 → 1'}
            </button>
          </div>
          <div className="text-[9.5px] text-slate-400 text-center">
            {teeMode === 'split' ? 'Verteiler-T' : 'Sammler-T'}
          </div>
        </div>
      );
    }

    // 20. Impfstelle
    if (component instanceof InjectionPointComponent) {
      const mainFlow = Number(component.runtimeState.mainFlowLph ?? 0);
      const dosingFlow = Number(component.runtimeState.dosingFlowLph ?? 0);
      const total = Number(component.runtimeState.totalFlowLph ?? 0);
      const ppm = Number(component.runtimeState.concentrationPpm ?? 0);

      return (
        <div className="px-3 py-2 flex flex-col justify-between h-[calc(100%-28px)] text-[10.5px]">
          <div className="flex items-center justify-between font-mono">
            <span className="text-slate-400">Haupt:</span>
            <span className="text-sky-300">{Math.round(mainFlow)} L/h</span>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span className="text-slate-400">Impfung:</span>
            <span className="text-emerald-300">{dosingFlow.toFixed(2)} L/h</span>
          </div>
          <div className="flex items-center justify-between bg-[#0B111A] border border-[#1E2A3B] rounded px-2 py-1 font-mono">
            <span className="text-slate-200 font-semibold">{Math.round(total)} L/h</span>
            <span className="text-amber-300 font-semibold">
              {ppm >= 1000 ? `${(ppm / 1000).toFixed(2)} L/m³` : `${ppm.toFixed(0)} mL/m³`}
            </span>
          </div>
        </div>
      );
    }

    return <div className="px-3 py-2 text-xs text-slate-400">Bauteil: {component.type}</div>;
  };

  return (
    <div
      style={{
        transform: `translate(${component.x}px, ${component.y}px)`,
        width: `${component.width}px`,
        height: `${component.height}px`,
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        onSelect(component.id);
        onStartDrag(e, component.id);
      }}
      onClick={(e) => e.stopPropagation()}
      className={`no-context-touch absolute top-0 left-0 rounded-lg bg-[#141E2E] border transition-shadow select-none cursor-move ${
        hasFault
          ? isSelected
            ? 'border-red-400 shadow-[0_0_0_2px_rgba(239,68,68,0.4)] z-20'
            : 'border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.25)] z-15'
          : isSelected
          ? 'border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.25)] z-20'
          : 'border-[#26364D] hover:border-[#3A5173] z-10'
      }`}
    >
      <div
        className={`h-7 px-2 border-b rounded-t-lg flex items-center justify-between gap-1.5 ${
          hasFault ? 'bg-red-950/60 border-red-500/40' : 'bg-[#19263A] border-[#243247]'
        }`}
      >
        <span className="text-[11px] font-semibold text-slate-100 truncate flex-1">
          {component.label}
        </span>

        {hasFault && (
          <span className="text-[9px] font-mono uppercase text-red-300 font-bold shrink-0">
            {faultText}
          </span>
        )}

        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={(e) => {
            e.stopPropagation();
            onOpenProperties(component.id);
          }}
          title="Eigenschaften öffnen"
          aria-label={`${component.label} Eigenschaften öffnen`}
          className="p-0.5 rounded text-slate-400 hover:text-sky-300 hover:bg-[#0B111A]/60 transition-colors cursor-pointer shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {renderBody()}

      {ports.map((port) => {
        const sig = component.portSignals.get(port.id);
        const isElecActive =
          port.domain === 'electrical' && sig && (sig as ElectricalSignal).energized;
        const isAnalogActive =
          port.domain === 'analog' && sig && (sig as AnalogSignal).active;
        const isFluidActive =
          port.domain === 'fluid' && sig && 'flowRateLph' in sig && sig.flowRateLph > 0;

        const isPendingOrigin =
          pendingWire?.componentId === component.id && pendingWire?.portId === port.id;
        const isCompatible = isPortCompatible(pendingWire, component.id, port);

        const isLeft = port.side === 'left';
        const isKatFluidPort =
          port.id === 'fluid_katholyte' ||
          (component instanceof TankComponent &&
            port.domain === 'fluid' &&
            component.getMedium() === 'katholyte');

        return (
          <div
            key={port.id}
            style={{
              left: `${port.offsetX}px`,
              top: `${port.offsetY}px`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-30 group"
          >
            <button
              type="button"
              title={`${port.label} — ${port.description ?? ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onPortClick(e, component.id, port);
              }}
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-transform cursor-crosshair ${
                isPendingOrigin
                  ? 'scale-125 border-amber-300 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
                  : isCompatible
                  ? 'scale-125 border-emerald-300 bg-emerald-500/80 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                  : port.domain === 'electrical'
                  ? isElecActive
                    ? 'border-red-300 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.85)]'
                    : 'border-slate-400 bg-[#0B111A] hover:border-red-400 hover:scale-110'
                  : port.domain === 'analog'
                  ? isAnalogActive
                    ? 'border-emerald-200 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]'
                    : 'border-emerald-500/70 bg-[#0B111A] hover:border-emerald-300 hover:scale-110'
                  : isKatFluidPort
                  ? isFluidActive
                    ? 'border-emerald-200 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]'
                    : 'border-emerald-500/70 bg-[#0B111A] hover:border-emerald-300 hover:scale-110'
                  : isFluidActive
                  ? 'border-sky-200 bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.85)]'
                  : 'border-sky-500/70 bg-[#0B111A] hover:border-sky-300 hover:scale-110'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/80 pointer-events-none" />
            </button>

            <span
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-[9px] font-mono font-semibold whitespace-nowrap px-1 rounded bg-[#0B111A]/85 ${
                isLeft ? 'left-3 text-slate-300' : 'right-3 text-slate-300'
              }`}
            >
              {port.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
