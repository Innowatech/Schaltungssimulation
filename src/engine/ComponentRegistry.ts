import { SimComponent } from './SimComponent';
import {
  DrainConsumerComponent,
  FloatProbeComponent,
  GeneratorComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
} from './components/FluidComponents';
import { PowerSupply24V, SwitchComponent } from './components/PowerAndSwitch';
import { ContactorRelayComponent, TimerRelayComponent } from './components/Relays';
import {
  CurrentTransformerComponent,
  LogicGateComponent,
  SignalTransmitterComponent,
} from './components/SignalAndLogic';
import { TerminalBlockComponent } from './components/TerminalBlock';
import { ComponentMetadata, SerializedComponent } from './types';

export type ComponentFactory = (id: string, label: string, x: number, y: number) => SimComponent;

export interface RegisteredComponentEntry {
  meta: ComponentMetadata;
  factory: ComponentFactory;
}

class Registry {
  private entries = new Map<string, RegisteredComponentEntry>();

  public register(meta: ComponentMetadata, factory: ComponentFactory): void {
    this.entries.set(meta.type, { meta, factory });
  }

  public getAll(): RegisteredComponentEntry[] {
    return Array.from(this.entries.values());
  }

  public getMeta(type: string): ComponentMetadata | undefined {
    return this.entries.get(type)?.meta;
  }

  public create(type: string, id: string, x: number, y: number, customLabel?: string): SimComponent {
    const entry = this.entries.get(type);
    if (!entry) {
      throw new Error(`Unbekannter Bauteiltyp: ${type}`);
    }
    const label = customLabel ?? entry.meta.defaultLabelPrefix;
    return entry.factory(id, label, x, y);
  }

  public deserialize(data: SerializedComponent): SimComponent {
    const comp = this.create(data.type, data.id, data.x, data.y, data.label);
    comp.params = { ...comp.params, ...data.params };
    comp.fault = data.fault ?? 'none';
    if (data.runtimeState) {
      comp.runtimeState = { ...comp.runtimeState, ...data.runtimeState };
    }
    if (comp instanceof TankComponent && !data.runtimeState) {
      comp.reset();
    }
    return comp;
  }
}

export const ComponentRegistry = new Registry();

// Elektrik & Steuerung
ComponentRegistry.register(
  {
    type: 'power_24v',
    name: 'Spannungsquelle 24V DC',
    shortDescription: 'Versorgt Steuerstromkreise mit +24V DC',
    category: 'electric',
    width: 160,
    height: 96,
    defaultLabelPrefix: 'G1 24V DC',
  },
  (id, label, x, y) => new PowerSupply24V(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'terminal_block',
    name: '24V Klemmblock (Igel)',
    shortDescription: 'Modular erweiterbarer Potentialverteiler (5, 10, 15, 20 Ausgänge)',
    category: 'electric',
    width: 210,
    height: 180,
    defaultLabelPrefix: 'X1 Klemmblock',
  },
  (id, label, x, y) => new TerminalBlockComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'switch',
    name: 'Taster / Schalter',
    shortDescription: 'Manuell schaltbarer Rast- oder Tastkontakt (13/14)',
    category: 'electric',
    width: 164,
    height: 96,
    defaultLabelPrefix: 'S1 Schalter',
  },
  (id, label, x, y) => new SwitchComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'timer_relay',
    name: 'Zeitrelais',
    shortDescription: 'Ansprech-/Rückfallverzögert oder Taktgeber (A1, 15-16-18)',
    category: 'relay',
    width: 196,
    height: 148,
    defaultLabelPrefix: 'K1 Zeitrelais',
  },
  (id, label, x, y) => new TimerRelayComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'contactor_relay',
    name: 'Hilfsrelais / Schütz',
    shortDescription: 'Spule A1 mit 2x Wechsler (11-12-14 & 21-22-24)',
    category: 'relay',
    width: 200,
    height: 168,
    defaultLabelPrefix: 'K2 Hilfsrelais',
  },
  (id, label, x, y) => new ContactorRelayComponent(id, label, x, y)
);

// Logik & Messtechnik
ComponentRegistry.register(
  {
    type: 'current_transformer',
    name: 'Stromwandler',
    shortDescription: 'Misst Stromstärke (A) und wandelt in 4–20mA / 0–10V',
    category: 'logic',
    width: 196,
    height: 140,
    defaultLabelPrefix: 'T1 Stromwandler',
  },
  (id, label, x, y) => new CurrentTransformerComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'signal_transmitter',
    name: 'Messumformer',
    shortDescription: 'Wandelt 0–10V / 0–24V ↔ 4–20mA inkl. 24V-Grenzwert',
    category: 'logic',
    width: 204,
    height: 160,
    defaultLabelPrefix: 'U1 Messumformer',
  },
  (id, label, x, y) => new SignalTransmitterComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'logic_and',
    name: 'Logikgatter AND',
    shortDescription: 'Ausgang Q = 24V wenn I1 UND I2 aktiv sind',
    category: 'logic',
    width: 166,
    height: 112,
    defaultLabelPrefix: 'D1 AND',
  },
  (id, label, x, y) => new LogicGateComponent(id, 'AND', label, x, y)
);

ComponentRegistry.register(
  {
    type: 'logic_or',
    name: 'Logikgatter OR',
    shortDescription: 'Ausgang Q = 24V wenn I1 ODER I2 aktiv ist',
    category: 'logic',
    width: 166,
    height: 112,
    defaultLabelPrefix: 'D2 OR',
  },
  (id, label, x, y) => new LogicGateComponent(id, 'OR', label, x, y)
);

ComponentRegistry.register(
  {
    type: 'logic_not',
    name: 'Logikgatter NOT',
    shortDescription: 'Invertiert Eingang I1 (0V → 24V, 24V → 0V)',
    category: 'logic',
    width: 166,
    height: 112,
    defaultLabelPrefix: 'D3 NOT',
  },
  (id, label, x, y) => new LogicGateComponent(id, 'NOT', label, x, y)
);

// Fluidik & Sensorik
ComponentRegistry.register(
  {
    type: 'tank',
    name: 'Tank mit Schwimmerlanze',
    shortDescription: 'Behälter mit integrierter Schwimmerlanze (3 oder 5 Schaltpunkte)',
    category: 'fluid',
    width: 216,
    height: 260,
    defaultLabelPrefix: 'B1 Tank',
  },
  (id, label, x, y) => new TankComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'float_probe',
    name: 'Schwimmerlanze (Separat)',
    shortDescription: 'Separater Füllstandssensor für externe Tanks',
    category: 'sensor',
    width: 188,
    height: 148,
    defaultLabelPrefix: 'S2 Schwimmer',
  },
  (id, label, x, y) => new FloatProbeComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'generator',
    name: 'Erzeuger-Anlage',
    shortDescription: 'Produziert L/h bei 24V Freigabe (Stopp bei Sperre / Tank Voll)',
    category: 'fluid',
    width: 196,
    height: 140,
    defaultLabelPrefix: 'P1 Erzeuger',
  },
  (id, label, x, y) => new GeneratorComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'valve_32',
    name: '3/2-Wege-Magnetventil',
    shortDescription: 'Schaltet Fluid-Eingang P zwischen Ausgang A (NC) und B (NO)',
    category: 'fluid',
    width: 196,
    height: 136,
    defaultLabelPrefix: 'Y1 3/2-Ventil',
  },
  (id, label, x, y) => new SolenoidValve32Component(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'valve_22',
    name: '2/2-Wege-Magnetventil',
    shortDescription: 'Absperrventil P → A (konfigurierbar als NC oder NO)',
    category: 'fluid',
    width: 186,
    height: 120,
    defaultLabelPrefix: 'Y2 2/2-Ventil',
  },
  (id, label, x, y) => new SolenoidValve22Component(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'drain_consumer',
    name: 'Ablassventil / Verbraucher',
    shortDescription: 'Entnimmt bei 24V Ansteuerung X Liter/Stunde aus einem Tank',
    category: 'fluid',
    width: 188,
    height: 128,
    defaultLabelPrefix: 'V1 Verbraucher',
  },
  (id, label, x, y) => new DrainConsumerComponent(id, label, x, y)
);
