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
