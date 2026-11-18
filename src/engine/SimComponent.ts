import {
  AnalogSignal,
  AnySignal,
  ComponentCategory,
  ComponentFaultType,
  ElectricalSignal,
  PortDefinition,
  SerializedComponent,
  SimulationContext,
} from './types';

export const ZERO_VOLT: ElectricalSignal = {
  domain: 'electrical',
  voltage: 0,
  energized: false,
};

export const HIGH_24V: ElectricalSignal = {
  domain: 'electrical',
  voltage: 24,
  energized: true,
};

export const HIGH_230V: ElectricalSignal = {
  domain: 'electrical',
  voltage: 230,
  energized: true,
};

export const ZERO_ANALOG_MA: AnalogSignal = {
  domain: 'analog',
  value: 4,
  unit: 'mA',
  active: false,
};

/**
 * Abstrakte Basisklasse für alle mechatronischen, fluidischen, logischen und
 * analogen (z. B. 4–20mA Stromwandler / Messumformer) Simulationsbauteile.
 */
export abstract class SimComponent {
  public readonly id: string;
  public abstract readonly type: string;
  public abstract readonly category: ComponentCategory;
  public abstract readonly width: number;
  public abstract height: number;

  public label: string;
  public x: number;
  public y: number;

  /** Injizierter Bauteilfehler (für Fehlersimulation) */
  public fault: ComponentFaultType = 'none';

  /** Konfigurierbare Parameter (werden im Inspektor bearbeitet und gespeichert) */
  public params: Record<string, unknown> = {};

  /** Live-Zustände während der Simulation */
  public runtimeState: Record<string, unknown> = {};

  /** Aktuelle Port-Signale für Visualisierung & Diagnostik */
  public portSignals: Map<string, AnySignal> = new Map();

  constructor(id: string, label: string, x: number, y: number) {
    this.id = id;
    this.label = label;
    this.x = x;
    this.y = y;
  }

  public abstract getPorts(): PortDefinition[];

  /**
   * Unterstützte Fehlertypen für dieses Bauteil in der Fehlersimulation.
   */
  public getSupportedFaults(): ComponentFaultType[] {
    return ['short_circuit'];
  }

  /**
   * Elektrische Stromaufnahme (in Ampere) wenn aktiv/bestromt (für Stromwandler-Messung).
   */
  public getElectricalLoadAmps(): number {
    if (this.fault === 'short_circuit') return 25.0;
    return 0;
  }

  /**
   * Wertet das rein elektrische Schaltverhalten basierend auf den anliegenden
   * Eingangsklemmen aus.
   */
  public evaluateElectrical(
    _inputs: Map<string, ElectricalSignal>,
    _context: SimulationContext,
    _analogInputs?: Map<string, AnalogSignal>
  ): Map<string, ElectricalSignal> {
    return new Map();
  }

  /**
   * Wertet analoge Signalausgänge (z. B. 4–20mA oder 0–10V) aus.
   */
  public evaluateAnalog(
    _analogInputs: Map<string, AnalogSignal>,
    _electricalInputs: Map<string, ElectricalSignal>,
    _context: SimulationContext
  ): Map<string, AnalogSignal> {
    return new Map();
  }

  /**
   * Integriert zeitabhängige Logik über das simulierte Zeitintervall dtSimSeconds.
   */
  public stepTime(
    _inputs: Map<string, ElectricalSignal>,
    _dtSimSeconds: number,
    _context: SimulationContext
  ): void {
    // Standardmäßig keine zeitabhängige Änderung
  }

  /**
   * Gibt bei schaltenden Fluid-Elementen die aktiven internen Fluid-Pfade zurück.
   */
  public getActiveFluidPaths(): Array<[string, string]> {
    return [];
  }

  public reset(): void {
    this.portSignals.clear();
  }

  public getPortWorldPosition(portId: string): { x: number; y: number; side: PortDefinition['side'] } | null {
    const port = this.getPorts().find((p) => p.id === portId);
    if (!port) return null;
    return {
      x: this.x + port.offsetX,
      y: this.y + port.offsetY,
      side: port.side,
    };
  }

  public serialize(): SerializedComponent {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      x: Math.round(this.x),
      y: Math.round(this.y),
      params: { ...this.params },
      runtimeState: { ...this.runtimeState },
      fault: this.fault,
    };
  }
}
