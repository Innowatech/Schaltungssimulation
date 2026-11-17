/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  FluidSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

export class TankComponent extends SimComponent {
  public readonly type = 'tank';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 216;
  public readonly height = 260;

  constructor(id: string, label = 'B1 Tank mit Schwimmer', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      capacityLiters: 1000,
      initialLevelPct: 30,
      probeMode: '3_points' as '3_points' | '5_points',
      dryPct: 10,
      preLowPct: 25,
      minPct: 40,
      maxPct: 80,
      overflowPct: 95,
    };
    this.runtimeState = {
      levelLiters: 300,
      inflowLph: 0,
      outflowLph: 0,
      isFull: false,
      isEmpty: false,
      dryState: false,
      preLowState: false,
      minState: false,
      maxState: true,
      overflowState: true,
    };
  }

  public getPorts(): PortDefinition[] {
    const mode = (this.params.probeMode as '3_points' | '5_points') || '3_points';
    const ports: PortDefinition[] = [
      {
        id: 'v24_in',
        label: '+24V',
        description: 'Sensor-Versorgung +24V DC',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 48,
      },
      {
        id: 'fluid_in',
        label: 'Zulauf',
        description: 'Fluid-Eingang (Zulauf)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 130,
      },
      {
        id: 'fluid_out',
        label: 'Ablauf',
        description: 'Fluid-Ausgang / Ablauf',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 210,
      },
      {
        id: 'min_out',
        label: 'MIN',
        description: 'Min-Kontakt (NO, Schließer)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 76,
      },
      {
        id: 'max_out',
        label: 'MAX',
        description: 'Max-Kontakt (NC, Öffner)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 120,
      },
      {
        id: 'dry_out',
        label: 'DRY',
        description: 'Trockenlauf-Kontakt (NO, Schließer)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 164,
      },
    ];

    if (mode === '5_points') {
      ports.push(
        {
          id: 'pre_out',
          label: 'VOR',
          description: 'Vorleer-Kontakt (NO, Schließer)',
          domain: 'electrical',
          direction: 'output',
          side: 'left',
          offsetX: 0,
          offsetY: 190,
        },
        {
          id: 'ovf_out',
          label: 'OVF',
          description: 'Überlauf-Kontakt (NC, Öffner)',
          domain: 'electrical',
          direction: 'output',
          side: 'left',
          offsetX: 0,
          offsetY: 230,
        }
      );
    }

    return ports;
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

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('v24_in') ?? ZERO_VOLT;
    const powered = inSig.energized;
    const voltage = inSig.voltage;
    const pct = this.getLevelPercent();

    const dryTh = Number(this.params.dryPct ?? 10);
    const preTh = Number(this.params.preLowPct ?? 25);
    const minTh = Number(this.params.minPct ?? 40);
    const maxTh = Number(this.params.maxPct ?? 80);
    const ovfTh = Number(this.params.overflowPct ?? 95);

    const dryActive = pct >= dryTh;
    const preActive = pct >= preTh;
    const minActive = pct >= minTh;
    const maxActive = pct < maxTh;
    const ovfActive = pct < ovfTh;

    this.runtimeState.dryState = dryActive;
    this.runtimeState.preLowState = preActive;
    this.runtimeState.minState = minActive;
    this.runtimeState.maxState = maxActive;
    this.runtimeState.overflowState = ovfActive;

    const outputs = new Map<string, ElectricalSignal>();
    const activeSig = (active: boolean) =>
      powered && active ? { ...HIGH_24V, voltage } : ZERO_VOLT;

    outputs.set('dry_out', activeSig(dryActive));
    outputs.set('pre_out', activeSig(preActive));
    outputs.set('min_out', activeSig(minActive));
    outputs.set('max_out', activeSig(maxActive));
    outputs.set('ovf_out', activeSig(ovfActive));

    return outputs;
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
      targetTankId: '',
      levelPct: 50,
      probeMode: '3_points',
      dryPct: 10,
      minPct: 40,
      maxPct: 80,
    };
    this.runtimeState = {
      tankLevelPct: 50,
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
        description: 'Sensor-Versorgung +24V',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 36,
      },
      {
        id: 'min_out',
        label: 'MIN',
        description: 'Min-Kontakt',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 40,
      },
      {
        id: 'max_out',
        label: 'MAX',
        description: 'Max-Kontakt',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 80,
      },
      {
        id: 'dry_out',
        label: 'DRY',
        description: 'Trockenlauf',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 120,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return [];
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('v24_in') ?? ZERO_VOLT;
    const powered = inSig.energized;
    const voltage = inSig.voltage;

    let pct = Number(this.params.levelPct ?? 50);
    const tankId = String(this.params.tankId ?? this.params.targetTankId ?? '');
    if (tankId && context && typeof context.getComponentById === 'function') {
      const targetTank = context.getComponentById(tankId) as TankComponent | undefined;
      if (targetTank && typeof targetTank.getLevelPercent === 'function') {
        pct = targetTank.getLevelPercent();
      }
    }

    this.runtimeState.tankLevelPct = pct;
    this.runtimeState.powered = powered;

    const dryTh = Number(this.params.dryPct ?? 10);
    const minTh = Number(this.params.minPct ?? 40);
    const maxTh = Number(this.params.maxPct ?? 80);

    const dryActive = pct >= dryTh;
    const minActive = pct >= minTh;
    const maxActive = pct < maxTh;

    this.runtimeState.minTriggered = minActive;
    this.runtimeState.maxTriggered = maxActive;

    const outputs = new Map<string, ElectricalSignal>();
    const activeSig = (active: boolean) =>
      powered && active ? { ...HIGH_24V, voltage } : ZERO_VOLT;

    outputs.set('dry_out', activeSig(dryActive));
    outputs.set('min_out', activeSig(minActive));
    outputs.set('max_out', activeSig(maxActive));
    return outputs;
  }
}

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
      actualFlowLph: 0,
      status: 'standby',
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'v24_in',
        label: 'EN',
        description: 'Freigabe-Eingang +24V',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 40,
      },
      {
        id: 'lock_in',
        label: 'Sperre',
        description: 'Sperr-Eingang (z.B. Tank Voll)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 96,
      },
      {
        id: 'fluid_out',
        label: 'Fluid',
        description: 'Fluid-Ausgang',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 70,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public getNominalFlowLph(): number {
    return Math.max(0, Number(this.params.flowRateLph ?? 1200));
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    if (this.fault === 'power_failure' || this.fault === 'short_circuit') {
      this.runtimeState.enableActive = false;
      this.runtimeState.lockActive = false;
      return new Map();
    }
    const enSig = inputs.get('v24_in');
    const lockSig = inputs.get('lock_in');
    this.runtimeState.enableActive = Boolean(enSig?.energized);
    this.runtimeState.lockActive = Boolean(lockSig?.energized);
    return new Map();
  }
}

export class SolenoidValve32Component extends SimComponent {
  public readonly type = 'valve_32';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 196;
  public readonly height = 136;

  constructor(id: string, label = 'Y1 3/2-Magnetventil', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {};
    this.runtimeState = {
      energized: false,
      activeFlowLph: 0,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1',
        description: 'Spulenanschluss +24V',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 40,
      },
      {
        id: 'fluid_p',
        label: 'P (Ein)',
        description: 'Fluid-Eingang P',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 100,
      },
      {
        id: 'fluid_a',
        label: 'A (NC)',
        description: 'Ausgang A (stromlos offen / NC)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 50,
      },
      {
        id: 'fluid_b',
        label: 'B (NO)',
        description: 'Ausgang B (bestromt offen / NO)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 104,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit', 'valve_stuck_closed', 'valve_stuck_open'];
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    if (this.fault === 'power_failure' || this.fault === 'short_circuit') {
      this.runtimeState.energized = false;
      return new Map();
    }
    const a1 = inputs.get('a1');
    this.runtimeState.energized = Boolean(a1?.energized);
    return new Map();
  }

  public getActiveFluidPaths(): [string, string][] {
    let energized = Boolean(this.runtimeState.energized);
    if (this.fault === 'valve_stuck_closed') energized = false;
    if (this.fault === 'valve_stuck_open') energized = true;

    if (!energized) {
      return [['fluid_p', 'fluid_a']];
    } else {
      return [['fluid_p', 'fluid_b']];
    }
  }
}

export class SolenoidValve22Component extends SimComponent {
  public readonly type = 'valve_22';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 186;
  public readonly height = 120;

  constructor(id: string, label = 'Y2 2/2-Magnetventil', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      normalState: 'NC',
    };
    this.runtimeState = {
      energized: false,
      isOpen: false,
      activeFlowLph: 0,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'a1',
        label: 'A1',
        description: 'Spulenanschluss +24V',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 36,
      },
      {
        id: 'fluid_in',
        label: 'P',
        description: 'Fluid-Eingang',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 86,
      },
      {
        id: 'fluid_out',
        label: 'A',
        description: 'Fluid-Ausgang',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 60,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit', 'valve_stuck_closed', 'valve_stuck_open'];
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    if (this.fault === 'power_failure' || this.fault === 'short_circuit') {
      this.runtimeState.energized = false;
      this.runtimeState.isOpen = this.params.normalState === 'NO';
      return new Map();
    }
    const a1 = inputs.get('a1');
    const energized = Boolean(a1?.energized);
    this.runtimeState.energized = energized;

    const normal = this.params.normalState ?? 'NC';
    let open = normal === 'NO' ? !energized : energized;
    if (this.fault === 'valve_stuck_closed') open = false;
    if (this.fault === 'valve_stuck_open') open = true;

    this.runtimeState.isOpen = open;
    return new Map();
  }

  public isOpen(): boolean {
    let open = Boolean(this.runtimeState.isOpen);
    if (this.fault === 'valve_stuck_closed') open = false;
    if (this.fault === 'valve_stuck_open') open = true;
    return open;
  }

  public getActiveFluidPaths(): [string, string][] {
    if (this.isOpen()) {
      return [['fluid_in', 'fluid_out']];
    }
    return [];
  }
}

export class DrainConsumerComponent extends SimComponent {
  public readonly type = 'drain_consumer';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 188;
  public readonly height = 128;

  constructor(id: string, label = 'V1 Verbraucher / Ablauf', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      drainRateLph: 450,
      manualOverride: false,
    };
    this.runtimeState = {
      energized: false,
      actualFlowLph: 0,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'v24_in',
        label: 'EIN',
        description: 'Ansteuerung +24V',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 44,
      },
      {
        id: 'fluid_in',
        label: 'Ablauf',
        description: 'Fluid-Eingang (zum Ablauf)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 96,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public getDrainRateLph(): number {
    return Math.max(0, Number(this.params.drainRateLph ?? 450));
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    if (this.fault === 'power_failure' || this.fault === 'short_circuit') {
      this.runtimeState.energized = false;
      return new Map();
    }
    const inSig = inputs.get('v24_in');
    const energized = Boolean(inSig?.energized) || Boolean(this.params.manualOverride);
    this.runtimeState.energized = energized;
    return new Map();
  }

  public isOpen(): boolean {
    return Boolean(this.runtimeState.energized) || Boolean(this.params.manualOverride);
  }
}
