import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

export class PowerSupply24V extends SimComponent {
  public readonly type = 'power_24v';
  public readonly category: ComponentCategory = 'electric';
  public readonly width = 160;
  public readonly height = 96;

  constructor(id: string, label = '24V DC Netzteil', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      enabled: true,
      voltage: 24,
    };
    this.runtimeState = {
      active: true,
      trippedShortCircuit: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'out_24v',
        label: '+24V',
        description: '24V DC Ausgangsklemme',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 56,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public evaluateElectrical(
    _inputs: Map<string, ElectricalSignal>,
    context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const enabled = Boolean(this.params.enabled ?? true);
    const voltage = Number(this.params.voltage ?? 24);
    const downstreamShort = Boolean(context.isSupplyShortCircuited?.(this.id));
    const powerFailed = this.fault === 'power_failure';
    const selfShort = this.fault === 'short_circuit';

    const tripped = downstreamShort || selfShort;
    const active = enabled && !powerFailed && !tripped;

    this.runtimeState.active = active;
    this.runtimeState.trippedShortCircuit = tripped;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set(
      'out_24v',
      active ? { domain: 'electrical', voltage, energized: true } : ZERO_VOLT
    );
    return outputs;
  }

  public togglePower(): void {
    this.params.enabled = !Boolean(this.params.enabled ?? true);
  }
}

export class PowerSupply230V extends SimComponent {
  public readonly type = 'power_230v';
  public readonly category: ComponentCategory = 'electric';
  public readonly width = 176;
  public readonly height = 104;

  constructor(id: string, label = 'Q1 230V AC (L/N/PE)', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      enabled: true,
      voltage: 230,
    };
    this.runtimeState = {
      active: true,
      trippedShortCircuit: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'out_230v',
        label: 'L (230V~)',
        description: '230V AC Phase L (Versorgung über L / N / PE)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 58,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public evaluateElectrical(
    _inputs: Map<string, ElectricalSignal>,
    context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const enabled = Boolean(this.params.enabled ?? true);
    const voltage = Number(this.params.voltage ?? 230);
    const downstreamShort = Boolean(context.isSupplyShortCircuited?.(this.id));
    const powerFailed = this.fault === 'power_failure';
    const selfShort = this.fault === 'short_circuit';

    const tripped = downstreamShort || selfShort;
    const active = enabled && !powerFailed && !tripped;

    this.runtimeState.active = active;
    this.runtimeState.trippedShortCircuit = tripped;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set(
      'out_230v',
      active ? { domain: 'electrical', voltage, energized: true } : ZERO_VOLT
    );
    return outputs;
  }

  public togglePower(): void {
    this.params.enabled = !Boolean(this.params.enabled ?? true);
  }
}

export type SwitchMode = 'toggle' | 'momentary_no' | 'momentary_nc';

export class SwitchComponent extends SimComponent {
  public readonly type = 'switch';
  public readonly category: ComponentCategory = 'electric';
  public readonly width = 164;
  public readonly height = 96;

  constructor(id: string, label = 'S1 Schalter', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      mode: 'toggle' as SwitchMode,
      pressed: false,
    };
    this.runtimeState = {
      isClosed: false,
      inputEnergized: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'in',
        label: '13',
        description: 'Eingangsklemme 13',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 56,
      },
      {
        id: 'out',
        label: '14',
        description: 'Ausgangsklemme 14',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 56,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public isContactClosed(): boolean {
    const mode = (this.params.mode as SwitchMode) || 'toggle';
    const pressed = Boolean(this.params.pressed);
    if (mode === 'momentary_nc') {
      return !pressed;
    }
    return pressed;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('in') ?? ZERO_VOLT;
    const closed = this.isContactClosed();

    this.runtimeState.inputEnergized = inSig.energized;
    this.runtimeState.isClosed = closed;

    const outputs = new Map<string, ElectricalSignal>();
    if (this.fault === 'short_circuit') {
      outputs.set('out', ZERO_VOLT);
      return outputs;
    }

    outputs.set('out', closed && inSig.energized ? { ...HIGH_24V, voltage: inSig.voltage } : ZERO_VOLT);
    return outputs;
  }

  public setPressed(pressed: boolean): void {
    this.params.pressed = pressed;
  }

  public toggle(): void {
    this.params.pressed = !Boolean(this.params.pressed);
  }
}

export class ChangeoverSwitchComponent extends SimComponent {
  public readonly type = 'changeover_switch';
  public readonly category: ComponentCategory = 'electric';
  public readonly width = 180;
  public readonly height = 114;

  constructor(id: string, label = 'S2 Wechselschalter', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      switched: false, // false => 11->12 (NC), true => 11->14 (NO)
    };
    this.runtimeState = {
      inputEnergized: false,
      switched: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'com',
        label: '11 (COM)',
        description: 'Eingang Gemeinsam (11)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 64,
      },
      {
        id: 'nc',
        label: '12 (NC)',
        description: 'Öffner-Ausgang 12 (Stellung I)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 44,
      },
      {
        id: 'no',
        label: '14 (NO)',
        description: 'Schließer-Ausgang 14 (Stellung II)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 86,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public isSwitched(): boolean {
    return Boolean(this.params.switched);
  }

  public toggle(): void {
    this.params.switched = !Boolean(this.params.switched);
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const comSig = inputs.get('com') ?? ZERO_VOLT;
    const switched = this.isSwitched();

    this.runtimeState.inputEnergized = comSig.energized;
    this.runtimeState.switched = switched;

    const outputs = new Map<string, ElectricalSignal>();
    if (this.fault === 'short_circuit') {
      outputs.set('nc', ZERO_VOLT);
      outputs.set('no', ZERO_VOLT);
      return outputs;
    }

    const activeSig = comSig.energized
      ? { ...HIGH_24V, voltage: comSig.voltage }
      : ZERO_VOLT;
    outputs.set('nc', !switched ? activeSig : ZERO_VOLT);
    outputs.set('no', switched ? activeSig : ZERO_VOLT);
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      inputEnergized: false,
      switched: Boolean(this.params.switched),
    };
  }
}

export type IndicatorColor = 'green' | 'red';

export class IndicatorLampComponent extends SimComponent {
  public readonly type: string;
  public readonly category: ComponentCategory = 'electric';
  public readonly width = 148;
  public readonly height = 104;

  constructor(
    id: string,
    label = 'H1 Leuchtmelder',
    x = 0,
    y = 0,
    color: IndicatorColor = 'green'
  ) {
    super(id, label, x, y);
    this.type = color === 'red' ? 'indicator_red' : 'indicator_green';
    this.params = {
      color,
    };
    this.runtimeState = {
      lit: false,
      voltage: 0,
    };
  }

  public getColor(): IndicatorColor {
    return this.params.color === 'red' || this.type === 'indicator_red' ? 'red' : 'green';
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'in',
        label: 'X1 (+24V)',
        description: 'Einschalteingang +24V DC (0V intern vorausgesetzt)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 58,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.lit ? 0.08 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('in') ?? ZERO_VOLT;
    const faulted = this.fault === 'power_failure' || this.fault === 'short_circuit';
    const lit = !faulted && inSig.energized;
    this.runtimeState.lit = lit;
    this.runtimeState.voltage = lit ? inSig.voltage : 0;
    return new Map();
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      lit: false,
      voltage: 0,
    };
  }
}

