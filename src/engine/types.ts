export type PortDomain = 'electrical' | 'fluid' | 'analog' | 'air';
export type PortDirection = 'input' | 'output';
export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type FluidMedium = 'water' | 'anolyte' | 'katholyte';

export type ComponentCategory = 'electric' | 'relay' | 'logic' | 'fluid' | 'sensor';

export type ComponentFaultType =
  | 'none'
  | 'power_failure'
  | 'short_circuit'
  | 'valve_stuck_closed'
  | 'valve_stuck_open';

export type ConnectionFaultType = 'none' | 'open_circuit' | 'short_circuit';

export interface FaultReportItem {
  id: string;
  targetKind: 'component' | 'connection';
  targetId: string;
  targetLabel: string;
  faultType: ComponentFaultType | ConnectionFaultType;
  faultLabel: string;
  impactSummary: string;
  severity: 'critical' | 'warning';
}

export interface PortDefinition {
  id: string;
  label: string;
  description?: string;
  domain: PortDomain;
  direction: PortDirection;
  side: PortSide;
  /** X offset in pixels relative to component top-left */
  offsetX: number;
  /** Y offset in pixels relative to component top-left */
  offsetY: number;
}

export interface ElectricalSignal {
  domain: 'electrical';
  voltage: number; // 24 or 0
  energized: boolean;
  /** Impuls-Metadaten für hochfrequente Zähler bei hohem Zeitraffer */
  pulseDeltaCount?: number;
  pulseRatePerHour?: number;
}

export interface FluidSignal {
  domain: 'fluid';
  flowRateLph: number;
  hasPressure: boolean;
  backpressureFull: boolean;
  medium?: FluidMedium;
}

export interface AnalogSignal {
  domain: 'analog';
  value: number; // z. B. 4..20 mA oder 0..10 V
  unit: 'mA' | 'V';
  active: boolean;
}

export interface AirSignal {
  domain: 'air';
  flowRateLpm: number;
  active: boolean;
}

export type AnySignal = ElectricalSignal | FluidSignal | AnalogSignal | AirSignal;

export interface Connection {
  id: string;
  domain: PortDomain;
  fromComponentId: string;
  fromPortId: string;
  toComponentId: string;
  toPortId: string;
  /** Aktiver Fehler auf dieser Leitung */
  fault?: ConnectionFaultType;
  /** Runtime evaluated flow/voltage/analog for visualization */
  active: boolean;
  voltage?: number;
  flowRateLph?: number;
  airFlowLpm?: number;
  medium?: FluidMedium;
  analogValue?: number;
  analogUnit?: 'mA' | 'V';
}

export interface SerializedComponent {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  params: Record<string, unknown>;
  runtimeState?: Record<string, unknown>;
  fault?: ComponentFaultType;
}

export interface SerializedCircuit {
  version: number;
  name: string;
  components: SerializedComponent[];
  connections: Array<
    Omit<Connection, 'active' | 'voltage' | 'flowRateLph' | 'analogValue' | 'analogUnit' | 'medium'>
  >;
}

export interface SavedSimulationEntry {
  id: string;
  name: string;
  updatedAt: string;
  circuit: SerializedCircuit;
}

export interface ComponentMetadata {
  type: string;
  name: string;
  shortDescription: string;
  category: ComponentCategory;
  width: number;
  height: number;
  defaultLabelPrefix: string;
  hidden?: boolean;
}

export interface SimulationContext {
  getComponentById: (id: string) => unknown;
  getAllComponents: () => unknown[];
  getDownstreamLoadAmps?: (componentId: string, outputPortId: string) => number;
  isSupplyShortCircuited?: (powerSupplyId: string) => boolean;
  totalSimSeconds: number;
}
