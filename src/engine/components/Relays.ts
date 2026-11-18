import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

export type TimerMode = 'on_delay' | 'off_delay' | 'pulse';
export type TimeUnit = 's' | 'm' | 'h';

export type TeleTimerFunction = 'E' | 'R' | 'Ws' | 'Wa' | 'Es' | 'Wu' | 'Bp';
export type TeleTimeRange = '1s' | '10s' | '1min' | '10min' | '1h' | '10h' | '100h';

export interface TeleFunctionInfo {
  code: TeleTimerFunction;
  name: string;
  description: string;
  usesB1: boolean;
}

export const TELE_FUNCTIONS: TeleFunctionInfo[] = [
  {
    code: 'E',
    name: 'E — Einschaltverzögert',
    description: 'Mit Anlegen von U (A1) läuft t ab; danach zieht R (15→18) an.',
    usesB1: false,
  },
  {
    code: 'R',
    name: 'R — Rückfallverzögert (mit B1)',
    description: 'U liegt an A1. B1 schließt → R zieht an. B1 öffnet → R fällt nach t ab.',
    usesB1: true,
  },
  {
    code: 'Ws',
    name: 'Ws — Einschaltwischend (mit B1)',
    description: 'U liegt an A1. B1 schließt → R zieht sofort für Dauer t an.',
    usesB1: true,
  },
  {
    code: 'Wa',
    name: 'Wa — Ausschaltwischend (mit B1)',
    description: 'U liegt an A1. B1 öffnet → R zieht sofort für Dauer t an.',
    usesB1: true,
  },
  {
    code: 'Es',
    name: 'Es — Einschaltverzögert (mit B1)',
    description: 'U liegt an A1. B1 schließt → t läuft ab → R zieht an bis B1 öffnet.',
    usesB1: true,
  },
  {
    code: 'Wu',
    name: 'Wu — Einschaltwischend (Spannung)',
    description: 'Mit Anlegen von U (A1) zieht R sofort für Dauer t an und fällt dann ab.',
    usesB1: false,
  },
  {
    code: 'Bp',
    name: 'Bp — Blinker pausebeginnend',
    description: 'Mit Anlegen von U (A1) startet Pause t, danach Takt 1:1 mit Periodendauer t.',
    usesB1: false,
  },
];

export interface TeleRangeInfo {
  id: TeleTimeRange;
  label: string;
  minLabel: string;
  maxLabel: string;
  maxSeconds: number;
}

export const TELE_TIME_RANGES: TeleRangeInfo[] = [
  { id: '1s', label: '1 s', minLabel: '50 ms', maxLabel: '1 s', maxSeconds: 1 },
  { id: '10s', label: '10 s', minLabel: '500 ms', maxLabel: '10 s', maxSeconds: 10 },
  { id: '1min', label: '1 min', minLabel: '3 s', maxLabel: '1 min', maxSeconds: 60 },
  { id: '10min', label: '10 min', minLabel: '30 s', maxLabel: '10 min', maxSeconds: 600 },
  { id: '1h', label: '1 h', minLabel: '3 min', maxLabel: '1 h', maxSeconds: 3600 },
  { id: '10h', label: '10 h', minLabel: '30 min', maxLabel: '10 h', maxSeconds: 36000 },
  { id: '100h', label: '100 h', minLabel: '5 h', maxLabel: '100 h', maxSeconds: 360000 },
];

export function convertToSeconds(value: number, unit: TimeUnit): number {
  const safe = Math.max(0.05, Number.isFinite(value) ? value : 1);
  if (unit === 'm') return safe * 60;
  if (unit === 'h') return safe * 3600;
  return safe;
}

export function formatTeleDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${Number(seconds.toFixed(1))} s`;
  if (seconds < 3600) {
    const mins = seconds / 60;
    return `${Number(mins.toFixed(1))} min`;
  }
  const hrs = seconds / 3600;
  return `${Number(hrs.toFixed(1))} h`;
}

export function legacyDurationToTele(
  value: number,
  unit: TimeUnit
): { teleRange: TeleTimeRange; teleScalePct: number } {
  const sec = convertToSeconds(value, unit);
  for (const r of TELE_TIME_RANGES) {
    if (sec <= r.maxSeconds) {
      const pct = Math.max(5, Math.min(100, Math.round((sec / r.maxSeconds) * 100)));
      return { teleRange: r.id, teleScalePct: pct };
    }
  }
  return { teleRange: '100h', teleScalePct: 100 };
}

export class TimerRelayComponent extends SimComponent {
  public readonly type = 'timer_relay';
  public readonly category: ComponentCategory = 'relay';
  public readonly width = 208;
  public readonly height = 172;

  constructor(id: string, label = 'K1 Zeitrelais E1ZM10', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      teleFunction: 'E' as TeleTimerFunction,
      teleRange: '10s' as TeleTimeRange,
      teleScalePct: 50, // 5..100 % => 5s
    };
    this.runtimeState = {
      coilEnergized: false,
      b1Energized: false,
      contactSwitched: false,
      elapsedSeconds: 0,
      targetSeconds: 5,
      pulsePhaseOn: false,
      wasCoilEnergized: false,
      wasB1Energized: false,
      isTiming: false,
      ledUt: 'off' as 'off' | 'on' | 'blink',
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1 (+)',
        description: 'Versorgungsspannung U an Klemme A1 (+24V DC)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 44,
      },
      {
        id: 'b1',
        label: 'B1 (S)',
        description: 'Steuerkontakt S an Klemme B1 (für R, Ws, Wa, Es)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 88,
      },
      {
        id: 'com_15',
        label: '15',
        description: 'Wechsler Gemeinsam (COM)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 136,
      },
      {
        id: 'nc_16',
        label: '16',
        description: 'Öffner (NC, Ruhezustand 15–16)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 96,
      },
      {
        id: 'no_18',
        label: '18',
        description: 'Schließer (NO, angezogen 15–18)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 140,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.coilEnergized ? 0.15 : 0;
  }

  public getTeleFunction(): TeleTimerFunction {
    const raw = this.params.teleFunction as TeleTimerFunction | undefined;
    if (raw && TELE_FUNCTIONS.some((f) => f.code === raw)) return raw;
    // Abwärtskompatibilität zu Legacy-Schaltplänen (v1.0–v1.7)
    const legacyMode = this.params.mode as TimerMode | undefined;
    if (legacyMode === 'off_delay') return 'Wu';
    if (legacyMode === 'pulse') return 'Bp';
    return 'E';
  }

  public getTeleRange(): TeleTimeRange {
    const raw = this.params.teleRange as TeleTimeRange | undefined;
    if (raw && TELE_TIME_RANGES.some((r) => r.id === raw)) return raw;
    if (this.params.durationValue !== undefined) {
      return legacyDurationToTele(
        Number(this.params.durationValue ?? 5),
        (this.params.durationUnit as TimeUnit) || 's'
      ).teleRange;
    }
    return '10s';
  }

  public getTeleScalePct(): number {
    if (this.params.teleScalePct !== undefined) {
      const pct = Number(this.params.teleScalePct);
      return Math.max(5, Math.min(100, Number.isFinite(pct) ? pct : 50));
    }
    if (this.params.durationValue !== undefined) {
      return legacyDurationToTele(
        Number(this.params.durationValue ?? 5),
        (this.params.durationUnit as TimeUnit) || 's'
      ).teleScalePct;
    }
    return 50;
  }

  public getTargetSeconds(): number {
    const rangeId = this.getTeleRange();
    const scalePct = this.getTeleScalePct();
    const info = TELE_TIME_RANGES.find((r) => r.id === rangeId) ?? TELE_TIME_RANGES[1];
    return Math.max(0.05, (scalePct / 100) * info.maxSeconds);
  }

  public stepTime(
    inputs: Map<string, ElectricalSignal>,
    dtSimSeconds: number,
    _context: SimulationContext
  ): void {
    const uIn = inputs.get('a1') ?? ZERO_VOLT;
    const b1In = inputs.get('b1') ?? ZERO_VOLT;
    const uOn = uIn.energized && this.fault !== 'short_circuit';
    const b1On = uOn && b1In.energized;

    const fn = this.getTeleFunction();
    const target = this.getTargetSeconds();

    this.runtimeState.targetSeconds = target;
    this.runtimeState.coilEnergized = uOn;
    this.runtimeState.b1Energized = b1On;

    let elapsed = Number(this.runtimeState.elapsedSeconds ?? 0);
    let switched = Boolean(this.runtimeState.contactSwitched ?? false);
    let isTiming = Boolean(this.runtimeState.isTiming ?? false);
    const wasU = Boolean(this.runtimeState.wasCoilEnergized ?? false);
    const wasB1 = Boolean(this.runtimeState.wasB1Energized ?? false);

    if (!uOn) {
      // Ohne Versorgungsspannung fällt E1ZM10 sofort zurück
      elapsed = 0;
      switched = false;
      isTiming = false;
      this.runtimeState.pulsePhaseOn = false;
    } else {
      switch (fn) {
        case 'E': {
          // Einschaltverzögert über U (A1)
          if (!switched) {
            isTiming = true;
            elapsed = Math.min(target, elapsed + dtSimSeconds);
            if (elapsed >= target) {
              switched = true;
              isTiming = false;
            }
          } else {
            isTiming = false;
          }
          break;
        }

        case 'R': {
          // Rückfallverzögert mit Steuerkontakt B1
          if (b1On) {
            switched = true;
            isTiming = false;
            elapsed = 0;
          } else {
            if (wasB1 && switched) {
              isTiming = true;
              elapsed = 0;
            }
            if (isTiming) {
              elapsed = Math.min(target, elapsed + dtSimSeconds);
              if (elapsed >= target) {
                switched = false;
                isTiming = false;
                elapsed = 0;
              }
            }
          }
          break;
        }

        case 'Ws': {
          // Einschaltwischend mit Steuerkontakt B1 (nicht nachtriggerbar während t)
          if (!isTiming && b1On && !wasB1) {
            switched = true;
            isTiming = true;
            elapsed = 0;
          }
          if (isTiming) {
            elapsed += dtSimSeconds;
            if (elapsed >= target) {
              switched = false;
              isTiming = false;
              elapsed = 0;
            }
          }
          break;
        }

        case 'Wa': {
          // Ausschaltwischend mit Steuerkontakt B1 (nicht nachtriggerbar während t)
          if (!isTiming && !b1On && wasB1) {
            switched = true;
            isTiming = true;
            elapsed = 0;
          }
          if (isTiming) {
            elapsed += dtSimSeconds;
            if (elapsed >= target) {
              switched = false;
              isTiming = false;
              elapsed = 0;
            }
          }
          break;
        }

        case 'Es': {
          // Einschaltverzögert mit Steuerkontakt B1
          if (b1On) {
            if (!switched) {
              isTiming = true;
              elapsed = Math.min(target, elapsed + dtSimSeconds);
              if (elapsed >= target) {
                switched = true;
                isTiming = false;
              }
            } else {
              isTiming = false;
            }
          } else {
            switched = false;
            isTiming = false;
            elapsed = 0;
          }
          break;
        }

        case 'Wu': {
          // Einschaltwischend spannungsgesteuert über U (A1)
          if (!wasU) {
            switched = true;
            isTiming = true;
            elapsed = 0;
          }
          if (isTiming) {
            elapsed += dtSimSeconds;
            if (elapsed >= target) {
              switched = false;
              isTiming = false;
              elapsed = target;
            }
          }
          break;
        }

        case 'Bp': {
          // Blinker pausebeginnend 1:1 (O(1) auch bei großen Zeitsprüngen)
          if (!wasU) {
            elapsed = 0;
            this.runtimeState.pulsePhaseOn = false;
          }
          isTiming = true;
          elapsed += dtSimSeconds;
          if (elapsed >= target && target > 0) {
            const flips = Math.floor(elapsed / target);
            elapsed -= flips * target;
            if (flips % 2 === 1) {
              this.runtimeState.pulsePhaseOn = !Boolean(this.runtimeState.pulsePhaseOn);
            }
          }
          switched = Boolean(this.runtimeState.pulsePhaseOn);
          break;
        }
      }
    }

    this.runtimeState.wasCoilEnergized = uOn;
    this.runtimeState.wasB1Energized = b1On;
    this.runtimeState.elapsedSeconds = elapsed;
    this.runtimeState.contactSwitched = switched;
    this.runtimeState.isTiming = isTiming;
    this.runtimeState.ledUt = !uOn ? 'off' : isTiming ? 'blink' : 'on';
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const comSig = inputs.get('com_15') ?? ZERO_VOLT;
    const uIn = inputs.get('a1') ?? ZERO_VOLT;
    const b1In = inputs.get('b1') ?? ZERO_VOLT;
    const uOn = uIn.energized && this.fault !== 'short_circuit';
    this.runtimeState.coilEnergized = uOn;
    this.runtimeState.b1Energized = uOn && b1In.energized;
    if (!uOn) {
      this.runtimeState.ledUt = 'off';
    } else if (this.runtimeState.ledUt === 'off') {
      this.runtimeState.ledUt = Boolean(this.runtimeState.isTiming) ? 'blink' : 'on';
    }

    const switched = Boolean(this.runtimeState.contactSwitched ?? false);
    const activeCom = comSig.energized ? { ...HIGH_24V, voltage: comSig.voltage } : ZERO_VOLT;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('nc_16', !switched ? activeCom : ZERO_VOLT);
    outputs.set('no_18', switched ? activeCom : ZERO_VOLT);
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      coilEnergized: false,
      b1Energized: false,
      contactSwitched: false,
      elapsedSeconds: 0,
      targetSeconds: this.getTargetSeconds(),
      pulsePhaseOn: false,
      wasCoilEnergized: false,
      wasB1Energized: false,
      isTiming: false,
      ledUt: 'off',
    };
  }
}

export class ContactorRelayComponent extends SimComponent {
  public readonly type = 'contactor_relay';
  public readonly category: ComponentCategory = 'relay';
  public readonly width = 200;
  public readonly height = 168;

  constructor(id: string, label = 'K2 Hilfsrelais', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {};
    this.runtimeState = {
      coilEnergized: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1',
        description: 'Relaisspule A1 (+24V)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 46,
      },
      {
        id: 'com_11',
        label: '11',
        description: 'Wechsler 1 Gemeinsam (COM)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 96,
      },
      {
        id: 'nc_12',
        label: '12',
        description: 'Wechsler 1 Öffner (NC)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 78,
      },
      {
        id: 'no_14',
        label: '14',
        description: 'Wechsler 1 Schließer (NO)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 106,
      },
      {
        id: 'com_21',
        label: '21',
        description: 'Wechsler 2 Gemeinsam (COM)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 140,
      },
      {
        id: 'nc_22',
        label: '22',
        description: 'Wechsler 2 Öffner (NC)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 132,
      },
      {
        id: 'no_24',
        label: '24',
        description: 'Wechsler 2 Schließer (NO)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 156,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.coilEnergized ? 0.35 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const coilIn = inputs.get('a1') ?? ZERO_VOLT;
    const energized = coilIn.energized && this.fault !== 'short_circuit';
    this.runtimeState.coilEnergized = energized;

    const com1 = inputs.get('com_11') ?? ZERO_VOLT;
    const com2 = inputs.get('com_21') ?? ZERO_VOLT;

    const sig1 = com1.energized ? { ...HIGH_24V, voltage: com1.voltage } : ZERO_VOLT;
    const sig2 = com2.energized ? { ...HIGH_24V, voltage: com2.voltage } : ZERO_VOLT;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('nc_12', !energized ? sig1 : ZERO_VOLT);
    outputs.set('no_14', energized ? sig1 : ZERO_VOLT);
    outputs.set('nc_22', !energized ? sig2 : ZERO_VOLT);
    outputs.set('no_24', energized ? sig2 : ZERO_VOLT);
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      coilEnergized: false,
    };
  }
}
