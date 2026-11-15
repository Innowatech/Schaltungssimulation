import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

export class TankComponent extends SimComponent {
  public readonly type = 'tank';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 200;
  public readonly height = 224;

  constructor(id: string, label = 'B1 Haupttank', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      capacityLiters: 1000,
      initialLevelPct: 30,
    };
    this.runtimeState = {
      levelLiters: 300,
      inflowLph: 0,
      outflowLph: 0,
      isFull: false,
      isEmpty: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'fluid_in',
        label: 'Zulauf',
        description: 'Fluid-Eingang (Zulauf)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 56,
      },
      {
        id: 'fluid_out',
        label: 'Ablauf',
        description: 'Fluid-Ausgang (Ablauf)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 164,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return [];
  }

  public getCapacity(): number {
    return Math.max(10, Number(this.params.capacityLiters ?? 1000));
  }

  public getLevelLiters(): number {
    return Math.max(0, Math.min(this.getCapacity(), Number(this.runtimeState.levelLiters ?? 0)));
  }

  public getLevelPercent(): number {
    return (this.getLevelLiters() / this.getCapacity()) * 100;
  }

  public isFull(): boolean {
    return this.getLevelLiters() >= this.getCapacity() - 0.01;
  }

  public isEmpty(): boolean {
    return this.getLevelLiters() <= 0.01;
  }

  public setManualLevelPercent(pct: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    this.runtimeState.levelLiters = (clamped / 100) * this.getCapacity();
    this.runtimeState.isFull = this.isFull();
    this.runtimeState.isEmpty = this.isEmpty();
  }

  public reset(): void {
    super.reset();
    const initPct = Math.max(0, Math.min(100, Number(this.params.initialLevelPct ?? 30)));
    this.runtimeState = {
      levelLiters: (initPct / 100) * this.getCapacity(),
      inflowLph: 0,
      outflowLph: 0,
      isFull: initPct >= 99.9,
      isEmpty: initPct <= 0.1,
    };
  }
}

export class FloatProbeComponent extends SimComponent {
  public readonly type = 'float_probe';
  public readonly category: ComponentCategory = 'sensor';
  public readonly width = 188;
  public readonly height = 148;

  constructor(id: string, label = 'S2 Schwimmerlanze', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      tankId: '',
      minPercent: 20,
      maxPercent: 85,
      supplyMode: 'external' as 'external' | 'internal',
      minLogic: 'below' as 'below' | 'above',
      maxLogic: 'above' as 'above' | 'below',
    };
    this.runtimeState = {
      tankLevelPct: null as number | null,
      minTriggered: false,
      maxTriggered: false,
      powered: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'v24_in',
        label: '+24V',
        description: 'Sensor-Versorgung +24V DC',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 56,
      },
      {
        id: 'min_out',
        label: 'MIN',
        description: 'Schaltausgang Min-Level',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 64,
      },
      {
        id: 'max_out',
        label: 'MAX',
        description: 'Schaltausgang Max-Level',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 112,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.powered ? 0.15 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const tankId = String(this.params.tankId ?? '');
    const target = tankId ? (context.getComponentById(tankId) as TankComponent | undefined) : undefined;

    const supplyMode = (this.params.supplyMode as 'external' | 'internal') || 'external';
    const inSig = inputs.get('v24_in') ?? ZERO_VOLT;
    const powered = (supplyMode === 'internal' || inSig.energized) && this.fault !== 'short_circuit';
    const voltage = supplyMode === 'internal' ? 24 : inSig.voltage;

    let levelPct: number | null = null;
    let minTriggered = false;
    let maxTriggered = false;

    if (target && target.type === 'tank') {
      levelPct = target.getLevelPercent();
      const minTh = Number(this.params.minPercent ?? 20);
      const maxTh = Number(this.params.maxPercent ?? 85);
      const minLogic = (this.params.minLogic as 'below' | 'above') || 'below';
      const maxLogic = (this.params.maxLogic as 'above' | 'below') || 'above';

      minTriggered = minLogic === 'below' ? levelPct <= minTh : levelPct >= minTh;
      maxTriggered = maxLogic === 'above' ? levelPct >= maxTh : levelPct <= maxTh;
    }

    this.runtimeState.tankLevelPct = levelPct;
    this.runtimeState.minTriggered = minTriggered;
    this.runtimeState.maxTriggered = maxTriggered;
    this.runtimeState.powered = powered;

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('min_out', powered && minTriggered ? { ...HIGH_24V, voltage } : ZERO_VOLT);
    outputs.set('max_out', powered && maxTriggered ? { ...HIGH_24V, voltage } : ZERO_VOLT);
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      tankLevelPct: null,
      minTriggered: false,
      maxTriggered: false,
      powered: false,
    };
  }
}

export type GeneratorStatus = 'standby' | 'running' | 'locked_full' | 'locked_ext' | 'blocked';

export class GeneratorComponent extends SimComponent {
  public readonly type = 'generator';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 196;
  public readonly height = 140;

  constructor(id: string, label = 'P1 Erzeuger-Anlage', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      flowRateLph: 1200,
    };
    this.runtimeState = {
      enableActive: false,
      lockActive: false,
      status: 'standby' as GeneratorStatus,
      actualFlowLph: 0,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'enable_in',
        label: 'Freig.',
        description: 'Elektrische Freigabe (24V DC)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 56,
      },
      {
        id: 'lock_in',
        label: 'Sperre',
        description: 'Elektrische Sperre / Tank Voll (24V = Stopp)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 102,
      },
      {
        id: 'fluid_out',
        label: 'Ausg.',
        description: 'Fluid-Ausgang (Liter/Stunde)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 78,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit', 'power_failure'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    if (this.runtimeState.status === 'running') return 4.5;
    if (this.runtimeState.enableActive) return 0.4;
    return 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const enableSig = inputs.get('enable_in') ?? ZERO_VOLT;
    const lockSig = inputs.get('lock_in') ?? ZERO_VOLT;
    const faulted = this.fault === 'power_failure' || this.fault === 'short_circuit';
    this.runtimeState.enableActive = enableSig.energized && !faulted;
    this.runtimeState.lockActive = lockSig.energized;
    return new Map();
  }

  public canProduceElectrically(): boolean {
    return (
      Boolean(this.runtimeState.enableActive) &&
      !Boolean(this.runtimeState.lockActive) &&
      this.fault !== 'power_failure' &&
      this.fault !== 'short_circuit'
    );
  }

  public getNominalFlowLph(): number {
    return Math.max(0, Number(this.params.flowRateLph ?? 1200));
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      enableActive: false,
      lockActive: false,
      status: 'standby',
      actualFlowLph: 0,
    };
  }
}

export class SolenoidValve32Component extends SimComponent {
  public readonly type = 'valve_32';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 196;
  public readonly height = 136;

  constructor(id: string, label = 'Y1 3/2-Wege-Ventil', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {};
    this.runtimeState = {
      coilEnergized: false,
      activeFlowLph: 0,
      activePath: 'P->A' as 'P->A' | 'P->B',
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1',
        description: 'Magnetspule Steuersignal (24V DC)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 46,
      },
      {
        id: 'p_in',
        label: 'P',
        description: 'Fluid-Eingang P',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 98,
      },
      {
        id: 'a_out',
        label: 'A (NC)',
        description: 'Fluid-Ausgang A (aktiv bei 0V)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 66,
      },
      {
        id: 'b_out',
        label: 'B (NO)',
        description: 'Fluid-Ausgang B (aktiv bei 24V)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 110,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['valve_stuck_closed', 'valve_stuck_open', 'short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.coilEnergized ? 0.85 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const a1 = inputs.get('a1') ?? ZERO_VOLT;
    const energized = a1.energized && this.fault !== 'short_circuit';
    this.runtimeState.coilEnergized = energized;

    // Fehler: klemmendes Ventil ignoriert elektrisches Schalten
    if (this.fault === 'valve_stuck_closed') {
      // Klemmt in Ruhestellung P -> A
      this.runtimeState.activePath = 'P->A';
    } else if (this.fault === 'valve_stuck_open') {
      // Klemmt in geschalteter Stellung P -> B
      this.runtimeState.activePath = 'P->B';
    } else {
      this.runtimeState.activePath = energized ? 'P->B' : 'P->A';
    }
    return new Map();
  }

  public getActiveFluidPaths(): Array<[string, string]> {
    return this.runtimeState.activePath === 'P->B'
      ? [['p_in', 'b_out']]
      : [['p_in', 'a_out']];
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      coilEnergized: false,
      activeFlowLph: 0,
      activePath: 'P->A',
    };
  }
}

export class SolenoidValve22Component extends SimComponent {
  public readonly type = 'valve_22';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 186;
  public readonly height = 120;

  constructor(id: string, label = 'Y2 2/2-Wege-Ventil', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      normalState: 'NC' as 'NC' | 'NO',
    };
    this.runtimeState = {
      coilEnergized: false,
      isOpen: false,
      activeFlowLph: 0,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1',
        description: 'Magnetspule Steuersignal (24V DC)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 44,
      },
      {
        id: 'p_in',
        label: 'P',
        description: 'Fluid-Eingang P',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 88,
      },
      {
        id: 'a_out',
        label: 'A',
        description: 'Fluid-Ausgang A',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 88,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['valve_stuck_closed', 'valve_stuck_open', 'short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.coilEnergized ? 0.75 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const a1 = inputs.get('a1') ?? ZERO_VOLT;
    const energized = a1.energized && this.fault !== 'short_circuit';
    const normalState = (this.params.normalState as 'NC' | 'NO') || 'NC';

    let isOpen = normalState === 'NC' ? energized : !energized;
    if (this.fault === 'valve_stuck_closed') isOpen = false;
    if (this.fault === 'valve_stuck_open') isOpen = true;

    this.runtimeState.coilEnergized = energized;
    this.runtimeState.isOpen = isOpen;
    return new Map();
  }

  public getActiveFluidPaths(): Array<[string, string]> {
    return this.runtimeState.isOpen ? [['p_in', 'a_out']] : [];
  }

  public reset(): void {
    super.reset();
    const normalState = (this.params.normalState as 'NC' | 'NO') || 'NC';
    this.runtimeState = {
      coilEnergized: false,
      isOpen: normalState === 'NO',
      activeFlowLph: 0,
    };
  }
}

export class DrainConsumerComponent extends SimComponent {
  public readonly type = 'drain_consumer';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 188;
  public readonly height = 128;

  constructor(id: string, label = 'V1 Ablass / Verbraucher', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      drainRateLph: 450,
      manualOverride: false,
    };
    this.runtimeState = {
      ctrlEnergized: false,
      isOpen: false,
      actualFlowLph: 0,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'ctrl_in',
        label: '24V',
        description: 'Elektrische Ansteuerung (24V DC)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 48,
      },
      {
        id: 'fluid_in',
        label: 'Zulauf',
        description: 'Fluid-Eingang (vom Tank / Ventil)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 94,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['valve_stuck_closed', 'valve_stuck_open', 'short_circuit'];
  }

  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return this.runtimeState.ctrlEnergized ? 1.2 : 0;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const ctrl = inputs.get('ctrl_in') ?? ZERO_VOLT;
    const energized = ctrl.energized && this.fault !== 'short_circuit';
    this.runtimeState.ctrlEnergized = energized;

    let open = energized || Boolean(this.params.manualOverride);
    if (this.fault === 'valve_stuck_closed') open = false;
    if (this.fault === 'valve_stuck_open') open = true;
    this.runtimeState.isOpen = open;
    return new Map();
  }

  public isOpen(): boolean {
    if (this.fault === 'valve_stuck_closed') return false;
    if (this.fault === 'valve_stuck_open') return true;
    return Boolean(this.runtimeState.ctrlEnergized) || Boolean(this.params.manualOverride);
  }

  public getDrainRateLph(): number {
    return Math.max(0, Number(this.params.drainRateLph ?? 450));
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      ctrlEnergized: false,
      isOpen: Boolean(this.params.manualOverride),
      actualFlowLph: 0,
    };
  }
}
