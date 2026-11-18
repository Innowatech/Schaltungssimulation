import { SimComponent } from './SimComponent';
import {
  AirPumpComponent,
  DosingPumpComponent,
  DrainConsumerComponent,
  FloatProbeComponent,
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
import {
  ChangeoverSwitchComponent,
  IndicatorLampComponent,
  PowerSupply230V,
  PowerSupply24V,
  SwitchComponent,
} from './components/PowerAndSwitch';
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
    return Array.from(this.entries.values()).filter((e) => !e.meta.hidden);
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
    shortDescription: 'Versorgt Steuerstromkreise mit +24V DC (mit Ein/Aus-Schalter)',
    category: 'electric',
    width: 160,
    height: 96,
    defaultLabelPrefix: 'G1 24V DC',
  },
  (id, label, x, y) => new PowerSupply24V(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'power_230v',
    name: 'Einspeisung 230V AC (L/N/PE)',
    shortDescription: '230V Netzanschluss L/N/PE mit Schalter (z. B. für Luftpumpen)',
    category: 'electric',
    width: 176,
    height: 104,
    defaultLabelPrefix: 'Q1 230V L/N/PE',
  },
  (id, label, x, y) => new PowerSupply230V(id, label, x, y)
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
    type: 'changeover_switch',
    name: 'Wechselschalter',
    shortDescription: 'Umschaltkontakt 11 (COM) → 12 (NC) oder 14 (NO)',
    category: 'electric',
    width: 180,
    height: 114,
    defaultLabelPrefix: 'S2 Wechselschalter',
  },
  (id, label, x, y) => new ChangeoverSwitchComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'indicator_green',
    name: 'Leuchtmelder Grün',
    shortDescription: 'Grüne Signallampe (Eingang +24V DC, 0V intern vorausgesetzt)',
    category: 'electric',
    width: 148,
    height: 104,
    defaultLabelPrefix: 'H1 Leuchtmelder',
  },
  (id, label, x, y) => new IndicatorLampComponent(id, label, x, y, 'green')
);

ComponentRegistry.register(
  {
    type: 'indicator_red',
    name: 'Leuchtmelder Rot',
    shortDescription: 'Rote Signallampe (Eingang +24V DC, 0V intern vorausgesetzt)',
    category: 'electric',
    width: 148,
    height: 104,
    defaultLabelPrefix: 'H2 Leuchtmelder',
  },
  (id, label, x, y) => new IndicatorLampComponent(id, label, x, y, 'red')
);

ComponentRegistry.register(
  {
    type: 'timer_relay',
    name: 'Zeitrelais (TELE E1ZM10)',
    shortDescription: 'Multifunktion E/R/Ws/Wa/Es/Wu/Bp, 7 Zeitbereiche (1s–100h), A1/B1/15-16-18',
    category: 'relay',
    width: 208,
    height: 172,
    defaultLabelPrefix: 'K1 E1ZM10',
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
    type: 'anolyte_tank',
    name: 'Anolyte-Tank (Gelb)',
    shortDescription: 'Anolyt-Behälter inkl. 3/5-Punkt Schwimmerlanze & 0–4 Sauglanzen',
    category: 'fluid',
    width: 224,
    height: 264,
    defaultLabelPrefix: 'B1 Anolyte-Tank',
  },
  (id, label, x, y) => new TankComponent(id, label, x, y, 'anolyte_tank')
);

ComponentRegistry.register(
  {
    type: 'katholyte_tank',
    name: 'Katholyte-Tank (Grün)',
    shortDescription: 'Katholyte-Behälter inkl. Belüftungsanschluss, Lanze & 0–4 Sauglanzen',
    category: 'fluid',
    width: 224,
    height: 264,
    defaultLabelPrefix: 'B2 Katholyte-Tank',
  },
  (id, label, x, y) => new TankComponent(id, label, x, y, 'katholyte_tank')
);

// Legacy Tank für alte JSON-Dateien
ComponentRegistry.register(
  {
    type: 'tank',
    name: 'Tank (Legacy)',
    shortDescription: 'Kompatibilitätstank',
    category: 'fluid',
    width: 224,
    height: 264,
    defaultLabelPrefix: 'B1 Tank',
    hidden: true,
  },
  (id, label, x, y) => new TankComponent(id, label, x, y, 'tank')
);

ComponentRegistry.register(
  {
    type: 'generator',
    name: 'Erzeuger-Anlage',
    shortDescription: 'Produziert Anolyt (Gelb) & Katholyte (Grün) getrennt + Hand-Stopp',
    category: 'fluid',
    width: 216,
    height: 176,
    defaultLabelPrefix: 'P1 Erzeuger',
  },
  (id, label, x, y) => new GeneratorComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'air_pump',
    name: 'Luftpumpe (AquaForte V-Serie)',
    shortDescription: 'Sprudelpumpe V-10/20/30/60 (230V L/N/PE Direkt oder 24V-Koppelrelais)',
    category: 'fluid',
    width: 208,
    height: 144,
    defaultLabelPrefix: 'AP1 Luftpumpe',
  },
  (id, label, x, y) => new AirPumpComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'dosing_pump',
    name: 'Dosierpumpe (Grundfos DDA)',
    shortDescription: 'DDA 17-7 bis 200-4 · Manuell / Kontakt-Impuls / 4–20mA Analogprofil',
    category: 'fluid',
    width: 220,
    height: 186,
    defaultLabelPrefix: 'P2 DDA-Pumpe',
  },
  (id, label, x, y) => new DosingPumpComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'main_water_line',
    name: 'Hauptleitung (Rohwasser)',
    shortDescription: 'Rohwasser-Volumenstrom (L/h & m³/h) zur Impfung',
    category: 'fluid',
    width: 196,
    height: 124,
    defaultLabelPrefix: 'W1 Hauptleitung',
  },
  (id, label, x, y) => new MainWaterLineComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'water_meter',
    name: 'Kontakt-Wasserzähler',
    shortDescription: 'Misst Durchfluss, zählt Volumen & sendet 24V-Impulse / 4–20mA',
    category: 'sensor',
    width: 208,
    height: 152,
    defaultLabelPrefix: 'B3 Wasserzähler',
  },
  (id, label, x, y) => new WaterMeterComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'injection_point',
    name: 'Impfstelle',
    shortDescription: 'Mischt Dosiermittel in den Hauptstrom & berechnet Konzentration',
    category: 'fluid',
    width: 200,
    height: 132,
    defaultLabelPrefix: 'I1 Impfstelle',
  },
  (id, label, x, y) => new InjectionPointComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'fluid_tee',
    name: 'T-Stück (Fluid)',
    shortDescription: 'Verteilt (1→2) oder sammelt (2→1) Rohrleitungen',
    category: 'fluid',
    width: 148,
    height: 110,
    defaultLabelPrefix: 'T1 T-Stück',
  },
  (id, label, x, y) => new FluidTeeComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'valve_32',
    name: '3/2-Wege-Magnetventil',
    shortDescription: 'Schaltet Eingang P zwischen Ausgang A (NC) und B (NO, z. B. Gulli)',
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
    shortDescription: 'Absperrventil P → A mit einstellbarem Durchfluss (NC / NO)',
    category: 'fluid',
    width: 186,
    height: 124,
    defaultLabelPrefix: 'Y2 2/2-Ventil',
  },
  (id, label, x, y) => new SolenoidValve22Component(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'gully_drain',
    name: 'Gulli / Ablauf',
    shortDescription: 'Verwurf-Ablauf für Katholyte-Bypass oder Tank-Entleerung',
    category: 'fluid',
    width: 164,
    height: 112,
    defaultLabelPrefix: 'G1 Gulli',
  },
  (id, label, x, y) => new GullyDrainComponent(id, label, x, y)
);

ComponentRegistry.register(
  {
    type: 'drain_consumer',
    name: 'Verbraucher (24V gesteuert)',
    shortDescription: 'Entnimmt bei 24V Ansteuerung X Liter/Stunde aus einem Tank',
    category: 'fluid',
    width: 188,
    height: 128,
    defaultLabelPrefix: 'V1 Verbraucher',
  },
  (id, label, x, y) => new DrainConsumerComponent(id, label, x, y)
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
