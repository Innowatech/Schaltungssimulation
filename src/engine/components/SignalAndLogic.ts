import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  AnalogSignal,
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

/**
 * Stromwandler: Misst die nachgeschaltete Stromstärke (Ampere) auf einer 24V-Leitung
 * und gibt ein proportionales Analogsignal (4–20 mA oder 0–10 V) aus.
 */
export class CurrentTransformerComponent extends SimComponent {
  public readonly type = 'current_transformer';
  public readonly category: ComponentCategory = 'logic';
  public readonly width = 196;
  public readonly height = 140;

  constructor(id: string, label = 'T1 Stromwandler', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      maxCurrentAmps: 10,
      outputType: '4_20mA' as '4_20mA' | '0_10V',
    };
    this.runtimeState = {
      measuredAmps: 0,
      analogValue: 4,
      analogUnit: 'mA' as 'mA' | 'V',
      inputEnergized: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'in',
        label: 'L+ IN',
        description: 'Stromeingang 24V DC (Messschleife)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 66,
      },
      {
        id: 'out',
        label: 'L+ OUT',
        description: 'Stromausgang 24V DC (zu Verbrauchern)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 54,
      },
      {
        id: 'analog_out',
        label: 'I-MESS',
        description: 'Analoger Messausgang (4–20mA / 0–10V)',
        domain: 'analog',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 102,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('in') ?? ZERO_VOLT;
    const energized = inSig.energized && this.fault !== 'short_circuit';
    this.runtimeState.inputEnergized = energized;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('out', energized ? { ...HIGH_24V, voltage: inSig.voltage } : ZERO_VOLT);
    return outputs;
  }

  public evaluateAnalog(
    _analogInputs: Map<string, AnalogSignal>,
    electricalInputs: Map<string, ElectricalSignal>,
    context: SimulationContext
  ): Map<string, AnalogSignal> {
    const inSig = electricalInputs.get('in') ?? ZERO_VOLT;
    const energized = inSig.energized && this.fault !== 'short_circuit';
    const maxAmps = Math.max(0.5, Number(this.params.maxCurrentAmps ?? 10));
    const outputType = (this.params.outputType as '4_20mA' | '0_10V') || '4_20mA';

    const downstreamAmps = energized
      ? context.getDownstreamLoadAmps?.(this.id, 'out') ?? 0
      : 0;

    const ratio = Math.max(0, Math.min(1.15, downstreamAmps / maxAmps));
    const unit: 'mA' | 'V' = outputType === '4_20mA' ? 'mA' : 'V';
    const value =
      unit === 'mA'
        ? Math.round((4 + ratio * 16) * 100) / 100
        : Math.round((ratio * 10) * 100) / 100;

    this.runtimeState.measuredAmps = Math.round(downstreamAmps * 100) / 100;
    this.runtimeState.analogValue = value;
    this.runtimeState.analogUnit = unit;

    const outputs = new Map<string, AnalogSignal>();
    outputs.set('analog_out', {
      domain: 'analog',
      value,
      unit,
      active: energized && downstreamAmps > 0.01,
    });
    return outputs;
  }

  public reset(): void {
    super.reset();
    const outputType = (this.params.outputType as '4_20mA' | '0_10V') || '4_20mA';
    this.runtimeState = {
      measuredAmps: 0,
      analogValue: outputType === '4_20mA' ? 4 : 0,
      analogUnit: outputType === '4_20mA' ? 'mA' : 'V',
      inputEnergized: false,
    };
  }
}

export type TransmitterMode = 'v10_to_ma' | 'v24_to_ma' | 'ma_to_v10';

/**
 * Messumformer: Wandelt analoge/elektrische Signale um (z. B. 0–10V in 4–20mA,
 * 0–24V in 4–20mA oder 4–20mA in 0–10V) und stellt einen einstellbaren 24V-Grenzwertausgang bereit.
 */
export class SignalTransmitterComponent extends SimComponent {
  public readonly type = 'signal_transmitter';
  public readonly category: ComponentCategory = 'logic';
  public readonly width = 204;
  public readonly height = 160;

  constructor(id: string, label = 'U1 Messumformer', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      conversionMode: 'v10_to_ma' as TransmitterMode,
      manualTestInput: 5.0,
      thresholdPct: 50,
    };
    this.runtimeState = {
      inputValue: 0,
      inputUnit: 'V' as 'V' | 'mA',
      outputValue: 4,
      outputUnit: 'mA' as 'V' | 'mA',
      normalizedPct: 0,
      thresholdTriggered: false,
      hasExternalSignal: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'elec_in',
        label: 'U-IN',
        description: 'Elektrischer Signaleingang (0–24V DC)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 56,
      },
      {
        id: 'analog_in',
        label: 'A-IN',
        description: 'Analoger Signaleingang (0–10V / 4–20mA)',
        domain: 'analog',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 112,
      },
      {
        id: 'analog_out',
        label: 'OUT',
        description: 'Umgeformter Analogausgang',
        domain: 'analog',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 66,
      },
      {
        id: 'thresh_out',
        label: 'Q 24V',
        description: 'Grenzwert-Schaltausgang (+24V ab Schwelle)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 118,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  private computeConversion(
    analogIn: AnalogSignal | undefined,
    elecIn: ElectricalSignal | undefined
  ) {
    const mode = (this.params.conversionMode as TransmitterMode) || 'v10_to_ma';
    const hasAnalog = Boolean(analogIn && (analogIn.active || analogIn.value > 0));
    const hasElec = Boolean(elecIn && elecIn.energized);

    let norm = 0;
    let inVal = 0;
    let inUnit: 'V' | 'mA' = 'V';
    let external = false;

    if (mode === 'v10_to_ma') {
      inUnit = 'V';
      if (hasAnalog && analogIn?.unit === 'V') {
        inVal = analogIn.value;
        external = true;
      } else if (hasElec) {
        inVal = Math.min(10, elecIn!.voltage);
        external = true;
      } else {
        inVal = Math.max(0, Math.min(10, Number(this.params.manualTestInput ?? 0)));
      }
      norm = Math.max(0, Math.min(1, inVal / 10));
      const outMa = Math.round((4 + norm * 16) * 100) / 100;
      return {
        inVal,
        inUnit,
        outVal: outMa,
        outUnit: 'mA' as const,
        normPct: Math.round(norm * 100),
        external,
      };
    }

    if (mode === 'v24_to_ma') {
      inUnit = 'V';
      if (hasElec || elecIn) {
        inVal = elecIn?.voltage ?? 0;
        external = hasElec;
      } else {
        inVal = Math.max(0, Math.min(24, Number(this.params.manualTestInput ?? 0)));
      }
      norm = Math.max(0, Math.min(1, inVal / 24));
      const outMa = Math.round((4 + norm * 16) * 100) / 100;
      return {
        inVal,
        inUnit,
        outVal: outMa,
        outUnit: 'mA' as const,
        normPct: Math.round(norm * 100),
        external,
      };
    }

    // ma_to_v10: 4–20mA -> 0–10V
    inUnit = 'mA';
    if (analogIn && analogIn.unit === 'mA') {
      inVal = analogIn.value;
      external = true;
    } else {
      inVal = Math.max(4, Math.min(20, Number(this.params.manualTestInput ?? 4)));
    }
    norm = Math.max(0, Math.min(1, (inVal - 4) / 16));
    const outV = Math.round(norm * 10 * 100) / 100;
    return {
      inVal,
      inUnit,
      outVal: outV,
      outUnit: 'V' as const,
      normPct: Math.round(norm * 100),
      external,
    };
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext,
    analogInputs?: Map<string, AnalogSignal>
  ): Map<string, ElectricalSignal> {
    const elecIn = inputs.get('elec_in');
    const analogIn = analogInputs?.get('analog_in');
    const res = this.computeConversion(analogIn, elecIn);
    const threshold = Number(this.params.thresholdPct ?? 50);
    const triggered = res.normPct >= threshold && this.fault !== 'short_circuit';

    this.runtimeState.inputValue = res.inVal;
    this.runtimeState.inputUnit = res.inUnit;
    this.runtimeState.outputValue = res.outVal;
    this.runtimeState.outputUnit = res.outUnit;
    this.runtimeState.normalizedPct = res.normPct;
    this.runtimeState.thresholdTriggered = triggered;
    this.runtimeState.hasExternalSignal = res.external;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('thresh_out', triggered ? HIGH_24V : ZERO_VOLT);
    return outputs;
  }

  public evaluateAnalog(
    analogInputs: Map<string, AnalogSignal>,
    electricalInputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, AnalogSignal> {
    const res = this.computeConversion(
      analogInputs.get('analog_in'),
      electricalInputs.get('elec_in')
    );
    const active = res.normPct > 0 && this.fault !== 'short_circuit';

    this.runtimeState.inputValue = res.inVal;
    this.runtimeState.inputUnit = res.inUnit;
    this.runtimeState.outputValue = res.outVal;
    this.runtimeState.outputUnit = res.outUnit;
    this.runtimeState.normalizedPct = res.normPct;
    this.runtimeState.hasExternalSignal = res.external;

    const outputs = new Map<string, AnalogSignal>();
    outputs.set('analog_out', {
      domain: 'analog',
      value: this.fault === 'short_circuit' ? 0 : res.outVal,
      unit: res.outUnit,
      active,
    });
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState.thresholdTriggered = false;
  }
}

export type LogicGateKind = 'AND' | 'OR' | 'NOT';

/**
 * Logikgatter (AND, OR, NOT) für 24V-Steuersignale.
 */
export class LogicGateComponent extends SimComponent {
  public readonly type: string;
  public readonly gateKind: LogicGateKind;
  public readonly category: ComponentCategory = 'logic';
  public readonly width = 166;
  public readonly height = 112;

  constructor(
    id: string,
    gateKind: LogicGateKind,
    label?: string,
    x = 0,
    y = 0
  ) {
    super(id, label ?? `D1 ${gateKind}-Gatter`, x, y);
    this.gateKind = gateKind;
    this.type =
      gateKind === 'AND' ? 'logic_and' : gateKind === 'OR' ? 'logic_or' : 'logic_not';
    this.params = {
      gateKind,
    };
    this.runtimeState = {
      in1: false,
      in2: false,
      out: false,
    };
  }

  public getPorts(): PortDefinition[] {
    if (this.gateKind === 'NOT') {
      return [
        {
          id: 'i1',
          label: 'I1',
          description: 'Logikeingang I1',
          domain: 'electrical',
          direction: 'input',
          side: 'left',
          offsetX: 0,
          offsetY: 66,
        },
        {
          id: 'q',
          label: 'Q',
          description: 'Invertierter Ausgang Q (NOT I1)',
          domain: 'electrical',
          direction: 'output',
          side: 'right',
          offsetX: this.width,
          offsetY: 66,
        },
      ];
    }

    return [
      {
        id: 'i1',
        label: 'I1',
        description: 'Logikeingang I1',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 50,
      },
      {
        id: 'i2',
        label: 'I2',
        description: 'Logikeingang I2',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 88,
      },
      {
        id: 'q',
        label: 'Q',
        description: `Logikausgang Q (${this.gateKind})`,
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 69,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const i1 = (inputs.get('i1') ?? ZERO_VOLT).energized;
    const i2 = (inputs.get('i2') ?? ZERO_VOLT).energized;

    let result = false;
    if (this.fault !== 'short_circuit') {
      if (this.gateKind === 'AND') result = i1 && i2;
      else if (this.gateKind === 'OR') result = i1 || i2;
      else result = !i1;
    }

    this.runtimeState.in1 = i1;
    this.runtimeState.in2 = i2;
    this.runtimeState.out = result;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('q', result ? HIGH_24V : ZERO_VOLT);
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      in1: false,
      in2: false,
      out: this.gateKind === 'NOT',
    };
  }
}
