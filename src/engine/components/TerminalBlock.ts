import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

export class TerminalBlockComponent extends SimComponent {
  public readonly type = 'terminal_block';
  public readonly category: ComponentCategory = 'electric';
  public readonly width = 210;
  public readonly height = 180;

  constructor(id: string, label = 'X1 Klemmblock', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      outputCount: 10, // 5, 10, 15, 20
    };
    this.runtimeState = {
      inputEnergized: false,
      voltage: 0,
    };
  }

  public getOutputCount(): number {
    const val = Number(this.params.outputCount ?? 10);
    return [5, 10, 15, 20].includes(val) ? val : 10;
  }

  public getPorts(): PortDefinition[] {
    const count = this.getOutputCount();
    const ports: PortDefinition[] = [
      {
        id: 'in_24v',
        label: '+24V IN',
        description: 'Eingang von Spannungsversorgung',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: Math.round(this.height / 2),
      },
    ];

    // Verteile die Ausgänge um den Klemmblock herum (Igel-Layout: oben, rechts, unten)
    const perSide = Math.ceil(count / 3);
    let added = 0;

    // Oben
    for (let i = 0; i < perSide && added < count; i++) {
      const xRatio = (i + 1) / (perSide + 1);
      ports.push({
        id: `out_${added + 1}`,
        label: `${added + 1}`,
        description: `24V Ausgangsklemme ${added + 1}`,
        domain: 'electrical',
        direction: 'output',
        side: 'top',
        offsetX: Math.round(this.width * xRatio),
        offsetY: 0,
      });
      added++;
    }

    // Rechts
    for (let i = 0; i < perSide && added < count; i++) {
      const yRatio = (i + 1) / (perSide + 1);
      ports.push({
        id: `out_${added + 1}`,
        label: `${added + 1}`,
        description: `24V Ausgangsklemme ${added + 1}`,
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: Math.round(this.height * yRatio),
      });
      added++;
    }

    // Unten
    for (let i = 0; i < perSide && added < count; i++) {
      const xRatio = (i + 1) / (perSide + 1);
      ports.push({
        id: `out_${added + 1}`,
        label: `${added + 1}`,
        description: `24V Ausgangsklemme ${added + 1}`,
        domain: 'electrical',
        direction: 'output',
        side: 'bottom',
        offsetX: Math.round(this.width * xRatio),
        offsetY: this.height,
      });
      added++;
    }

    return ports;
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    return this.fault === 'short_circuit' ? 25.0 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('in_24v') ?? ZERO_VOLT;
    const energized = inSig.energized && this.fault !== 'short_circuit';

    this.runtimeState.inputEnergized = energized;
    this.runtimeState.voltage = energized ? inSig.voltage : 0;

    const outputs = new Map<string, ElectricalSignal>();
    const count = this.getOutputCount();
    const sig: ElectricalSignal = energized
      ? { domain: 'electrical', voltage: inSig.voltage, energized: true }
      : ZERO_VOLT;

    for (let i = 1; i <= count; i++) {
      outputs.set(`out_${i}`, sig);
    }
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      inputEnergized: false,
      voltage: 0,
    };
  }
}
