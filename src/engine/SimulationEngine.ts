import { ComponentRegistry } from './ComponentRegistry';
import { SimComponent, ZERO_ANALOG_MA, ZERO_VOLT } from './SimComponent';
import {
  DrainConsumerComponent,
  GeneratorComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
} from './components/FluidComponents';
import { PowerSupply24V, SwitchComponent } from './components/PowerAndSwitch';
import { ContactorRelayComponent, TimerRelayComponent } from './components/Relays';
import {
  AnalogSignal,
  ComponentFaultType,
  Connection,
  ConnectionFaultType,
  ElectricalSignal,
  FaultReportItem,
  FluidSignal,
  SerializedCircuit,
  SimulationContext,
} from './types';

interface FluidPathTrace {
  targetComponent: SimComponent;
  targetPortId: string;
  connectionIds: string[];
  valveIds: string[];
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
    if (fromComponentId === toComponentId) return null;

    const fromPort = fromComp.getPorts().find((p) => p.id === fromPortId);
    const toPort = toComp.getPorts().find((p) => p.id === toPortId);
    if (!fromPort || !toPort) return null;
    if (fromPort.domain !== toPort.domain) return null;

    let srcCompId = fromComponentId;
    let srcPortId = fromPortId;
    let dstCompId = toComponentId;
    let dstPortId = toPortId;

    if (fromPort.direction === 'input' && toPort.direction === 'output') {
      srcCompId = toComponentId;
      srcPortId = toPortId;
      dstCompId = fromComponentId;
      dstPortId = fromPortId;
    } else if (fromPort.direction === toPort.direction) {
      return null;
    }

    const duplicate = this.connections.find(
      (c) =>
        c.fromComponentId === srcCompId &&
        c.fromPortId === srcPortId &&
        c.toComponentId === dstCompId &&
        c.toPortId === dstPortId
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

    this.connections.push(conn);
    this.evaluateInstant();
    return conn;
  }

  public removeConnection(connectionId: string): void {
    this.connections = this.connections.filter((c) => c.id !== connectionId);
    this.evaluateInstant();
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
      if (this.components.has(conn.fromComponentId) && this.components.has(conn.toComponentId)) {
        this.connections.push({
          ...conn,
          fault: conn.fault ?? 'none',
          active: false,
          voltage: 0,
          flowRateLph: 0,
        });
      }
    }

    this.evaluateInstant();
  }

  public serializeCircuit(name = 'Mechatronik Anlage'): SerializedCircuit {
    return {
      version: 2,
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

      // BFS entlang geschlossener Schaltpfade ab Netzteil-Ausgang
      const visited = new Set<string>([comp.id]);
      const queue: string[] = [comp.id];

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const outgoing = elecConns.filter((c) => c.fromComponentId === currId);

        for (const conn of outgoing) {
          // Wenn die Leitung selbst einen Kurzschluss hat und gespeist wird
          const srcComp = this.components.get(currId);
          if (!srcComp) continue;

          // Prüfe ob der Ausgangsport durchgeschaltet ist
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

          if (!visited.has(dst.id)) {
            visited.add(dst.id);
            queue.push(dst.id);
          }
        }
        if (shortedSupplies.has(comp.id)) break;
      }
    }

    return shortedSupplies;
  }

  private isPathConductingThroughComponent(comp: SimComponent, outputPortId: string): boolean {
    if (comp instanceof PowerSupply24V) {
      return Boolean(comp.params.enabled ?? true) && comp.fault !== 'power_failure';
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
    return false;
  }

  /**
   * Summiert die nachgeschaltete Stromaufnahme (Ampere) ab einem Ausgangsport (für Stromwandler).
   */
  private computeDownstreamLoadAmps(startCompId: string, startPortId: string): number {
    const elecConns = this.connections.filter(
      (c) => c.domain === 'electrical' && c.fault !== 'open_circuit'
    );
    const visitedComps = new Set<string>();
    const queue: Array<{ compId: string; portId: string | null }> = [
      { compId: startCompId, portId: startPortId },
    ];
    let totalAmps = 0;

    while (queue.length > 0) {
      const { compId, portId } = queue.shift()!;
      const outgoing = elecConns.filter(
        (c) => c.fromComponentId === compId && (portId === null || c.fromPortId === portId)
      );

      for (const conn of outgoing) {
        if (conn.fault === 'short_circuit') {
          totalAmps += 25.0;
          continue;
        }
        const dst = this.components.get(conn.toComponentId);
        if (!dst || visitedComps.has(dst.id)) continue;
        visitedComps.add(dst.id);

        totalAmps += dst.getElectricalLoadAmps();

        // Durchgangselemente weiterverfolgen
        for (const outP of dst.getPorts()) {
          if (outP.domain === 'electrical' && outP.direction === 'output') {
            if (this.isPathConductingThroughComponent(dst, outP.id)) {
              queue.push({ compId: dst.id, portId: outP.id });
            }
          }
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

      // 1. Eingänge zurücksetzen
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

      // 2. Elektrische Verbindungen (Wired-OR, Fehler berücksichtigen)
      for (const conn of electricalConns) {
        if (conn.fault === 'open_circuit' || conn.fault === 'short_circuit') continue;
        const srcOutputs = outputElectrical.get(conn.fromComponentId);
        const sig = srcOutputs?.get(conn.fromPortId) ?? ZERO_VOLT;
        if (sig.energized) {
          const dstInputs = inputElectrical.get(conn.toComponentId);
          if (dstInputs) {
            const existing = dstInputs.get(conn.toPortId);
            if (!existing || !existing.energized || sig.voltage > existing.voltage) {
              dstInputs.set(conn.toPortId, sig);
            }
          }
        }
      }

      // 3. Analoge Verbindungen (4-20mA / 0-10V)
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

      // 4. Elektrische und analoge Ausgänge je Komponente berechnen
      for (const comp of this.components.values()) {
        const eIn = inputElectrical.get(comp.id) ?? new Map();
        const aIn = inputAnalog.get(comp.id) ?? new Map();

        const nextE = comp.evaluateElectrical(eIn, context, aIn);
        const prevE = outputElectrical.get(comp.id)!;
        for (const [portId, sig] of nextE.entries()) {
          const prev = prevE.get(portId);
          if (!prev || prev.energized !== sig.energized || prev.voltage !== sig.voltage) {
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

    // Aktualisiere Port-Signale & Leitungen
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
      const sig = outputElectrical.get(conn.fromComponentId)?.get(conn.fromPortId) ?? ZERO_VOLT;
      conn.active = sig.energized;
      conn.voltage = sig.voltage;
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

  private solveFluidNetwork(dtSimSeconds: number): void {
    const fluidConns = this.connections.filter((c) => c.domain === 'fluid');

    for (const conn of fluidConns) {
      conn.active = false;
      conn.flowRateLph = 0;
    }

    const tankInflow = new Map<string, number>();
    const tankOutflow = new Map<string, number>();
    const valveFlow = new Map<string, number>();

    for (const comp of this.components.values()) {
      if (comp.type === 'tank') {
        tankInflow.set(comp.id, 0);
        tankOutflow.set(comp.id, 0);
      } else if (comp.type === 'valve_22' || comp.type === 'valve_32') {
        comp.runtimeState.activeFlowLph = 0;
        valveFlow.set(comp.id, 0);
      } else if (comp.type === 'drain_consumer') {
        comp.runtimeState.actualFlowLph = 0;
      } else if (comp.type === 'generator') {
        comp.runtimeState.actualFlowLph = 0;
      }
    }

    const addConnFlow = (connId: string, flowLph: number) => {
      const conn = fluidConns.find((c) => c.id === connId);
      if (!conn || flowLph <= 0) return;
      conn.flowRateLph = (conn.flowRateLph ?? 0) + flowLph;
      conn.active = true;
    };

    const traceDownstream = (startCompId: string, startPortId: string): FluidPathTrace[] => {
      const results: FluidPathTrace[] = [];

      const dfs = (
        compId: string,
        portId: string,
        visited: Set<string>,
        connTrail: string[],
        valveTrail: string[]
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

          if (target.type === 'tank' || target.type === 'drain_consumer') {
            results.push({
              targetComponent: target,
              targetPortId: conn.toPortId,
              connectionIds: nextConns,
              valveIds: valveTrail,
            });
          } else {
            const activePaths = target.getActiveFluidPaths();
            for (const [inP, outP] of activePaths) {
              if (inP === conn.toPortId) {
                dfs(target.id, outP, nextVisited, nextConns, [...valveTrail, target.id]);
              }
            }
          }
        }
      };

      dfs(startCompId, startPortId, new Set(), [], []);
      return results;
    };

    // 1. Erzeuger-Anlagen
    for (const comp of this.components.values()) {
      if (!(comp instanceof GeneratorComponent)) continue;

      if (!comp.runtimeState.enableActive) {
        comp.runtimeState.status = 'standby';
        comp.runtimeState.actualFlowLph = 0;
        continue;
      }

      if (comp.runtimeState.lockActive) {
        comp.runtimeState.status = 'locked_ext';
        comp.runtimeState.actualFlowLph = 0;
        continue;
      }

      const traces = traceDownstream(comp.id, 'fluid_out');
      if (traces.length === 0) {
        comp.runtimeState.status = 'blocked';
        comp.runtimeState.actualFlowLph = 0;
        continue;
      }

      const activeTraces = traces.filter((t) => {
        if (t.targetComponent instanceof TankComponent) {
          return !t.targetComponent.isFull();
        }
        if (t.targetComponent instanceof DrainConsumerComponent) {
          return t.targetComponent.isOpen();
        }
        return false;
      });

      const hasFullTankTarget = traces.some(
        (t) => t.targetComponent instanceof TankComponent && t.targetComponent.isFull()
      );

      if (activeTraces.length === 0) {
        comp.runtimeState.status = hasFullTankTarget ? 'locked_full' : 'blocked';
        comp.runtimeState.actualFlowLph = 0;
        continue;
      }

      const nominal = comp.getNominalFlowLph();
      const perBranch = nominal / activeTraces.length;
      let totalProduced = 0;

      for (const trace of activeTraces) {
        let accepted = perBranch;
        if (trace.targetComponent instanceof DrainConsumerComponent) {
          accepted = Math.min(perBranch, trace.targetComponent.getDrainRateLph());
          trace.targetComponent.runtimeState.actualFlowLph =
            Number(trace.targetComponent.runtimeState.actualFlowLph ?? 0) + accepted;
        } else if (trace.targetComponent instanceof TankComponent) {
          tankInflow.set(
            trace.targetComponent.id,
            (tankInflow.get(trace.targetComponent.id) ?? 0) + accepted
          );
        }

        totalProduced += accepted;
        for (const cId of trace.connectionIds) addConnFlow(cId, accepted);
        for (const vId of trace.valveIds) valveFlow.set(vId, (valveFlow.get(vId) ?? 0) + accepted);
      }

      comp.runtimeState.status = totalProduced > 0 ? 'running' : 'blocked';
      comp.runtimeState.actualFlowLph = totalProduced;
    }

    // 2. Tank-Ablauf
    for (const comp of this.components.values()) {
      if (!(comp instanceof TankComponent)) continue;
      if (comp.isEmpty()) continue;

      const traces = traceDownstream(comp.id, 'fluid_out');
      const openConsumers = traces.filter(
        (t) =>
          (t.targetComponent instanceof DrainConsumerComponent &&
            t.targetComponent.isOpen()) ||
          (t.targetComponent instanceof TankComponent &&
            t.targetComponent.id !== comp.id &&
            !t.targetComponent.isFull())
      );

      if (openConsumers.length === 0) continue;

      const currentLiters = comp.getLevelLiters();
      const inflow = tankInflow.get(comp.id) ?? 0;
      const maxAvailableLph =
        dtSimSeconds > 0
          ? currentLiters / (dtSimSeconds / 3600) + inflow
          : Number.POSITIVE_INFINITY;

      let requestedTotalLph = 0;
      const branchDemands = openConsumers.map((t) => {
        let demand = 0;
        if (t.targetComponent instanceof DrainConsumerComponent) {
          const alreadySupplied = Number(t.targetComponent.runtimeState.actualFlowLph ?? 0);
          demand = Math.max(0, t.targetComponent.getDrainRateLph() - alreadySupplied);
        } else if (t.targetComponent instanceof TankComponent) {
          demand = 600;
        }
        requestedTotalLph += demand;
        return { trace: t, demand };
      });

      if (requestedTotalLph <= 0) continue;

      const scale = requestedTotalLph > maxAvailableLph ? maxAvailableLph / requestedTotalLph : 1;
      let totalTankOut = 0;

      for (const { trace, demand } of branchDemands) {
        const flow = demand * scale;
        if (flow <= 0) continue;
        totalTankOut += flow;

        if (trace.targetComponent instanceof DrainConsumerComponent) {
          trace.targetComponent.runtimeState.actualFlowLph =
            Number(trace.targetComponent.runtimeState.actualFlowLph ?? 0) + flow;
        } else if (trace.targetComponent instanceof TankComponent) {
          tankInflow.set(
            trace.targetComponent.id,
            (tankInflow.get(trace.targetComponent.id) ?? 0) + flow
          );
        }

        for (const cId of trace.connectionIds) addConnFlow(cId, flow);
        for (const vId of trace.valveIds) valveFlow.set(vId, (valveFlow.get(vId) ?? 0) + flow);
      }

      tankOutflow.set(comp.id, (tankOutflow.get(comp.id) ?? 0) + totalTankOut);
    }

    // 3. Tankvolumen integrieren
    for (const comp of this.components.values()) {
      if (comp instanceof TankComponent) {
        const inLph = tankInflow.get(comp.id) ?? 0;
        const outLph = tankOutflow.get(comp.id) ?? 0;
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
        } as FluidSignal);
        comp.portSignals.set('fluid_out', {
          domain: 'fluid',
          flowRateLph: outLph,
          hasPressure: !comp.isEmpty(),
          backpressureFull: false,
        } as FluidSignal);
      } else if (comp.type === 'valve_22' || comp.type === 'valve_32') {
        comp.runtimeState.activeFlowLph = valveFlow.get(comp.id) ?? 0;
      }
    }
  }

  /**
   * Analysiert alle aktiven Fehler und deren konkrete Auswirkung auf das Gesamtsystem.
   */
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

  /**
   * Löst einen gezielt ausgewählten Zufallsfehler an einem Bauteil oder einer Leitung aus.
   */
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
