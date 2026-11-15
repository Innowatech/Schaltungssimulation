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

export function convertToSeconds(value: number, unit: TimeUnit): number {
  const safe = Math.max(0.1, Number.isFinite(value) ? value : 1);
  if (unit === 'm') return safe * 60;
  if (unit === 'h') return safe * 3600;
  return safe;
}

export class TimerRelayComponent extends SimComponent {
  public readonly type = 'timer_relay';
  public readonly category: ComponentCategory = 'relay';
  public readonly width = 196;
  public readonly height = 148;

  constructor(id: string, label = 'K1 Zeitrelais', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      mode: 'on_delay' as TimerMode,
      durationValue: 5,
      durationUnit: 's' as TimeUnit,
    };
    this.runtimeState = {
      coilEnergized: false,
      contactSwitched: false,
      elapsedSeconds: 0,
      targetSeconds: 5,
      pulsePhaseOn: false,
      wasCoilEnergized: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1',
        description: 'Steuerspule A1 (+24V)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 48,
      },
      {
        id: 'com_15',
        label: '15',
        description: 'Wechsler Gemeinsam (COM)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 108,
      },
      {
        id: 'nc_16',
        label: '16',
        description: 'Öffner (NC, Ruhezustand 15-16)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 82,
      },
      {
        id: 'no_18',
        label: '18',
        description: 'Schließer (NO, geschaltet 15-18)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 120,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.coilEnergized ? 0.25 : 0;
  }

  public getTargetSeconds(): number {
    return convertToSeconds(
      Number(this.params.durationValue ?? 5),
      (this.params.durationUnit as TimeUnit) || 's'
    );
  }

  public stepTime(
    inputs: Map<string, ElectricalSignal>,
    dtSimSeconds: number,
    _context: SimulationContext
  ): void {
    const coilIn = inputs.get('a1') ?? ZERO_VOLT;
    const energized = coilIn.energized && this.fault !== 'short_circuit';
    const mode = (this.params.mode as TimerMode) || 'on_delay';
    const target = this.getTargetSeconds();

    this.runtimeState.targetSeconds = target;
    this.runtimeState.coilEnergized = energized;

    let elapsed = Number(this.runtimeState.elapsedSeconds ?? 0);
    let switched = Boolean(this.runtimeState.contactSwitched ?? false);
    const wasEnergized = Boolean(this.runtimeState.wasCoilEnergized ?? false);

    if (mode === 'on_delay') {
      if (energized) {
        elapsed = Math.min(target, elapsed + dtSimSeconds);
        switched = elapsed >= target;
      } else {
        elapsed = 0;
        switched = false;
      }
    } else if (mode === 'off_delay') {
      if (energized) {
        elapsed = 0;
        switched = true;
      } else if (switched) {
        elapsed = Math.min(target, elapsed + dtSimSeconds);
        if (elapsed >= target) {
          switched = false;
          elapsed = 0;
        }
      } else {
        elapsed = 0;
      }
    } else if (mode === 'pulse') {
      if (energized) {
        if (!wasEnergized) {
          elapsed = 0;
          this.runtimeState.pulsePhaseOn = true;
        }
        elapsed += dtSimSeconds;
        while (elapsed >= target && target > 0) {
          elapsed -= target;
          this.runtimeState.pulsePhaseOn = !Boolean(this.runtimeState.pulsePhaseOn);
        }
        switched = Boolean(this.runtimeState.pulsePhaseOn);
      } else {
        elapsed = 0;
        switched = false;
        this.runtimeState.pulsePhaseOn = false;
      }
    }

    this.runtimeState.wasCoilEnergized = energized;
    this.runtimeState.elapsedSeconds = elapsed;
    this.runtimeState.contactSwitched = switched;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const comSig = inputs.get('com_15') ?? ZERO_VOLT;
    const coilIn = inputs.get('a1') ?? ZERO_VOLT;
    this.runtimeState.coilEnergized = coilIn.energized && this.fault !== 'short_circuit';

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
      contactSwitched: false,
      elapsedSeconds: 0,
      targetSeconds: this.getTargetSeconds(),
      pulsePhaseOn: false,
      wasCoilEnergized: false,
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
