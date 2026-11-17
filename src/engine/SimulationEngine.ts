import { ComponentRegistry } from './ComponentRegistry';
import { SimComponent, ZERO_ANALOG_MA, ZERO_VOLT } from './SimComponent';
import {
  DosingPumpComponent,
  DrainConsumerComponent,
  FluidTeeComponent,
  GeneratorComponent,
  GullyDrainComponent,
  InjectionPointComponent,
  MainWaterLineComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
  WaterMeterComponent,
} from './components/FluidComponents';
import { PowerSupply24V, SwitchComponent } from './components/PowerAndSwitch';
import { ContactorRelayComponent, TimerRelayComponent } from './components/Relays';
import { LogicGateComponent } from './components/SignalAndLogic';
import { TerminalBlockComponent } from './components/TerminalBlock';
import {
  AnalogSignal,
  ComponentFaultType,
  Connection,
  ConnectionFaultType,
  ElectricalSignal,
  FaultReportItem,
  FluidMedium,
  FluidSignal,
  SerializedCircuit,
  SimulationContext,
} from './types';

interface FluidPathTrace {
  targetComponent: SimComponent | null;
  targetPortId: string;
  openTerminalEnd: boolean;
  connectionIds: string[];
  valveIds: string[];
  meterIds: string[];
  injectionStops: Array<{ comp: InjectionPointComponent; portId: string }>;
  maxFlowCapLph: number;
}

export class SimulationEngine {
  public components: Map<string, SimComponent> = new Map();
  public connections: Connection[] = [];
  public totalSimSeconds = 0;

  private getContext(shortedSupplies?: Set<string>): SimulationContext {
    return {
      getComponentById: (id: string) => this.components.get(id),
      getAllComponents: () => Array.from(this.components.values()),
      getDownstreamLoadAmps: (compId: string, outPortId: string) =>
        this.computeDownstreamLoadAmps(compId, outPortId),
      isSupplyShortCircuited: (powerId: string) => shortedSupplies?.has(powerId) ?? false,
      totalSimSeconds: this.totalSimSeconds,
    };
  }

  public addComponent(component: SimComponent): void {
    this.components.set(component.id, component);
    this.evaluateInstant();
  }

  public removeComponent(id: string): void {
    this.components.delete(id);
    this.connections = this.connections.filter(
      (c) => c.fromComponentId !== id && c.toComponentId !== id
    );
    for (const comp of this.components.values()) {
      if (comp.type === 'float_probe' && comp.params.tankId === id) {
        comp.params.tankId = '';
      }
    }
    this.evaluateInstant();
  }

  public addConnection(
    fromComponentId: string,
    fromPortId: string,
    toComponentId: string,
    toPortId: string
  ): Connection | null {
    const fromComp = this.components.get(fromComponentId);
    const toComp = this.components.get(toComponentId);
    if (!fromComp || !toComp) return null;
    if (fromComponentId === toComponentId && fromPortId === toPortId) return null;

    const fromPort = fromComp.getPorts().find((p) => p.id === fromPortId);
    const toPort = toComp.getPorts().find((p) => p.id === toPortId);
    if (!fromPort || !toPort) return null;
    if (fromPort.domain !== toPort.domain) return null;

    let srcCompId = fromComponentId;
    let srcPortId = fromPortId;
    let dstCompId = toComponentId;
    let dstPortId = toPortId;

    const isElecBridge =
      fromPort.domain === 'electrical' &&
      fromPort.direction === 'input' &&
      toPort.direction === 'input';

    if (fromPort.domain === 'electrical') {
      // Erlaubt: Ausgang <-> Eingang (auch auf demselben Bauteil) sowie Eingang <-> Eingang (Brücke)
      if (fromPort.direction === 'output' && toPort.direction === 'output') {
        return null;
      }
      if (fromPort.direction === 'input' && toPort.direction === 'output') {
        srcCompId = toComponentId;
        srcPortId = toPortId;
        dstCompId = fromComponentId;
        dstPortId = fromPortId;
      }
    } else {
      // Fluid & Analog bleiben streng gerichtet zwischen verschiedenen Bauteilen
      if (fromComponentId === toComponentId) return null;
      if (fromPort.direction === 'input' && toPort.direction === 'output') {
        srcCompId = toComponentId;
        srcPortId = toPortId;
        dstCompId = fromComponentId;
        dstPortId = fromPortId;
      } else if (fromPort.direction === toPort.direction) {
        return null;
      }
    }

    const duplicate = this.connections.find(
      (c) =>
        (c.fromComponentId === srcCompId &&
          c.fromPortId === srcPortId &&
          c.toComponentId === dstCompId &&
          c.toPortId === dstPortId) ||
        (isElecBridge &&
          c.fromComponentId === dstCompId &&
          c.fromPortId === dstPortId &&
          c.toComponentId === srcCompId &&
          c.toPortId === srcPortId)
    );
    if (duplicate) return null;

    const conn: Connection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      domain: fromPort.domain,
      fromComponentId: srcCompId,
      fromPortId: srcPortId,
      toComponentId: dstCompId,
      toPortId: dstPortId,
      fault: 'none',
      active: false,
      voltage: 0,
      flowRateLph: 0,
    };

    this.connections = [...this.connections, conn];
    this.evaluateInstant();
    return conn;
  }

  public removeConnection(connectionId: string): void {
    this.connections = this.connections.filter((c) => c.id !== connectionId);
    this.evaluateInstant();
  }

  /** Entfernt ungültige Verbindungen nach einer Port-Layout-Änderung (z. B. Lanze ausgeschaltet) */
  public pruneInvalidConnectionsForComponent(componentId: string): void {
    const comp = this.components.get(componentId);
    if (!comp) return;
    const validPortIds = new Set(comp.getPorts().map((p) => p.id));
    this.connections = this.connections.filter((c) => {
      if (c.fromComponentId === componentId && !validPortIds.has(c.fromPortId)) return false;
      if (c.toComponentId === componentId && !validPortIds.has(c.toPortId)) return false;
      return true;
    });
    this.evaluateInstant();
  }

  /** Fügt ein T-Stück oder eine Impfstelle direkt in eine bestehende Fluidleitung ein */
  public insertFluidComponentOnConnection(
    connectionId: string,
    newType: 'fluid_tee' | 'injection_point'
  ): SimComponent | null {
    const conn = this.connections.find((c) => c.id === connectionId && c.domain === 'fluid');
    if (!conn) return null;

    const fromComp = this.components.get(conn.fromComponentId);
    const toComp = this.components.get(conn.toComponentId);
    if (!fromComp || !toComp) return null;

    const p1 = fromComp.getPortWorldPosition(conn.fromPortId);
    const p2 = toComp.getPortWorldPosition(conn.toPortId);
    if (!p1 || !p2) return null;

    const meta = ComponentRegistry.getMeta(newType);
    if (!meta) return null;

    const existingCount = Array.from(this.components.values()).filter(
      (c) => c.type === newType
    ).length;
    const prefix = newType === 'fluid_tee' ? `T${existingCount + 1} T-Stück` : `I${existingCount + 1} Impfstelle`;
    const newId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const x = Math.round(((p1.x + p2.x) / 2 - meta.width / 2) / 4) * 4;
    const y = Math.round(((p1.y + p2.y) / 2 - meta.height / 2) / 4) * 4;

    const newComp = ComponentRegistry.create(newType, newId, x, y, prefix);
    this.components.set(newComp.id, newComp);

    // Alte Verbindung ersetzen
    this.connections = this.connections.filter((c) => c.id !== connectionId);

    const inPortId = newType === 'fluid_tee' ? 'fluid_in_1' : 'main_in';
    const outPortId = newType === 'fluid_tee' ? 'fluid_out_1' : 'fluid_out';

    this.addConnection(conn.fromComponentId, conn.fromPortId, newComp.id, inPortId);
    this.addConnection(newComp.id, outPortId, conn.toComponentId, conn.toPortId);
    this.evaluateInstant();
    return newComp;
  }

  public reset(): void {
    this.totalSimSeconds = 0;
    for (const comp of this.components.values()) {
      comp.reset();
    }
    this.evaluateInstant();
  }

  public clearAll(): void {
    this.components.clear();
    this.connections = [];
    this.totalSimSeconds = 0;
  }

  public loadCircuit(circuit: SerializedCircuit): void {
    this.components.clear();
    this.connections = [];
    this.totalSimSeconds = 0;

    for (const item of circuit.components) {
      const comp = ComponentRegistry.deserialize(item);
      this.components.set(comp.id, comp);
    }

    for (const conn of circuit.connections) {
      const fromComp = this.components.get(conn.fromComponentId);
      const toComp = this.components.get(conn.toComponentId);
      if (!fromComp || !toComp) continue;

      let fromPortId = conn.fromPortId;
      let toPortId = conn.toPortId;

      // Abwärtskompatibilität für alte Port-IDs (v1.0–v1.7)
      if (fromComp instanceof GeneratorComponent && fromPortId === 'fluid_out') {
        fromPortId = 'fluid_anolyte';
      }
      if (toComp instanceof GeneratorComponent && toPortId === 'enable_in') {
        toPortId = 'v24_in';
      }
      if (toComp instanceof SolenoidValve32Component && toPortId === 'p_in') {
        toPortId = 'fluid_p';
      }
      if (fromComp instanceof SolenoidValve32Component) {
        if (fromPortId === 'a_out') fromPortId = 'fluid_a';
        if (fromPortId === 'b_out') fromPortId = 'fluid_b';
      }
      if (toComp instanceof SolenoidValve22Component && toPortId === 'p_in') {
        toPortId = 'fluid_in';
      }
      if (fromComp instanceof SolenoidValve22Component && fromPortId === 'a_out') {
        fromPortId = 'fluid_out';
      }
      if (toComp instanceof DrainConsumerComponent && toPortId === 'ctrl_in') {
        toPortId = 'v24_in';
      }

      this.connections.push({
        ...conn,
        fromPortId,
        toPortId,
        fault: conn.fault ?? 'none',
        active: false,
        voltage: 0,
        flowRateLph: 0,
      });
    }

    this.evaluateInstant();
  }

  public serializeCircuit(name = 'Mechatronik Anlage'): SerializedCircuit {
    return {
      version: 3,
      name,
      components: Array.from(this.components.values()).map((c) => c.serialize()),
      connections: this.connections.map(
        ({ id, domain, fromComponentId, fromPortId, toComponentId, toPortId, fault }) => ({
          id,
          domain,
          fromComponentId,
          fromPortId,
          toComponentId,
          toPortId,
          fault: fault ?? 'none',
        })
      ),
    };
  }

  public evaluateInstant(): void {
    this.solveElectricalAndAnalogNetwork();
    this.solveFluidNetwork(0);
    this.solveElectricalAndAnalogNetwork();
  }

  public step(dtSimSeconds: number): void {
    if (dtSimSeconds <= 0) {
      this.evaluateInstant();
      return;
    }

    this.totalSimSeconds += dtSimSeconds;
    const context = this.getContext();

    const { electricalInputs } = this.solveElectricalAndAnalogNetwork();

    for (const comp of this.components.values()) {
      const inputs = electricalInputs.get(comp.id) ?? new Map<string, ElectricalSignal>();
      comp.stepTime(inputs, dtSimSeconds, context);
    }

    this.solveElectricalAndAnalogNetwork();
    this.solveFluidNetwork(dtSimSeconds);
    this.solveElectricalAndAnalogNetwork();
  }

  private isElectricalBridgeConnection(conn: Connection): boolean {
    if (conn.domain !== 'electrical') return false;
    const fromPort = this.components
      .get(conn.fromComponentId)
      ?.getPorts()
      .find((p) => p.id === conn.fromPortId);
    const toPort = this.components
      .get(conn.toComponentId)
      ?.getPorts()
      .find((p) => p.id === conn.toPortId);
    return fromPort?.direction === 'input' && toPort?.direction === 'input';
  }

  /**
   * Ermittelt, ob ein 24V-Netzteil durch einen nachgeschalteten Kurzschluss überlastet ist.
   */
  private detectShortCircuitedSupplies(): Set<string> {
    const shortedSupplies = new Set<string>();
    const elecConns = this.connections.filter(
      (c) => c.domain === 'electrical' && c.fault !== 'open_circuit'
    );

    for (const comp of this.components.values()) {
      if (!(comp instanceof PowerSupply24V)) continue;
      if (!Boolean(comp.params.enabled ?? true) || comp.fault === 'power_failure') continue;
      if (comp.fault === 'short_circuit') {
        shortedSupplies.add(comp.id);
        continue;
      }

      const visitedComps = new Set<string>([comp.id]);
      const visitedInputNodes = new Set<string>();
      const compQueue: string[] = [comp.id];
      const inputQueue: Array<{ compId: string; portId: string }> = [];

      const enqueueInputNode = (cId: string, pId: string) => {
        const key = `${cId}:${pId}`;
        if (visitedInputNodes.has(key)) return;
        visitedInputNodes.add(key);
        inputQueue.push({ compId: cId, portId: pId });
      };

      while (compQueue.length > 0 || inputQueue.length > 0) {
        while (compQueue.length > 0) {
          const currId = compQueue.shift()!;
          const srcComp = this.components.get(currId);
          if (!srcComp) continue;

          const outgoing = elecConns.filter(
            (c) => c.fromComponentId === currId && !this.isElectricalBridgeConnection(c)
          );

          for (const conn of outgoing) {
            if (!this.isPathConductingThroughComponent(srcComp, conn.fromPortId)) {
              continue;
            }
            if (conn.fault === 'short_circuit') {
              shortedSupplies.add(comp.id);
              break;
            }
            const dst = this.components.get(conn.toComponentId);
            if (!dst) continue;
            if (dst.fault === 'short_circuit') {
              shortedSupplies.add(comp.id);
              break;
            }
            enqueueInputNode(dst.id, conn.toPortId);
            if (!visitedComps.has(dst.id)) {
              visitedComps.add(dst.id);
              compQueue.push(dst.id);
            }
          }
          if (shortedSupplies.has(comp.id)) break;
        }
        if (shortedSupplies.has(comp.id)) break;

        while (inputQueue.length > 0) {
          const node = inputQueue.shift()!;
          for (const bridge of elecConns) {
            if (!this.isElectricalBridgeConnection(bridge)) continue;
            let nextCompId: string | null = null;
            let nextPortId: string | null = null;
            if (bridge.fromComponentId === node.compId && bridge.fromPortId === node.portId) {
              nextCompId = bridge.toComponentId;
              nextPortId = bridge.toPortId;
            } else if (bridge.toComponentId === node.compId && bridge.toPortId === node.portId) {
              nextCompId = bridge.fromComponentId;
              nextPortId = bridge.fromPortId;
            }
            if (!nextCompId || !nextPortId) continue;

            if (bridge.fault === 'short_circuit') {
              shortedSupplies.add(comp.id);
              break;
            }
            const dst = this.components.get(nextCompId);
            if (!dst) continue;
            if (dst.fault === 'short_circuit') {
              shortedSupplies.add(comp.id);
              break;
            }
            enqueueInputNode(nextCompId, nextPortId);
            if (!visitedComps.has(nextCompId)) {
              visitedComps.add(nextCompId);
              compQueue.push(nextCompId);
            }
          }
          if (shortedSupplies.has(comp.id)) break;
        }
      }
    }

    return shortedSupplies;
  }

  private isPathConductingThroughComponent(comp: SimComponent, outputPortId: string): boolean {
    if (comp instanceof PowerSupply24V) {
      return Boolean(comp.params.enabled ?? true) && comp.fault !== 'power_failure';
    }
    if (comp instanceof TerminalBlockComponent) {
      return Boolean(comp.runtimeState.inputEnergized) && outputPortId.startsWith('out_');
    }
    if (comp instanceof SwitchComponent) {
      return comp.isContactClosed();
    }
    if (comp instanceof TimerRelayComponent) {
      const switched = Boolean(comp.runtimeState.contactSwitched);
      if (outputPortId === 'nc_16') return !switched;
      if (outputPortId === 'no_18') return switched;
      return false;
    }
    if (comp instanceof ContactorRelayComponent) {
      const on = Boolean(comp.runtimeState.coilEnergized);
      if (outputPortId === 'nc_12' || outputPortId === 'nc_22') return !on;
      if (outputPortId === 'no_14' || outputPortId === 'no_24') return on;
      return false;
    }
    if (comp.type === 'current_transformer' && outputPortId === 'out') {
      return Boolean(comp.runtimeState.inputEnergized);
    }
    if (comp instanceof LogicGateComponent && outputPortId === 'q') {
      return Boolean(comp.runtimeState.out);
    }
    return false;
  }

  private computeDownstreamLoadAmps(startCompId: string, startPortId: string): number {
    const elecConns = this.connections.filter(
      (c) => c.domain === 'electrical' && c.fault !== 'open_circuit'
    );
    const visitedComps = new Set<string>();
    const visitedInputNodes = new Set<string>();
    const queue: Array<{ compId: string; portId: string | null }> = [
      { compId: startCompId, portId: startPortId },
    ];
    const bridgeQueue: Array<{ compId: string; portId: string }> = [];
    let totalAmps = 0;

    const visitTarget = (dstId: string, dstPortId: string) => {
      const key = `${dstId}:${dstPortId}`;
      if (!visitedInputNodes.has(key)) {
        visitedInputNodes.add(key);
        bridgeQueue.push({ compId: dstId, portId: dstPortId });
      }
      const dst = this.components.get(dstId);
      if (!dst || visitedComps.has(dst.id)) return;
      visitedComps.add(dst.id);
      totalAmps += dst.getElectricalLoadAmps();

      for (const outP of dst.getPorts()) {
        if (outP.domain === 'electrical' && outP.direction === 'output') {
          if (this.isPathConductingThroughComponent(dst, outP.id)) {
            queue.push({ compId: dst.id, portId: outP.id });
          }
        }
      }
    };

    while (queue.length > 0 || bridgeQueue.length > 0) {
      while (queue.length > 0) {
        const { compId, portId } = queue.shift()!;
        const outgoing = elecConns.filter(
          (c) =>
            !this.isElectricalBridgeConnection(c) &&
            c.fromComponentId === compId &&
            (portId === null || c.fromPortId === portId)
        );

        for (const conn of outgoing) {
          if (conn.fault === 'short_circuit') {
            totalAmps += 25.0;
            continue;
          }
          visitTarget(conn.toComponentId, conn.toPortId);
        }
      }

      while (bridgeQueue.length > 0) {
        const node = bridgeQueue.shift()!;
        for (const bridge of elecConns) {
          if (!this.isElectricalBridgeConnection(bridge)) continue;
          let nextCompId: string | null = null;
          let nextPortId: string | null = null;
          if (bridge.fromComponentId === node.compId && bridge.fromPortId === node.portId) {
            nextCompId = bridge.toComponentId;
            nextPortId = bridge.toPortId;
          } else if (bridge.toComponentId === node.compId && bridge.toPortId === node.portId) {
            nextCompId = bridge.fromComponentId;
            nextPortId = bridge.fromPortId;
          }
          if (!nextCompId || !nextPortId) continue;

          if (bridge.fault === 'short_circuit') {
            totalAmps += 25.0;
            continue;
          }
          visitTarget(nextCompId, nextPortId);
        }
      }
    }

    return totalAmps;
  }

  private solveElectricalAndAnalogNetwork(): {
    electricalInputs: Map<string, Map<string, ElectricalSignal>>;
    analogInputs: Map<string, Map<string, AnalogSignal>>;
  } {
    const shortedSupplies = this.detectShortCircuitedSupplies();
    const context = this.getContext(shortedSupplies);

    const electricalConns = this.connections.filter((c) => c.domain === 'electrical');
    const analogConns = this.connections.filter((c) => c.domain === 'analog');

    const outputElectrical = new Map<string, Map<string, ElectricalSignal>>();
    const inputElectrical = new Map<string, Map<string, ElectricalSignal>>();
    const outputAnalog = new Map<string, Map<string, AnalogSignal>>();
    const inputAnalog = new Map<string, Map<string, AnalogSignal>>();

    for (const comp of this.components.values()) {
      outputElectrical.set(comp.id, new Map());
      inputElectrical.set(comp.id, new Map());
      outputAnalog.set(comp.id, new Map());
      inputAnalog.set(comp.id, new Map());
    }

    const MAX_PASSES = 16;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let changed = false;

      for (const comp of this.components.values()) {
        const eIn = new Map<string, ElectricalSignal>();
        const aIn = new Map<string, AnalogSignal>();
        for (const port of comp.getPorts()) {
          if (port.domain === 'electrical' && port.direction === 'input') {
            eIn.set(port.id, ZERO_VOLT);
          } else if (port.domain === 'analog' && port.direction === 'input') {
            aIn.set(port.id, ZERO_ANALOG_MA);
          }
        }
        inputElectrical.set(comp.id, eIn);
        inputAnalog.set(comp.id, aIn);
      }

      const directElecConns: Connection[] = [];
      const bridgeElecConns: Connection[] = [];
      for (const conn of electricalConns) {
        if (conn.fault === 'open_circuit' || conn.fault === 'short_circuit') continue;
        if (this.isElectricalBridgeConnection(conn)) {
          bridgeElecConns.push(conn);
        } else {
          directElecConns.push(conn);
        }
      }

      for (const conn of directElecConns) {
        const srcOutputs = outputElectrical.get(conn.fromComponentId);
        const sig = srcOutputs?.get(conn.fromPortId) ?? ZERO_VOLT;
        const dstInputs = inputElectrical.get(conn.toComponentId);
        if (!dstInputs) continue;

        if (sig.energized || (sig.pulseDeltaCount && sig.pulseDeltaCount > 0) || (sig.pulseRatePerHour && sig.pulseRatePerHour > 0)) {
          const existing = dstInputs.get(conn.toPortId);
          const mergedPulseDelta =
            (existing?.pulseDeltaCount ?? 0) + (sig.pulseDeltaCount ?? 0);
          const mergedPulseRate = Math.max(
            existing?.pulseRatePerHour ?? 0,
            sig.pulseRatePerHour ?? 0
          );
          const nextSig: ElectricalSignal = {
            domain: 'electrical',
            energized: Boolean(existing?.energized) || sig.energized,
            voltage: Math.max(existing?.voltage ?? 0, sig.energized ? sig.voltage : 0),
            pulseDeltaCount: mergedPulseDelta > 0 ? mergedPulseDelta : undefined,
            pulseRatePerHour: mergedPulseRate > 0 ? mergedPulseRate : undefined,
          };
          dstInputs.set(conn.toPortId, nextSig);
        }
      }

      // Elektrische Brücken (Eingang <-> Eingang, z. B. A1 -> 15 oder K1.A1 -> K2.A1) bidirektional ausbreiten
      if (bridgeElecConns.length > 0) {
        const mergeBridgeSide = (
          srcCompId: string,
          srcPortId: string,
          dstCompId: string,
          dstPortId: string
        ): boolean => {
          const srcSig = inputElectrical.get(srcCompId)?.get(srcPortId);
          if (!srcSig) return false;
          const hasActivity =
            srcSig.energized ||
            (srcSig.pulseDeltaCount && srcSig.pulseDeltaCount > 0) ||
            (srcSig.pulseRatePerHour && srcSig.pulseRatePerHour > 0);
          if (!hasActivity) return false;

          const dstMap = inputElectrical.get(dstCompId);
          if (!dstMap) return false;
          const prevDst = dstMap.get(dstPortId) ?? ZERO_VOLT;

          const nextEnergized = Boolean(prevDst.energized) || srcSig.energized;
          const nextVoltage = Math.max(prevDst.voltage ?? 0, srcSig.energized ? srcSig.voltage : 0);
          const nextDelta = Math.max(prevDst.pulseDeltaCount ?? 0, srcSig.pulseDeltaCount ?? 0);
          const nextRate = Math.max(prevDst.pulseRatePerHour ?? 0, srcSig.pulseRatePerHour ?? 0);

          if (
            nextEnergized !== Boolean(prevDst.energized) ||
            nextVoltage !== (prevDst.voltage ?? 0) ||
            nextDelta !== (prevDst.pulseDeltaCount ?? 0) ||
            nextRate !== (prevDst.pulseRatePerHour ?? 0)
          ) {
            dstMap.set(dstPortId, {
              domain: 'electrical',
              energized: nextEnergized,
              voltage: nextVoltage,
              pulseDeltaCount: nextDelta > 0 ? nextDelta : undefined,
              pulseRatePerHour: nextRate > 0 ? nextRate : undefined,
            });
            return true;
          }
          return false;
        };

        for (let hop = 0; hop <= bridgeElecConns.length; hop++) {
          let bridgeChanged = false;
          for (const b of bridgeElecConns) {
            if (mergeBridgeSide(b.fromComponentId, b.fromPortId, b.toComponentId, b.toPortId)) {
              bridgeChanged = true;
            }
            if (mergeBridgeSide(b.toComponentId, b.toPortId, b.fromComponentId, b.fromPortId)) {
              bridgeChanged = true;
            }
          }
          if (!bridgeChanged) break;
        }
      }

      for (const conn of analogConns) {
        if (conn.fault === 'open_circuit' || conn.fault === 'short_circuit') continue;
        const srcAnalog = outputAnalog.get(conn.fromComponentId);
        const sig = srcAnalog?.get(conn.fromPortId);
        if (sig) {
          const dstInputs = inputAnalog.get(conn.toComponentId);
          if (dstInputs) {
            dstInputs.set(conn.toPortId, sig);
          }
        }
      }

      for (const comp of this.components.values()) {
        const eIn = inputElectrical.get(comp.id) ?? new Map();
        const aIn = inputAnalog.get(comp.id) ?? new Map();

        const nextE = comp.evaluateElectrical(eIn, context, aIn);
        const prevE = outputElectrical.get(comp.id)!;
        for (const [portId, sig] of nextE.entries()) {
          const prev = prevE.get(portId);
          if (
            !prev ||
            prev.energized !== sig.energized ||
            prev.voltage !== sig.voltage ||
            prev.pulseDeltaCount !== sig.pulseDeltaCount ||
            prev.pulseRatePerHour !== sig.pulseRatePerHour
          ) {
            changed = true;
          }
          prevE.set(portId, sig);
        }

        const nextA = comp.evaluateAnalog(aIn, eIn, context);
        const prevA = outputAnalog.get(comp.id)!;
        for (const [portId, sig] of nextA.entries()) {
          const prev = prevA.get(portId);
          if (
            !prev ||
            prev.value !== sig.value ||
            prev.unit !== sig.unit ||
            prev.active !== sig.active
          ) {
            changed = true;
          }
          prevA.set(portId, sig);
        }
      }

      if (!changed) break;
    }

    for (const comp of this.components.values()) {
      for (const [pId, sig] of (inputElectrical.get(comp.id) ?? new Map()).entries()) {
        comp.portSignals.set(pId, sig);
      }
      for (const [pId, sig] of (outputElectrical.get(comp.id) ?? new Map()).entries()) {
        comp.portSignals.set(pId, sig);
      }
      for (const [pId, sig] of (inputAnalog.get(comp.id) ?? new Map()).entries()) {
        comp.portSignals.set(pId, sig);
      }
      for (const [pId, sig] of (outputAnalog.get(comp.id) ?? new Map()).entries()) {
        comp.portSignals.set(pId, sig);
      }
    }

    for (const conn of electricalConns) {
      if (conn.fault === 'open_circuit' || conn.fault === 'short_circuit') {
        conn.active = false;
        conn.voltage = 0;
        continue;
      }
      if (this.isElectricalBridgeConnection(conn)) {
        const sig = inputElectrical.get(conn.fromComponentId)?.get(conn.fromPortId) ?? ZERO_VOLT;
        conn.active = sig.energized;
        conn.voltage = sig.voltage;
      } else {
        const sig = outputElectrical.get(conn.fromComponentId)?.get(conn.fromPortId) ?? ZERO_VOLT;
        conn.active = sig.energized;
        conn.voltage = sig.voltage;
      }
    }

    for (const conn of analogConns) {
      if (conn.fault === 'open_circuit' || conn.fault === 'short_circuit') {
        conn.active = false;
        conn.analogValue = 0;
        continue;
      }
      const sig = outputAnalog.get(conn.fromComponentId)?.get(conn.fromPortId);
      conn.active = Boolean(sig?.active);
      conn.analogValue = sig?.value ?? 0;
      conn.analogUnit = sig?.unit ?? 'mA';
    }

    return { electricalInputs: inputElectrical, analogInputs: inputAnalog };
  }

  /** Findet für die Saugseite einer Dosierpumpe den vorgeschalteten Vorratsbehälter */
  private findUpstreamTankForPump(
    pumpId: string
  ): { tank: TankComponent; connIds: string[]; valveIds: string[]; maxCap: number } | null {
    const fluidConns = this.connections.filter(
      (c) => c.domain === 'fluid' && c.fault !== 'open_circuit'
    );
    const visited = new Set<string>();

    const dfsUp = (
      compId: string,
      portId: string,
      connTrail: string[],
      valveTrail: string[],
      cap: number
    ): { tank: TankComponent; connIds: string[]; valveIds: string[]; maxCap: number } | null => {
      const key = `${compId}:${portId}`;
      if (visited.has(key)) return null;
      visited.add(key);

      const incoming = fluidConns.filter(
        (c) => c.toComponentId === compId && c.toPortId === portId
      );

      for (const conn of incoming) {
        const src = this.components.get(conn.fromComponentId);
        if (!src) continue;
        const nextConns = [...connTrail, conn.id];

        if (src instanceof TankComponent) {
          return {
            tank: src,
            connIds: nextConns,
            valveIds: valveTrail,
            maxCap: cap,
          };
        }

        const activePaths = src.getActiveFluidPaths();
        for (const [inP, outP] of activePaths) {
          if (outP === conn.fromPortId) {
            let nextCap = cap;
            if (src instanceof SolenoidValve22Component) {
              nextCap = Math.min(nextCap, src.getFlowRateLimitLph());
            }
            const res = dfsUp(
              src.id,
              inP,
              nextConns,
              [...valveTrail, src.id],
              nextCap
            );
            if (res) return res;
          }
        }
      }
      return null;
    };

    return dfsUp(pumpId, 'fluid_in', [], [], Number.POSITIVE_INFINITY);
  }

  private solveFluidNetwork(dtSimSeconds: number): void {
    const fluidConns = this.connections.filter((c) => c.domain === 'fluid');

    for (const conn of fluidConns) {
      conn.active = false;
      conn.flowRateLph = 0;
      conn.medium = undefined;
    }

    const tankInflow = new Map<string, number>();
    const tankOutflow = new Map<string, number>();
    const valveFlow = new Map<string, number>();
    const meterFlow = new Map<string, number>();
    const teeFlow = new Map<string, { flow: number; medium: FluidMedium }>();
    const gullyFlow = new Map<string, { flow: number; medium: FluidMedium }>();
    const injectionAcc = new Map<
      string,
      { mainFlow: number; dosingFlow: number; dosingMedium: FluidMedium }
    >();

    for (const comp of this.components.values()) {
      if (comp instanceof TankComponent) {
        tankInflow.set(comp.id, 0);
        tankOutflow.set(comp.id, 0);
      } else if (comp instanceof SolenoidValve22Component || comp instanceof SolenoidValve32Component) {
        comp.runtimeState.activeFlowLph = 0;
        valveFlow.set(comp.id, 0);
      } else if (comp instanceof DrainConsumerComponent) {
        comp.runtimeState.actualFlowLph = 0;
      } else if (comp instanceof GeneratorComponent) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.actualAnolyteLph = 0;
        comp.runtimeState.actualKatholyteLph = 0;
      } else if (comp instanceof WaterMeterComponent) {
        comp.runtimeState.currentFlowLph = 0;
        meterFlow.set(comp.id, 0);
      } else if (comp instanceof MainWaterLineComponent) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.flowing = false;
      } else if (comp instanceof GullyDrainComponent) {
        comp.runtimeState.actualFlowLph = 0;
        gullyFlow.set(comp.id, { flow: 0, medium: 'water' });
      } else if (comp instanceof FluidTeeComponent) {
        comp.runtimeState.activeFlowLph = 0;
        teeFlow.set(comp.id, { flow: 0, medium: 'water' });
      } else if (comp instanceof InjectionPointComponent) {
        injectionAcc.set(comp.id, {
          mainFlow: 0,
          dosingFlow: 0,
          dosingMedium: 'anolyte',
        });
      } else if (comp instanceof DosingPumpComponent) {
        comp.runtimeState.actualFlowLph = 0;
      }
    }

    const addConnFlow = (connId: string, flowLph: number, medium: FluidMedium) => {
      const conn = fluidConns.find((c) => c.id === connId);
      if (!conn || flowLph <= 0) return;
      conn.flowRateLph = (conn.flowRateLph ?? 0) + flowLph;
      conn.active = true;
      if (!conn.medium || medium !== 'water') {
        conn.medium = medium;
      }
    };

    const traceDownstream = (startCompId: string, startPortId: string): FluidPathTrace[] => {
      const results: FluidPathTrace[] = [];

      const dfs = (
        compId: string,
        portId: string,
        visited: Set<string>,
        connTrail: string[],
        valveTrail: string[],
        meterTrail: string[],
        injectionStops: Array<{ comp: InjectionPointComponent; portId: string }>,
        capLph: number
      ) => {
        const key = `${compId}:${portId}`;
        if (visited.has(key)) return;
        const nextVisited = new Set(visited);
        nextVisited.add(key);

        const outgoing = fluidConns.filter(
          (c) =>
            c.fromComponentId === compId &&
            c.fromPortId === portId &&
            c.fault !== 'open_circuit'
        );

        for (const conn of outgoing) {
          const target = this.components.get(conn.toComponentId);
          if (!target) continue;

          const nextConns = [...connTrail, conn.id];

          if (
            target instanceof TankComponent ||
            target instanceof DrainConsumerComponent ||
            target instanceof GullyDrainComponent
          ) {
            results.push({
              targetComponent: target,
              targetPortId: conn.toPortId,
              openTerminalEnd: false,
              connectionIds: nextConns,
              valveIds: valveTrail,
              meterIds: meterTrail,
              injectionStops,
              maxFlowCapLph: capLph,
            });
            continue;
          }

          if (target instanceof DosingPumpComponent) {
            // Dosierpumpen werden separat über Saug/Druck gelöst
            continue;
          }

          const nextInj =
            target instanceof InjectionPointComponent
              ? [...injectionStops, { comp: target, portId: conn.toPortId }]
              : injectionStops;
          const nextMeters =
            target instanceof WaterMeterComponent ? [...meterTrail, target.id] : meterTrail;
          const nextValves = [...valveTrail, target.id];
          let nextCap = capLph;
          if (target instanceof SolenoidValve22Component) {
            nextCap = Math.min(nextCap, target.getFlowRateLimitLph());
          }

          const activePaths = target.getActiveFluidPaths();
          let pushedForward = false;
          for (const [inP, outP] of activePaths) {
            if (inP === conn.toPortId) {
              // Prüfe, ob am Ausgang dieses Durchgangselements noch eine Leitung hängt
              const hasDownstreamWire = fluidConns.some(
                (c2) =>
                  c2.fromComponentId === target.id &&
                  c2.fromPortId === outP &&
                  c2.fault !== 'open_circuit'
              );
              if (hasDownstreamWire) {
                dfs(
                  target.id,
                  outP,
                  nextVisited,
                  nextConns,
                  nextValves,
                  nextMeters,
                  nextInj,
                  nextCap
                );
                pushedForward = true;
              } else if (
                target instanceof InjectionPointComponent ||
                target instanceof WaterMeterComponent
              ) {
                // Impfstelle / Wasserzähler ohne weiteren End-Gulli gilt als offene Ausgangsleitung ins Netz
                results.push({
                  targetComponent: target,
                  targetPortId: conn.toPortId,
                  openTerminalEnd: true,
                  connectionIds: nextConns,
                  valveIds: nextValves,
                  meterIds: nextMeters,
                  injectionStops: nextInj,
                  maxFlowCapLph: nextCap,
                });
                pushedForward = true;
              }
            }
          }

          if (!pushedForward && activePaths.length === 0) {
            // Ventil ist geschlossen -> blockiert
          }
        }
      };

      dfs(startCompId, startPortId, new Set(), [], [], [], [], Number.POSITIVE_INFINITY);
      return results;
    };

    const recordTraceFlow = (
      trace: FluidPathTrace,
      flowLph: number,
      medium: FluidMedium
    ) => {
      if (flowLph <= 0) return;

      if (trace.targetComponent instanceof TankComponent && !trace.openTerminalEnd) {
        tankInflow.set(
          trace.targetComponent.id,
          (tankInflow.get(trace.targetComponent.id) ?? 0) + flowLph
        );
      } else if (trace.targetComponent instanceof DrainConsumerComponent && !trace.openTerminalEnd) {
        trace.targetComponent.runtimeState.actualFlowLph =
          Number(trace.targetComponent.runtimeState.actualFlowLph ?? 0) + flowLph;
      } else if (trace.targetComponent instanceof GullyDrainComponent) {
        const cur = gullyFlow.get(trace.targetComponent.id) ?? { flow: 0, medium };
        cur.flow += flowLph;
        if (medium !== 'water') cur.medium = medium;
        gullyFlow.set(trace.targetComponent.id, cur);
      }

      for (const cId of trace.connectionIds) addConnFlow(cId, flowLph, medium);
      for (const vId of trace.valveIds) {
        valveFlow.set(vId, (valveFlow.get(vId) ?? 0) + flowLph);
        const comp = this.components.get(vId);
        if (comp instanceof FluidTeeComponent) {
          const cur = teeFlow.get(vId) ?? { flow: 0, medium };
          cur.flow += flowLph;
          if (medium !== 'water') cur.medium = medium;
          teeFlow.set(vId, cur);
        }
      }
      for (const mId of trace.meterIds) {
        meterFlow.set(mId, (meterFlow.get(mId) ?? 0) + flowLph);
      }
      for (const inj of trace.injectionStops) {
        const acc = injectionAcc.get(inj.comp.id);
        if (!acc) continue;
        if (inj.portId === 'dosing_in') {
          acc.dosingFlow += flowLph;
          acc.dosingMedium = medium;
        } else {
          acc.mainFlow += flowLph;
        }
      }
    };

    const isTraceAccepting = (t: FluidPathTrace): boolean => {
      if (t.openTerminalEnd) return true;
      if (t.targetComponent instanceof TankComponent) return !t.targetComponent.isFull();
      if (t.targetComponent instanceof DrainConsumerComponent) return t.targetComponent.isOpen();
      if (t.targetComponent instanceof GullyDrainComponent) return true;
      return false;
    };

    // 1. Erzeuger-Anlagen (Anolyt primär, Katholyt nebenrangig)
    for (const comp of this.components.values()) {
      if (!(comp instanceof GeneratorComponent)) continue;

      const enabled = Boolean(comp.runtimeState.productionEnabled);
      if (!enabled) {
        if (Boolean(comp.params.manualStop)) {
          comp.runtimeState.status = 'manual_stop';
        } else if (Boolean(comp.runtimeState.lockActive)) {
          comp.runtimeState.status = 'locked_ext';
        } else {
          comp.runtimeState.status = 'standby';
        }
        continue;
      }

      // Anolyt-Strang (Blau)
      const anoTraces = traceDownstream(comp.id, 'fluid_anolyte');
      const activeAno = anoTraces.filter(isTraceAccepting);
      let producedAno = 0;

      if (activeAno.length > 0) {
        const perBranch = comp.getAnolyteNominalLph() / activeAno.length;
        for (const trace of activeAno) {
          let accepted = Math.min(perBranch, trace.maxFlowCapLph);
          if (!trace.openTerminalEnd && trace.targetComponent instanceof DrainConsumerComponent) {
            accepted = Math.min(accepted, trace.targetComponent.getDrainRateLph());
          }
          recordTraceFlow(trace, accepted, 'anolyte');
          producedAno += accepted;
        }
      }

      // Katholyt-Strang (Grün) — läuft nebenrangig solange Anlage produziert & Ausgangspfad frei (Tank o. Gulli)
      const katTraces = traceDownstream(comp.id, 'fluid_katholyte');
      const activeKat = katTraces.filter(isTraceAccepting);
      let producedKat = 0;

      if (activeKat.length > 0) {
        const perBranch = comp.getKatholyteNominalLph() / activeKat.length;
        for (const trace of activeKat) {
          let accepted = Math.min(perBranch, trace.maxFlowCapLph);
          if (!trace.openTerminalEnd && trace.targetComponent instanceof DrainConsumerComponent) {
            accepted = Math.min(accepted, trace.targetComponent.getDrainRateLph());
          }
          recordTraceFlow(trace, accepted, 'katholyte');
          producedKat += accepted;
        }
      }

      comp.runtimeState.actualAnolyteLph = producedAno;
      comp.runtimeState.actualKatholyteLph = producedKat;
      comp.runtimeState.actualFlowLph = producedAno + producedKat;

      const hasFullTarget = [...anoTraces, ...katTraces].some(
        (t) =>
          !t.openTerminalEnd &&
          t.targetComponent instanceof TankComponent &&
          t.targetComponent.isFull()
      );
      if (producedAno > 0 || producedKat > 0) {
        comp.runtimeState.status = 'running';
      } else if (hasFullTarget) {
        comp.runtimeState.status = 'locked_full';
      } else {
        comp.runtimeState.status = 'blocked';
      }
    }

    // 2. Hauptleitung (Rohwasser)
    for (const comp of this.components.values()) {
      if (!(comp instanceof MainWaterLineComponent)) continue;
      if (!comp.isActiveFlow()) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.flowing = false;
        continue;
      }

      const traces = traceDownstream(comp.id, 'fluid_out');
      const activeTraces = traces.filter(isTraceAccepting);
      if (activeTraces.length === 0) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.flowing = false;
        continue;
      }

      const nominal = comp.getNominalFlowLph();
      const perBranch = nominal / activeTraces.length;
      let totalWater = 0;

      for (const trace of activeTraces) {
        const accepted = Math.min(perBranch, trace.maxFlowCapLph);
        recordTraceFlow(trace, accepted, 'water');
        totalWater += accepted;
      }

      comp.runtimeState.actualFlowLph = totalWater;
      comp.runtimeState.flowing = totalWater > 0;
    }

    // 3. Dosierpumpen (Grundfos DDA: saugen aus Tank-Sauglanze & impfen ins Netz/Impfstelle)
    for (const comp of this.components.values()) {
      if (!(comp instanceof DosingPumpComponent)) continue;

      const targetFlow = Math.max(0, Number(comp.runtimeState.targetFlowLph ?? 0));
      const upstreamTank = this.findUpstreamTankForPump(comp.id);

      if (!upstreamTank) {
        comp.runtimeState.dryFault = targetFlow > 0;
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.status = targetFlow > 0 ? 'no_suction' : 'standby';
        continue;
      }

      if (upstreamTank.tank.isDryForPump()) {
        comp.runtimeState.dryFault = true;
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.status = 'dry_fault';
        continue;
      }

      comp.runtimeState.dryFault = false;
      const medium = upstreamTank.tank.getMedium();

      if (targetFlow <= 0) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.status = Boolean(comp.params.manualStop) ? 'manual_stop' : 'standby';
        continue;
      }

      const downstream = traceDownstream(comp.id, 'fluid_out').filter(isTraceAccepting);
      if (downstream.length === 0) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.status = 'blocked';
        continue;
      }

      const tankAvailLph =
        dtSimSeconds > 0
          ? (upstreamTank.tank.getLevelLiters() / (dtSimSeconds / 3600)) +
            (tankInflow.get(upstreamTank.tank.id) ?? 0) -
            (tankOutflow.get(upstreamTank.tank.id) ?? 0)
          : Number.POSITIVE_INFINITY;

      const cappedDemand = Math.min(
        targetFlow,
        upstreamTank.maxCap,
        Math.max(0, tankAvailLph)
      );

      if (cappedDemand <= 0.0001) {
        comp.runtimeState.actualFlowLph = 0;
        comp.runtimeState.status = 'dry_fault';
        comp.runtimeState.dryFault = true;
        continue;
      }

      const perBranch = cappedDemand / downstream.length;
      let totalDosed = 0;

      for (const trace of downstream) {
        const flow = Math.min(perBranch, trace.maxFlowCapLph);
        recordTraceFlow(trace, flow, medium);
        totalDosed += flow;
      }

      // Saugseite markieren & Tankentnahme buchen
      if (totalDosed > 0) {
        for (const cId of upstreamTank.connIds) addConnFlow(cId, totalDosed, medium);
        for (const vId of upstreamTank.valveIds) {
          valveFlow.set(vId, (valveFlow.get(vId) ?? 0) + totalDosed);
        }
        tankOutflow.set(
          upstreamTank.tank.id,
          (tankOutflow.get(upstreamTank.tank.id) ?? 0) + totalDosed
        );
        if (dtSimSeconds > 0) {
          comp.runtimeState.totalDosedLiters =
            Number(comp.runtimeState.totalDosedLiters ?? 0) +
            totalDosed * (dtSimSeconds / 3600);
        }
      }

      comp.runtimeState.actualFlowLph = totalDosed;
      comp.runtimeState.status = totalDosed > 0 ? 'dosing' : 'blocked';
    }

    // 4. Schwerkraft- / Ventil-Tankablauf (z. B. über 2/2-Ventil zum Gulli)
    for (const comp of this.components.values()) {
      if (!(comp instanceof TankComponent)) continue;
      if (comp.isEmpty()) continue;

      const traces = traceDownstream(comp.id, 'fluid_out');
      const openConsumers = traces.filter(
        (t) =>
          (t.targetComponent instanceof DrainConsumerComponent &&
            t.targetComponent.isOpen()) ||
          t.targetComponent instanceof GullyDrainComponent ||
          (t.targetComponent instanceof TankComponent &&
            t.targetComponent.id !== comp.id &&
            !t.targetComponent.isFull())
      );

      if (openConsumers.length === 0) continue;

      const currentLiters = comp.getLevelLiters();
      const inflow = tankInflow.get(comp.id) ?? 0;
      const alreadyOut = tankOutflow.get(comp.id) ?? 0;
      const maxAvailableLph =
        dtSimSeconds > 0
          ? Math.max(0, currentLiters / (dtSimSeconds / 3600) + inflow - alreadyOut)
          : Number.POSITIVE_INFINITY;

      let requestedTotalLph = 0;
      const branchDemands = openConsumers.map((t) => {
        let demand = 0;
        if (t.targetComponent instanceof DrainConsumerComponent) {
          const alreadySupplied = Number(t.targetComponent.runtimeState.actualFlowLph ?? 0);
          demand = Math.max(0, t.targetComponent.getDrainRateLph() - alreadySupplied);
        } else if (t.targetComponent instanceof GullyDrainComponent) {
          // Begrenze Abflussrate durch Ventile auf dem Pfad (oder Standard 1200 L/h freier Auslauf)
          demand = Number.isFinite(t.maxFlowCapLph) ? t.maxFlowCapLph : 1200;
        } else if (t.targetComponent instanceof TankComponent) {
          demand = Number.isFinite(t.maxFlowCapLph) ? Math.min(600, t.maxFlowCapLph) : 600;
        }
        demand = Math.min(demand, t.maxFlowCapLph);
        requestedTotalLph += demand;
        return { trace: t, demand };
      });

      if (requestedTotalLph <= 0) continue;

      const scale = requestedTotalLph > maxAvailableLph ? maxAvailableLph / requestedTotalLph : 1;
      let totalTankOut = 0;
      const medium = comp.getMedium();

      for (const { trace, demand } of branchDemands) {
        const flow = demand * scale;
        if (flow <= 0) continue;
        totalTankOut += flow;
        recordTraceFlow(trace, flow, medium);
      }

      tankOutflow.set(comp.id, alreadyOut + totalTankOut);
    }

    // 5. Zustände aller Fluid-Komponenten aktualisieren & Tankvolumen integrieren
    for (const comp of this.components.values()) {
      if (comp instanceof TankComponent) {
        const inLph = tankInflow.get(comp.id) ?? 0;
        const outLph = tankOutflow.get(comp.id) ?? 0;
        const medium = comp.getMedium();
        comp.runtimeState.inflowLph = inLph;
        comp.runtimeState.outflowLph = outLph;

        if (dtSimSeconds > 0) {
          const dtHours = dtSimSeconds / 3600;
          const nextLiters = comp.getLevelLiters() + (inLph - outLph) * dtHours;
          comp.runtimeState.levelLiters = Math.max(0, Math.min(comp.getCapacity(), nextLiters));
        }

        comp.runtimeState.isFull = comp.isFull();
        comp.runtimeState.isEmpty = comp.isEmpty();

        comp.portSignals.set('fluid_in', {
          domain: 'fluid',
          flowRateLph: inLph,
          hasPressure: inLph > 0,
          backpressureFull: comp.isFull(),
          medium,
        } as FluidSignal);
        comp.portSignals.set('fluid_out', {
          domain: 'fluid',
          flowRateLph: outLph,
          hasPressure: !comp.isEmpty(),
          backpressureFull: false,
          medium,
        } as FluidSignal);
      } else if (comp instanceof SolenoidValve22Component || comp instanceof SolenoidValve32Component) {
        comp.runtimeState.activeFlowLph = valveFlow.get(comp.id) ?? 0;
      } else if (comp instanceof WaterMeterComponent) {
        comp.runtimeState.currentFlowLph = meterFlow.get(comp.id) ?? 0;
      } else if (comp instanceof GullyDrainComponent) {
        const g = gullyFlow.get(comp.id) ?? { flow: 0, medium: 'water' as FluidMedium };
        comp.runtimeState.actualFlowLph = g.flow;
        comp.runtimeState.lastMedium = g.medium;
        if (dtSimSeconds > 0 && g.flow > 0) {
          comp.runtimeState.totalDiscardedLiters =
            Number(comp.runtimeState.totalDiscardedLiters ?? 0) +
            g.flow * (dtSimSeconds / 3600);
        }
      } else if (comp instanceof FluidTeeComponent) {
        const t = teeFlow.get(comp.id) ?? { flow: 0, medium: 'water' as FluidMedium };
        comp.runtimeState.activeFlowLph = t.flow;
        comp.runtimeState.medium = t.medium;
      } else if (comp instanceof InjectionPointComponent) {
        const acc = injectionAcc.get(comp.id) ?? {
          mainFlow: 0,
          dosingFlow: 0,
          dosingMedium: 'anolyte' as FluidMedium,
        };
        const total = acc.mainFlow + acc.dosingFlow;
        const ppm =
          acc.mainFlow > 0.001 ? (acc.dosingFlow / acc.mainFlow) * 1_000_000 : 0;
        comp.runtimeState.mainFlowLph = acc.mainFlow;
        comp.runtimeState.dosingFlowLph = acc.dosingFlow;
        comp.runtimeState.totalFlowLph = total;
        comp.runtimeState.concentrationPpm = ppm;
        comp.runtimeState.dosingMedium = acc.dosingMedium;
      }
    }
  }

  public getActiveFaultReports(): FaultReportItem[] {
    const reports: FaultReportItem[] = [];

    for (const comp of this.components.values()) {
      if (comp.fault === 'none') continue;

      let faultLabel = '';
      let impactSummary = '';
      let severity: 'critical' | 'warning' = 'critical';

      if (comp.fault === 'power_failure') {
        faultLabel = 'Ausfall Spannungsversorgung';
        const downstreamCount = this.connections.filter(
          (c) => c.fromComponentId === comp.id
        ).length;
        impactSummary =
          comp instanceof PowerSupply24V
            ? `24V-Schiene ausgefallen (0 V). ${downstreamCount} direkt angeschlossene Abgänge und alle nachgelagerten Steuerkreise stromlos.`
            : `${comp.label} hat keine Versorgungsspannung und schaltet in den Ruhezustand.`;
      } else if (comp.fault === 'short_circuit') {
        faultLabel = 'Kurzschluss';
        impactSummary =
          'Überstrom (>25 A) löst Kurzschlussschutz der speisenden 24V-Versorgung aus; gesamter Stromkreis fällt auf 0 V ab.';
      } else if (comp.fault === 'valve_stuck_closed') {
        faultLabel =
          comp instanceof SolenoidValve32Component
            ? 'Ventil klemmt (Stellung P→A)'
            : 'Ventil klemmt (geschlossen)';
        severity = 'warning';
        impactSummary =
          comp instanceof SolenoidValve32Component
            ? 'Mechanisch blockiert auf P→A. Steuersignal A1 kann nicht mehr auf Ausgang B umschalten.'
            : 'Durchfluss dauerhaft blockiert – nachgelagerte Tanks oder Verbraucher erhalten kein Medium.';
      } else if (comp.fault === 'valve_stuck_open') {
        faultLabel =
          comp instanceof SolenoidValve32Component
            ? 'Ventil klemmt (Stellung P→B)'
            : 'Ventil klemmt (offen)';
        severity = 'warning';
        impactSummary =
          comp instanceof SolenoidValve32Component
            ? 'Mechanisch blockiert auf P→B. Medium strömt auch bei 0V weiter in Pfad B.'
            : 'Dauerhaft geöffnet – Medium fließt unkontrolliert auch ohne 24V-Ansteuerung.';
      }

      reports.push({
        id: `fault_comp_${comp.id}`,
        targetKind: 'component',
        targetId: comp.id,
        targetLabel: comp.label,
        faultType: comp.fault,
        faultLabel,
        impactSummary,
        severity,
      });
    }

    for (const conn of this.connections) {
      if (!conn.fault || conn.fault === 'none') continue;
      const fromComp = this.components.get(conn.fromComponentId);
      const toComp = this.components.get(conn.toComponentId);
      const label = `${fromComp?.label ?? '?'} → ${toComp?.label ?? '?'}`;

      if (conn.fault === 'open_circuit') {
        reports.push({
          id: `fault_conn_${conn.id}`,
          targetKind: 'connection',
          targetId: conn.id,
          targetLabel: label,
          faultType: 'open_circuit',
          faultLabel:
            conn.domain === 'fluid' ? 'Rohrleitung blockiert / unterbrochen' : 'Leitungsunterbrechung',
          impactSummary:
            conn.domain === 'fluid'
              ? `Kein Medium-Durchfluss zu ${toComp?.label ?? 'Ziel'}. Vorgelagerte Pumpen laufen ggf. gegen Blockade.`
              : `Kein Signaltransfer an ${toComp?.label ?? 'Ziel'} (0 V / unterbrochen).`,
          severity: 'warning',
        });
      } else if (conn.fault === 'short_circuit') {
        reports.push({
          id: `fault_conn_${conn.id}`,
          targetKind: 'connection',
          targetId: conn.id,
          targetLabel: label,
          faultType: 'short_circuit',
          faultLabel: 'Leitungs-Kurzschluss',
          impactSummary:
            'Kurzschluss auf der Leitung führt bei Bestromung zum sofortigen Schutz-Ausfall des speisenden 24V-Netzteils.',
          severity: 'critical',
        });
      }
    }

    return reports;
  }

  public triggerRandomFault(): FaultReportItem | null {
    type Candidate =
      | { kind: 'component'; comp: SimComponent; fault: ComponentFaultType }
      | { kind: 'connection'; conn: Connection; fault: ConnectionFaultType };

    const candidates: Candidate[] = [];

    for (const comp of this.components.values()) {
      if (comp.fault !== 'none') continue;
      const supported = comp.getSupportedFaults();
      for (const f of supported) {
        candidates.push({ kind: 'component', comp, fault: f });
      }
    }

    for (const conn of this.connections) {
      if (conn.fault && conn.fault !== 'none') continue;
      candidates.push({ kind: 'connection', conn, fault: 'open_circuit' });
      if (conn.domain === 'electrical') {
        candidates.push({ kind: 'connection', conn, fault: 'short_circuit' });
      }
    }

    if (candidates.length === 0) return null;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (pick.kind === 'component') {
      pick.comp.fault = pick.fault;
    } else {
      pick.conn.fault = pick.fault;
    }

    this.evaluateInstant();
    const reports = this.getActiveFaultReports();
    const targetId = pick.kind === 'component' ? pick.comp.id : pick.conn.id;
    return reports.find((r) => r.targetId === targetId) ?? reports[0] ?? null;
  }

  public clearAllFaults(): void {
    for (const comp of this.components.values()) {
      comp.fault = 'none';
    }
    for (const conn of this.connections) {
      conn.fault = 'none';
    }
    this.evaluateInstant();
  }
}
