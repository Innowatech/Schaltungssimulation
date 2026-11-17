/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HIGH_24V, SimComponent, ZERO_VOLT } from '../SimComponent';
import {
  AnalogSignal,
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  FluidMedium,
  FluidSignal,
  PortDefinition,
  SimulationContext,
} from '../types';

export type TankVariant = 'tank' | 'anolyte_tank' | 'katholyte_tank';
export type TankProbeMode = 'none' | '3_points' | '5_points';

export class TankComponent extends SimComponent {
  public readonly type: TankVariant;
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 224;

  constructor(
    id: string,
    label = 'B1 Tank',
    x = 0,
    y = 0,
    variant: TankVariant = 'tank'
  ) {
    super(id, label, x, y);
    this.type = variant;
    const isKatholyte = variant === 'katholyte_tank';
    this.params = {
      medium: (isKatholyte ? 'katholyte' : 'anolyte') as FluidMedium,
      capacityLiters: 1000,
      initialLevelPct: isKatholyte ? 20 : 30,
      probeMode: (isKatholyte ? 'none' : '3_points') as TankProbeMode,
      suctionCount: 1, // 0..4 Sauglanzen
      dryPct: 10,
      preLowPct: 25,
      minPct: 40,
      maxPct: 80,
      overflowPct: 95,
      invertDry: false,
      invertPre: false,
      invertMin: false,
      invertMax: false,
      invertOvf: false,
    };
    const initPct = Number(this.params.initialLevelPct ?? 30);
    this.runtimeState = {
      levelLiters: (initPct / 100) * 1000,
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

  public getMedium(): FluidMedium {
    const raw = this.params.medium as FluidMedium | undefined;
    if (raw === 'anolyte' || raw === 'katholyte' || raw === 'water') return raw;
    return this.type === 'katholyte_tank' ? 'katholyte' : 'anolyte';
  }

  public getProbeMode(): TankProbeMode {
    const raw = this.params.probeMode as TankProbeMode | undefined;
    if (raw === 'none' || raw === '3_points' || raw === '5_points') return raw;
    return this.type === 'katholyte_tank' ? 'none' : '3_points';
  }

  public getSuctionCount(): number {
    const n = Number(this.params.suctionCount ?? 1);
    return Math.max(0, Math.min(4, Number.isFinite(n) ? Math.round(n) : 1));
  }

  public get height(): number {
    const suction = this.getSuctionCount();
    const extraSuction = Math.max(0, suction - 1) * 28;
    return 264 + extraSuction;
  }

  public getPorts(): PortDefinition[] {
    const mode = this.getProbeMode();
    const suctionCount = this.getSuctionCount();
    const ports: PortDefinition[] = [
      {
        id: 'fluid_in',
        label: 'Zulauf',
        description: 'Fluid-Eingang (Zulauf)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 118,
      },
      {
        id: 'fluid_out',
        label: 'Ablauf',
        description: 'Tank-Ablauf (z. B. über 2/2-Ventil zum Gulli)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 184,
      },
    ];

    // Sauglanzen (0..4) unten rechts am Tank
    for (let i = 1; i <= suctionCount; i++) {
      ports.push({
        id: `suction_${i}`,
        label: `Saug ${i}`,
        description: `Sauglanze ${i} für Dosierpumpe`,
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 184 + i * 28,
      });
    }

    if (mode !== 'none') {
      ports.push(
        {
          id: 'v24_in',
          label: '+24V',
          description: 'Sensor-Versorgung +24V DC für Schwimmerlanze',
          domain: 'electrical',
          direction: 'input',
          side: 'left',
          offsetX: 0,
          offsetY: 50,
        },
        {
          id: 'min_out',
          label: 'MIN',
          description: 'Min-Kontakt (Standard: NO, schließt beim Steigen über Schwelle)',
          domain: 'electrical',
          direction: 'output',
          side: 'right',
          offsetX: this.width,
          offsetY: 64,
        },
        {
          id: 'max_out',
          label: 'MAX',
          description: 'Max-Kontakt (Standard: NC, öffnet bei Überschreitung Max)',
          domain: 'electrical',
          direction: 'output',
          side: 'right',
          offsetX: this.width,
          offsetY: 102,
        },
        {
          id: 'dry_out',
          label: 'DRY',
          description: 'Trockenlauf-Kontakt (Standard: NO, aktiv über Trockenlaufschwelle)',
          domain: 'electrical',
          direction: 'output',
          side: 'right',
          offsetX: this.width,
          offsetY: 140,
        }
      );

      if (mode === '5_points') {
        ports.push(
          {
            id: 'pre_out',
            label: 'VOR',
            description: 'Vorleer-Kontakt',
            domain: 'electrical',
            direction: 'output',
            side: 'left',
            offsetX: 0,
            offsetY: 176,
          },
          {
            id: 'ovf_out',
            label: 'OVF',
            description: 'Überlauf-Kontakt',
            domain: 'electrical',
            direction: 'output',
            side: 'left',
            offsetX: 0,
            offsetY: 218,
          }
        );
      }
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

  public isDryForPump(): boolean {
    const dryTh = Number(this.params.dryPct ?? 10);
    return this.isEmpty() || this.getLevelPercent() < Math.min(2, dryTh * 0.2);
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
    if (this.getProbeMode() === 'none') {
      return new Map();
    }

    const inSig = inputs.get('v24_in') ?? ZERO_VOLT;
    const powered = inSig.energized;
    const voltage = inSig.voltage;
    const pct = this.getLevelPercent();

    const dryTh = Number(this.params.dryPct ?? 10);
    const preTh = Number(this.params.preLowPct ?? 25);
    const minTh = Number(this.params.minPct ?? 40);
    const maxTh = Number(this.params.maxPct ?? 80);
    const ovfTh = Number(this.params.overflowPct ?? 95);

    const dryRaw = pct >= dryTh;
    const preRaw = pct >= preTh;
    const minRaw = pct >= minTh;
    const maxRaw = pct < maxTh;
    const ovfRaw = pct < ovfTh;

    const dryActive = Boolean(this.params.invertDry) ? !dryRaw : dryRaw;
    const preActive = Boolean(this.params.invertPre) ? !preRaw : preRaw;
    const minActive = Boolean(this.params.invertMin) ? !minRaw : minRaw;
    const maxActive = Boolean(this.params.invertMax) ? !maxRaw : maxRaw;
    const ovfActive = Boolean(this.params.invertOvf) ? !ovfRaw : ovfRaw;

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
      invertMin: false,
      invertMax: false,
      invertDry: false,
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
    const minTh = Number(this.params.minPct ?? this.params.minPercent ?? 40);
    const maxTh = Number(this.params.maxPct ?? this.params.maxPercent ?? 80);

    const dryRaw = pct >= dryTh;
    const minRaw = pct >= minTh;
    const maxRaw = pct < maxTh;

    const dryActive = Boolean(this.params.invertDry) ? !dryRaw : dryRaw;
    const minActive = Boolean(this.params.invertMin) ? !minRaw : minRaw;
    const maxActive = Boolean(this.params.invertMax) ? !maxRaw : maxRaw;

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

export type GeneratorControlMode = 'tank_minmax' | 'enable_24v';

export class GeneratorComponent extends SimComponent {
  public readonly type = 'generator';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 216;
  public readonly height = 176;

  constructor(id: string, label = 'P1 Erzeuger-Anlage', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      controlMode: 'tank_minmax' as GeneratorControlMode,
      anolyteFlowLph: 500,
      katholyteFlowLph: 500,
      manualStop: false,
    };
    this.runtimeState = {
      enableActive: false,
      lockActive: false,
      minActive: false,
      maxActive: false,
      latchActive: false,
      productionEnabled: false,
      actualAnolyteLph: 0,
      actualKatholyteLph: 0,
      actualFlowLph: 0,
      status: 'standby',
    };
  }

  public getControlMode(): GeneratorControlMode {
    const mode = this.params.controlMode as GeneratorControlMode | undefined;
    return mode === 'enable_24v' ? 'enable_24v' : 'tank_minmax';
  }

  public getPorts(): PortDefinition[] {
    const mode = this.getControlMode();
    const leftPorts: PortDefinition[] =
      mode === 'tank_minmax'
        ? [
            {
              id: 'min_in',
              label: 'MIN',
              description: 'Anolyt-Tank MIN-Kontakt (öffnet bei Unterschreitung → Start)',
              domain: 'electrical',
              direction: 'input',
              side: 'left',
              offsetX: 0,
              offsetY: 48,
            },
            {
              id: 'max_in',
              label: 'MAX',
              description: 'Anolyt-Tank MAX-Kontakt (24V = nicht voll, 0V = Stopp)',
              domain: 'electrical',
              direction: 'input',
              side: 'left',
              offsetX: 0,
              offsetY: 90,
            },
            {
              id: 'lock_in',
              label: 'Sperre',
              description: 'Externe Sperre / Freigabeentzug (+24V sperrt)',
              domain: 'electrical',
              direction: 'input',
              side: 'left',
              offsetX: 0,
              offsetY: 134,
            },
          ]
        : [
            {
              id: 'v24_in',
              label: 'EN',
              description: 'Freigabe-Eingang +24V',
              domain: 'electrical',
              direction: 'input',
              side: 'left',
              offsetX: 0,
              offsetY: 56,
            },
            {
              id: 'lock_in',
              label: 'Sperre',
              description: 'Sperr-Eingang (+24V sperrt)',
              domain: 'electrical',
              direction: 'input',
              side: 'left',
              offsetX: 0,
              offsetY: 118,
            },
          ];

    return [
      ...leftPorts,
      {
        id: 'fluid_anolyte',
        label: 'Anolyt',
        description: 'Anolyt-Ausgang (Blau, primär gesteuert)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 62,
      },
      {
        id: 'fluid_katholyte',
        label: 'Katholyt',
        description: 'Katholyt-Ausgang (Grün, nebenrangig)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 124,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public getAnolyteNominalLph(): number {
    const legacy = this.params.flowRateLph;
    return Math.max(0, Number(this.params.anolyteFlowLph ?? legacy ?? 500));
  }

  public getKatholyteNominalLph(): number {
    return Math.max(0, Number(this.params.katholyteFlowLph ?? 500));
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    if (this.fault === 'power_failure' || this.fault === 'short_circuit') {
      this.runtimeState.enableActive = false;
      this.runtimeState.lockActive = false;
      this.runtimeState.latchActive = false;
      this.runtimeState.productionEnabled = false;
      return new Map();
    }

    const lockSig = inputs.get('lock_in');
    const lockActive = Boolean(lockSig?.energized);
    this.runtimeState.lockActive = lockActive;

    const manualStop = Boolean(this.params.manualStop);
    const mode = this.getControlMode();

    if (mode === 'enable_24v') {
      const enSig = inputs.get('v24_in');
      const en = Boolean(enSig?.energized);
      this.runtimeState.enableActive = en;
      this.runtimeState.productionEnabled = en && !lockActive && !manualStop;
    } else {
      const minOn = Boolean(inputs.get('min_in')?.energized);
      const maxOn = Boolean(inputs.get('max_in')?.energized);
      this.runtimeState.minActive = minOn;
      this.runtimeState.maxActive = maxOn;

      // Selbsthaltungs-Hysterese laut Kundenanforderung:
      // MAX geschlossen (24V) & MIN öffnet (0V) -> Start & Halten solange MAX geschlossen (24V).
      // MAX öffnet (0V) -> Stopp.
      let latch = Boolean(this.runtimeState.latchActive);
      if (!maxOn) {
        latch = false;
      } else if (!minOn && maxOn) {
        latch = true;
      }
      this.runtimeState.latchActive = latch;
      this.runtimeState.enableActive = latch;
      this.runtimeState.productionEnabled = latch && !lockActive && !manualStop;
    }

    return new Map();
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      enableActive: false,
      lockActive: false,
      minActive: false,
      maxActive: false,
      latchActive: false,
      productionEnabled: false,
      actualAnolyteLph: 0,
      actualKatholyteLph: 0,
      actualFlowLph: 0,
      status: 'standby',
    };
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
      activePath: 'P->A',
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
      this.runtimeState.activePath = 'P->A';
      return new Map();
    }
    const a1 = inputs.get('a1');
    const en = Boolean(a1?.energized);
    this.runtimeState.energized = en;
    const effB =
      this.fault === 'valve_stuck_open'
        ? true
        : this.fault === 'valve_stuck_closed'
        ? false
        : en;
    this.runtimeState.activePath = effB ? 'P->B' : 'P->A';
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
  public readonly height = 124;

  constructor(id: string, label = 'Y2 2/2-Magnetventil', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      normalState: 'NC',
      flowRateLph: 1000,
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
        offsetY: 88,
      },
      {
        id: 'fluid_out',
        label: 'A',
        description: 'Fluid-Ausgang',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 62,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit', 'valve_stuck_closed', 'valve_stuck_open'];
  }

  public getFlowRateLimitLph(): number {
    return Math.max(0, Number(this.params.flowRateLph ?? 1000));
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

export class GullyDrainComponent extends SimComponent {
  public readonly type = 'gully_drain';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 164;
  public readonly height = 112;

  constructor(id: string, label = 'G1 Gulli / Ablauf', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {};
    this.runtimeState = {
      actualFlowLph: 0,
      totalDiscardedLiters: 0,
      lastMedium: 'water' as FluidMedium,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'fluid_in',
        label: 'Einlauf',
        description: 'Abwasser / Verwurf in den Kanal (Gulli)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 64,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return [];
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      actualFlowLph: 0,
      totalDiscardedLiters: 0,
      lastMedium: 'water',
    };
  }
}

export class MainWaterLineComponent extends SimComponent {
  public readonly type = 'main_water_line';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 196;
  public readonly height = 124;

  constructor(id: string, label = 'W1 Hauptleitung', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      flowRateLph: 5000,
      manualOpen: true,
      require24V: false,
    };
    this.runtimeState = {
      enable24V: false,
      actualFlowLph: 0,
      flowing: false,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'v24_in',
        label: 'EN +24V',
        description: 'Optionale Freigabe +24V (falls aktiv)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 50,
      },
      {
        id: 'fluid_out',
        label: 'Wasser',
        description: 'Rohwasser-Volumenstrom Ausgang',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 74,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return [];
  }

  public getNominalFlowLph(): number {
    return Math.max(0, Number(this.params.flowRateLph ?? 5000));
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const sig = inputs.get('v24_in');
    this.runtimeState.enable24V = Boolean(sig?.energized);
    return new Map();
  }

  public isActiveFlow(): boolean {
    const manual = Boolean(this.params.manualOpen ?? true);
    const req24 = Boolean(this.params.require24V);
    return manual && (!req24 || Boolean(this.runtimeState.enable24V));
  }
}

export class WaterMeterComponent extends SimComponent {
  public readonly type = 'water_meter';
  public readonly category: ComponentCategory = 'sensor';
  public readonly width = 208;
  public readonly height = 152;

  constructor(id: string, label = 'B2 Wasserzähler', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      litersPerPulse: 10,
      pulseDurationSec: 0.5,
      maxFlowLph: 10000,
    };
    this.runtimeState = {
      powered: false,
      currentFlowLph: 0,
      totalVolumeLiters: 0,
      pulseAccumulatorLiters: 0,
      totalPulses: 0,
      lastStepPulses: 0,
      pulseActive: false,
      pulseTimerRemaining: 0,
      analogMa: 4,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'v24_in',
        label: '+24V',
        description: 'Hilfsspannung für Kontakt-Impulsausgang (+24V)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 46,
      },
      {
        id: 'fluid_in',
        label: 'Einlauf',
        description: 'Wasser-Eingang',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 106,
      },
      {
        id: 'pulse_out',
        label: 'Impuls',
        description: 'Kontakt-Impulsausgang (+24V pro X Liter)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 46,
      },
      {
        id: 'analog_out',
        label: '4–20mA',
        description: 'Durchfluss-Normsignal 4–20 mA',
        domain: 'analog',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 84,
      },
      {
        id: 'fluid_out',
        label: 'Auslauf',
        description: 'Wasser-Ausgang',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 122,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  public getActiveFluidPaths(): [string, string][] {
    return [['fluid_in', 'fluid_out']];
  }

  public stepTime(
    inputs: Map<string, ElectricalSignal>,
    dtSimSeconds: number,
    _context: SimulationContext
  ): void {
    const flow = Math.max(0, Number(this.runtimeState.currentFlowLph ?? 0));
    const litersPerPulse = Math.max(0.1, Number(this.params.litersPerPulse ?? 10));
    const pulseDur = Math.max(0.1, Number(this.params.pulseDurationSec ?? 0.5));
    const powered = Boolean(inputs.get('v24_in')?.energized) && this.fault !== 'short_circuit';
    this.runtimeState.powered = powered;

    const deltaL = flow * (dtSimSeconds / 3600);
    this.runtimeState.totalVolumeLiters =
      Number(this.runtimeState.totalVolumeLiters ?? 0) + deltaL;

    let acc = Number(this.runtimeState.pulseAccumulatorLiters ?? 0) + deltaL;
    const triggered = Math.floor(acc / litersPerPulse);
    acc -= triggered * litersPerPulse;

    this.runtimeState.pulseAccumulatorLiters = acc;
    this.runtimeState.totalPulses = Number(this.runtimeState.totalPulses ?? 0) + triggered;
    this.runtimeState.lastStepPulses = triggered;

    let rem = Number(this.runtimeState.pulseTimerRemaining ?? 0);
    if (triggered > 0) {
      rem = pulseDur;
    } else if (rem > 0) {
      rem = Math.max(0, rem - dtSimSeconds);
    }
    this.runtimeState.pulseTimerRemaining = rem;
    this.runtimeState.pulseActive = powered && (triggered > 0 || rem > 0);
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, ElectricalSignal> {
    const inSig = inputs.get('v24_in') ?? ZERO_VOLT;
    const powered = inSig.energized && this.fault !== 'short_circuit';
    this.runtimeState.powered = powered;

    const active = powered && Boolean(this.runtimeState.pulseActive);
    const flow = Math.max(0, Number(this.runtimeState.currentFlowLph ?? 0));
    const litersPerPulse = Math.max(0.1, Number(this.params.litersPerPulse ?? 10));
    const lastPulses = Number(this.runtimeState.lastStepPulses ?? 0);

    const outputs = new Map<string, ElectricalSignal>();
    outputs.set('pulse_out', {
      domain: 'electrical',
      voltage: active ? inSig.voltage : 0,
      energized: active,
      pulseDeltaCount: powered ? lastPulses : 0,
      pulseRatePerHour: powered ? flow / litersPerPulse : 0,
    });
    return outputs;
  }

  public evaluateAnalog(): Map<string, AnalogSignal> {
    const flow = Math.max(0, Number(this.runtimeState.currentFlowLph ?? 0));
    const maxFlow = Math.max(10, Number(this.params.maxFlowLph ?? 10000));
    const ratio = Math.max(0, Math.min(1, flow / maxFlow));
    const ma = Math.round((4 + ratio * 16) * 100) / 100;
    this.runtimeState.analogMa = ma;

    const outputs = new Map<string, AnalogSignal>();
    outputs.set('analog_out', {
      domain: 'analog',
      value: ma,
      unit: 'mA',
      active: flow > 0,
    });
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      powered: false,
      currentFlowLph: 0,
      totalVolumeLiters: 0,
      pulseAccumulatorLiters: 0,
      totalPulses: 0,
      lastStepPulses: 0,
      pulseActive: false,
      pulseTimerRemaining: 0,
      analogMa: 4,
    };
  }
}

export type DdaModel = 'DDA 17-7' | 'DDA 60-10' | 'DDA 120-7' | 'DDA 200-4';
export type DdaOperatingMode = 'manual' | 'pulse' | 'analog';

export const DDA_MODELS: Record<DdaModel, { label: string; maxFlowLph: number; pressureBar: number }> = {
  'DDA 17-7': { label: 'Grundfos DDA 17-7 (17 L/h)', maxFlowLph: 17, pressureBar: 7 },
  'DDA 60-10': { label: 'Grundfos DDA 60-10 (60 L/h)', maxFlowLph: 60, pressureBar: 10 },
  'DDA 120-7': { label: 'Grundfos DDA 120-7 (120 L/h)', maxFlowLph: 120, pressureBar: 7 },
  'DDA 200-4': { label: 'Grundfos DDA 200-4 (200 L/h)', maxFlowLph: 200, pressureBar: 4 },
};

export class DosingPumpComponent extends SimComponent {
  public readonly type = 'dosing_pump';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 220;
  public readonly height = 186;

  constructor(id: string, label = 'P2 Grundfos DDA', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      model: 'DDA 17-7' as DdaModel,
      operatingMode: 'pulse' as DdaOperatingMode,
      manualFlowLph: 5.0,
      mlPerPulse: 2.0,
      analogMinMa: 4.0,
      analogMaxMa: 20.0,
      analogMinPct: 0,
      analogMaxPct: 100,
      cutOffBelowMinMa: true,
      require24VEnable: false,
      manualStop: false,
    };
    this.runtimeState = {
      targetFlowLph: 0,
      actualFlowLph: 0,
      totalDosedLiters: 0,
      dryFault: false,
      enable24V: false,
      pulseHigh: false,
      lastPulseRateLph: 0,
      analogInMa: 4,
      status: 'standby',
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'en_in',
        label: 'Freigabe',
        description: 'Freigabe-Eingang +24V (optional)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 44,
      },
      {
        id: 'pulse_in',
        label: 'Impuls',
        description: 'Kontakt-Impulseingang (+24V vom Wasserzähler)',
        domain: 'electrical',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 78,
      },
      {
        id: 'analog_in',
        label: '4–20mA',
        description: 'Analogeingang (4–20mA Sollwert)',
        domain: 'analog',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 112,
      },
      {
        id: 'fluid_in',
        label: 'Saug',
        description: 'Saugseite (Anschluss an Tank-Sauglanze)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 152,
      },
      {
        id: 'alarm_out',
        label: 'Störung',
        description: 'Sammelstörmeldung +24V (z. B. Trockenlauf)',
        domain: 'electrical',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 58,
      },
      {
        id: 'fluid_out',
        label: 'Druck',
        description: 'Druckseite (Dosierleitung zur Impfstelle)',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 132,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return ['power_failure', 'short_circuit'];
  }

  public getMaxFlowLph(): number {
    const m = (this.params.model as DdaModel) || 'DDA 17-7';
    return (DDA_MODELS[m] ?? DDA_MODELS['DDA 17-7']).maxFlowLph;
  }

  public getOperatingMode(): DdaOperatingMode {
    const m = this.params.operatingMode as DdaOperatingMode | undefined;
    if (m === 'manual' || m === 'pulse' || m === 'analog') return m;
    return 'pulse';
  }

  public stepTime(
    inputs: Map<string, ElectricalSignal>,
    dtSimSeconds: number,
    _context: SimulationContext
  ): void {
    const pulseSig = inputs.get('pulse_in');
    const prevHigh = Boolean(this.runtimeState.pulseHigh);
    const currHigh = Boolean(pulseSig?.energized);
    this.runtimeState.pulseHigh = currHigh;

    const mlPerPulse = Math.max(0.05, Number(this.params.mlPerPulse ?? 2.0));
    const maxFlow = this.getMaxFlowLph();

    // Exakte Berechnung auch bei hohem Zeitraffer über pulseDeltaCount / pulseRatePerHour
    let pulseFlowLph = 0;
    if (pulseSig && typeof pulseSig.pulseDeltaCount === 'number' && dtSimSeconds > 0) {
      const liters = (pulseSig.pulseDeltaCount * mlPerPulse) / 1000;
      pulseFlowLph = Math.min(maxFlow, (liters / dtSimSeconds) * 3600);
    } else if (currHigh && !prevHigh && dtSimSeconds > 0) {
      const liters = mlPerPulse / 1000;
      pulseFlowLph = Math.min(maxFlow, (liters / dtSimSeconds) * 3600);
    } else if (pulseSig && typeof pulseSig.pulseRatePerHour === 'number' && pulseSig.pulseRatePerHour > 0) {
      pulseFlowLph = Math.min(maxFlow, (pulseSig.pulseRatePerHour * mlPerPulse) / 1000);
    }

    this.runtimeState.lastPulseRateLph = pulseFlowLph;
  }

  public evaluateElectrical(
    inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext,
    analogInputs?: Map<string, AnalogSignal>
  ): Map<string, ElectricalSignal> {
    const outputs = new Map<string, ElectricalSignal>();

    if (this.fault === 'power_failure' || this.fault === 'short_circuit') {
      this.runtimeState.targetFlowLph = 0;
      this.runtimeState.status = 'fault';
      outputs.set('alarm_out', HIGH_24V);
      return outputs;
    }

    const enSig = inputs.get('en_in');
    this.runtimeState.enable24V = Boolean(enSig?.energized);
    const requireEn = Boolean(this.params.require24VEnable);
    const manualStop = Boolean(this.params.manualStop);

    const mode = this.getOperatingMode();
    const maxFlow = this.getMaxFlowLph();
    const analogSig = analogInputs?.get('analog_in');
    const inMa = analogSig?.unit === 'mA' ? analogSig.value : 4;
    this.runtimeState.analogInMa = inMa;

    let targetFlow = 0;
    if (!manualStop && (!requireEn || Boolean(enSig?.energized))) {
      if (mode === 'manual') {
        targetFlow = Math.max(0, Math.min(maxFlow, Number(this.params.manualFlowLph ?? 5)));
      } else if (mode === 'pulse') {
        const pulseSig = inputs.get('pulse_in');
        const mlPerPulse = Math.max(0.05, Number(this.params.mlPerPulse ?? 2.0));
        if (pulseSig?.pulseRatePerHour && pulseSig.pulseRatePerHour > 0) {
          targetFlow = Math.min(maxFlow, (pulseSig.pulseRatePerHour * mlPerPulse) / 1000);
        } else {
          targetFlow = Math.min(maxFlow, Number(this.runtimeState.lastPulseRateLph ?? 0));
        }
      } else if (mode === 'analog') {
        const minMa = Number(this.params.analogMinMa ?? 4);
        const maxMa = Math.max(minMa + 0.1, Number(this.params.analogMaxMa ?? 20));
        const minPct = Number(this.params.analogMinPct ?? 0);
        const maxPct = Number(this.params.analogMaxPct ?? 100);
        const cutOff = Boolean(this.params.cutOffBelowMinMa ?? true);

        if (cutOff && inMa < minMa - 0.1) {
          targetFlow = 0;
        } else {
          const t = Math.max(0, Math.min(1, (inMa - minMa) / (maxMa - minMa)));
          const pct = minPct + t * (maxPct - minPct);
          targetFlow = Math.max(0, Math.min(maxFlow, (pct / 100) * maxFlow));
        }
      }
    }

    this.runtimeState.targetFlowLph = targetFlow;
    const dryFault = Boolean(this.runtimeState.dryFault);
    outputs.set('alarm_out', dryFault ? HIGH_24V : ZERO_VOLT);
    return outputs;
  }

  public reset(): void {
    super.reset();
    this.runtimeState = {
      targetFlowLph: 0,
      actualFlowLph: 0,
      totalDosedLiters: 0,
      dryFault: false,
      enable24V: false,
      pulseHigh: false,
      lastPulseRateLph: 0,
      analogInMa: 4,
      status: 'standby',
    };
  }
}

export type TeeMode = 'split' | 'merge';

export class FluidTeeComponent extends SimComponent {
  public readonly type = 'fluid_tee';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 148;
  public readonly height = 110;

  constructor(id: string, label = 'T1 T-Stück', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {
      teeMode: 'split' as TeeMode,
    };
    this.runtimeState = {
      activeFlowLph: 0,
      medium: 'water' as FluidMedium,
    };
  }

  public getTeeMode(): TeeMode {
    return this.params.teeMode === 'merge' ? 'merge' : 'split';
  }

  public getPorts(): PortDefinition[] {
    if (this.getTeeMode() === 'merge') {
      return [
        {
          id: 'fluid_in_1',
          label: 'Ein 1',
          description: 'Zulauf 1 (Zusammenführung)',
          domain: 'fluid',
          direction: 'input',
          side: 'left',
          offsetX: 0,
          offsetY: 44,
        },
        {
          id: 'fluid_in_2',
          label: 'Ein 2',
          description: 'Zulauf 2 (Zusammenführung)',
          domain: 'fluid',
          direction: 'input',
          side: 'left',
          offsetX: 0,
          offsetY: 84,
        },
        {
          id: 'fluid_out_1',
          label: 'Aus',
          description: 'Gemeinsamer Ausgang',
          domain: 'fluid',
          direction: 'output',
          side: 'right',
          offsetX: this.width,
          offsetY: 64,
        },
      ];
    }

    return [
      {
        id: 'fluid_in_1',
        label: 'Ein',
        description: 'Gemeinsamer Zulauf',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 64,
      },
      {
        id: 'fluid_out_1',
        label: 'Abg. A',
        description: 'Abgang A',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 44,
      },
      {
        id: 'fluid_out_2',
        label: 'Abg. B',
        description: 'Abgang B',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 84,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return [];
  }

  public getActiveFluidPaths(): [string, string][] {
    if (this.getTeeMode() === 'merge') {
      return [
        ['fluid_in_1', 'fluid_out_1'],
        ['fluid_in_2', 'fluid_out_1'],
      ];
    }
    return [
      ['fluid_in_1', 'fluid_out_1'],
      ['fluid_in_1', 'fluid_out_2'],
    ];
  }
}

export class InjectionPointComponent extends SimComponent {
  public readonly type = 'injection_point';
  public readonly category: ComponentCategory = 'fluid';
  public readonly width = 200;
  public readonly height = 132;

  constructor(id: string, label = 'I1 Impfstelle', x = 0, y = 0) {
    super(id, label, x, y);
    this.params = {};
    this.runtimeState = {
      mainFlowLph: 0,
      dosingFlowLph: 0,
      totalFlowLph: 0,
      concentrationPpm: 0,
      dosingMedium: 'anolyte' as FluidMedium,
    };
  }

  public getPorts(): PortDefinition[] {
    return [
      {
        id: 'main_in',
        label: 'Hauptstrom',
        description: 'Wasser-Hauptleitung nach Wasserzähler',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 48,
      },
      {
        id: 'dosing_in',
        label: 'Impfung',
        description: 'Dosiermittel-Eingang (z. B. Anolyt von DDA)',
        domain: 'fluid',
        direction: 'input',
        side: 'left',
        offsetX: 0,
        offsetY: 98,
      },
      {
        id: 'fluid_out',
        label: 'Gemisch',
        description: 'Geimpftes Gesamtwasser',
        domain: 'fluid',
        direction: 'output',
        side: 'right',
        offsetX: this.width,
        offsetY: 72,
      },
    ];
  }

  public getSupportedFaults(): ComponentFaultType[] {
    return [];
  }

  public getActiveFluidPaths(): [string, string][] {
    return [
      ['main_in', 'fluid_out'],
      ['dosing_in', 'fluid_out'],
    ];
  }
}
