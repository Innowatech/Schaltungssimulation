import { SimulationEngine } from '../engine/SimulationEngine';
import {
  AirPumpComponent,
  DosingPumpComponent,
  DrainConsumerComponent,
  GeneratorComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
} from '../engine/components/FluidComponents';
import {
  ChangeoverSwitchComponent,
  IndicatorLampComponent,
  PowerSupply230V,
  PowerSupply24V,
  SwitchComponent,
} from '../engine/components/PowerAndSwitch';
import { ContactorRelayComponent, TimerRelayComponent } from '../engine/components/Relays';

export interface SimEventSnapshot {
  components: Map<
    string,
    {
      label: string;
      type: string;
      values: Record<string, string | number | boolean>;
    }
  >;
}

export interface SimulationEventEntry {
  id: string;
  simSeconds: number;
  timeLabel: string;
  message: string;
  severity: 'info' | 'switch' | 'alert';
}

export function formatSimClock(totalSeconds: number): string {
  const whole = Math.floor(Math.max(0, totalSeconds));
  const d = Math.floor(whole / 86400);
  const h = Math.floor((whole % 86400) / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return d > 0 ? `${d}T ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function captureEngineSnapshot(engine: SimulationEngine): SimEventSnapshot {
  const map: SimEventSnapshot['components'] = new Map();

  for (const comp of engine.components.values()) {
    const values: Record<string, string | number | boolean> = {};

    if (comp instanceof PowerSupply24V || comp instanceof PowerSupply230V) {
      values.active = Boolean(comp.runtimeState.active);
    } else if (comp instanceof SwitchComponent) {
      values.closed = comp.isContactClosed();
    } else if (comp instanceof ChangeoverSwitchComponent) {
      values.switched = comp.isSwitched();
    } else if (comp instanceof IndicatorLampComponent) {
      values.lit = Boolean(comp.runtimeState.lit);
    } else if (comp instanceof TimerRelayComponent) {
      values.isTiming = Boolean(comp.runtimeState.isTiming);
      values.contactSwitched = Boolean(comp.runtimeState.contactSwitched);
    } else if (comp instanceof ContactorRelayComponent) {
      values.coilEnergized = Boolean(comp.runtimeState.coilEnergized);
    } else if (comp instanceof GeneratorComponent) {
      values.producing = Boolean(comp.runtimeState.productionEnabled);
      values.ano = Math.round(Number(comp.runtimeState.actualAnolyteLph ?? 0));
      values.kat = Math.round(Number(comp.runtimeState.actualKatholyteLph ?? 0));
    } else if (comp instanceof SolenoidValve32Component) {
      values.energized = Boolean(comp.runtimeState.energized);
      values.activePath = String(comp.runtimeState.activePath ?? 'P->A');
    } else if (comp instanceof SolenoidValve22Component) {
      values.isOpen = Boolean(comp.runtimeState.isOpen);
    } else if (comp instanceof DrainConsumerComponent) {
      values.isOpen = comp.isOpen();
    } else if (comp instanceof AirPumpComponent) {
      values.running = Boolean(comp.runtimeState.running);
      values.lpm = Number(comp.runtimeState.airFlowLpm ?? 0);
    } else if (comp instanceof DosingPumpComponent) {
      values.dosing = comp.runtimeState.status === 'dosing';
      values.flow = Number(comp.runtimeState.actualFlowLph ?? 0);
    } else if (comp instanceof TankComponent) {
      values.isFull = comp.isFull();
      values.isEmpty = comp.isEmpty();
      values.aerated = Boolean(comp.runtimeState.aerated);
      values.minState = Boolean(comp.runtimeState.minState);
      values.maxState = Boolean(comp.runtimeState.maxState);
      values.inflow = Math.round(Number(comp.runtimeState.inflowLph ?? 0));
      values.outflow = Math.round(Number(comp.runtimeState.outflowLph ?? 0));
    }

    map.set(comp.id, {
      label: comp.label,
      type: comp.type,
      values,
    });
  }

  return { components: map };
}

export function diffEngineSnapshots(
  prev: SimEventSnapshot,
  next: SimEventSnapshot,
  simSeconds: number
): SimulationEventEntry[] {
  const events: SimulationEventEntry[] = [];
  const timeLabel = formatSimClock(simSeconds);

  const push = (
    compId: string,
    suffix: string,
    message: string,
    severity: SimulationEventEntry['severity'] = 'info'
  ) => {
    events.push({
      id: `evt_${Math.round(simSeconds * 100)}_${compId}_${suffix}_${Math.random().toString(36).slice(2, 5)}`,
      simSeconds,
      timeLabel,
      message,
      severity,
    });
  };

  for (const [id, curr] of next.components.entries()) {
    const old = prev.components.get(id);
    if (!old) continue;
    const p = old.values;
    const n = curr.values;

    if (curr.type === 'switch' && p.closed !== n.closed) {
      push(id, 'sw', `${curr.label}: ${n.closed ? 'EIN geschaltet' : 'AUS geschaltet'}`, 'switch');
    } else if (curr.type === 'changeover_switch' && p.switched !== n.switched) {
      push(
        id,
        'csw',
        `${curr.label}: Umgeschaltet auf ${n.switched ? 'Stellung II (11→14)' : 'Stellung I (11→12)'}`,
        'switch'
      );
    } else if (curr.type === 'timer_relay') {
      if (p.contactSwitched !== n.contactSwitched) {
        push(
          id,
          'tr_c',
          `${curr.label}: Kontakt geschaltet (${n.contactSwitched ? '15 → 18 AKTIV' : 'zurück auf 15 → 16'})`,
          'switch'
        );
      } else if (!p.isTiming && n.isTiming) {
        push(id, 'tr_t', `${curr.label}: Zeitablauf gestartet`, 'info');
      }
    } else if (curr.type === 'generator' && p.producing !== n.producing) {
      push(
        id,
        'gen',
        n.producing
          ? `${curr.label}: Produktion gestartet (Anolyt ${n.ano} L/h · Katholyte ${n.kat} L/h)`
          : `${curr.label}: Produktion gestoppt (Standby / Tank voll)`,
        n.producing ? 'switch' : 'alert'
      );
    } else if (curr.type === 'valve_32' && p.activePath !== n.activePath) {
      push(id, 'v32', `${curr.label}: Umgeschaltet auf Pfad ${n.activePath}`, 'switch');
    } else if (curr.type === 'valve_22' && p.isOpen !== n.isOpen) {
      push(
        id,
        'v22',
        `${curr.label}: ${n.isOpen ? 'GEÖFFNET (Entleerung / Durchfluss)' : 'GESCHLOSSEN'}`,
        'switch'
      );
    } else if (curr.type === 'ball_valve' && p.isOpen !== n.isOpen) {
      push(id, 'bv', `${curr.label}: ${n.isOpen ? 'GEÖFFNET' : 'GESCHLOSSEN'}`, 'switch');
    } else if (curr.type === 'air_pump' && p.running !== n.running) {
      push(
        id,
        'ap',
        n.running
          ? `${curr.label}: Belüftung aktiv (${n.lpm} L/min)`
          : `${curr.label}: Belüftung gestoppt`,
        'info'
      );
    } else if (curr.type === 'dosing_pump' && p.dosing !== n.dosing) {
      push(
        id,
        'dp',
        n.dosing
          ? `${curr.label}: Dosiert (${Number(n.flow).toFixed(1)} L/h)`
          : `${curr.label}: Dosierung pausiert`,
        'info'
      );
    } else if (
      curr.type === 'tank' ||
      curr.type === 'anolyte_tank' ||
      curr.type === 'katholyte_tank'
    ) {
      if (!p.isFull && n.isFull) {
        push(id, 'full', `${curr.label}: Tank ist VOLL (100 %)`, 'alert');
      }
      if (!p.isEmpty && n.isEmpty && Number(p.outflow ?? 0) > 0) {
        push(id, 'empty', `${curr.label}: Tank vollständig entleert (0 %)`, 'info');
      }
      if (p.aerated !== n.aerated) {
        push(
          id,
          'air',
          `${curr.label}: ${n.aerated ? 'Sprudel-Belüftung aktiv' : 'Belüftung aus'}`,
          'info'
        );
      }
      if (Number(p.inflow ?? 0) === 0 && Number(n.inflow ?? 0) > 0) {
        push(id, 'fill', `${curr.label}: Befüllung gestartet (+${n.inflow} L/h)`, 'info');
      }
    } else if (
      (curr.type === 'indicator_green' || curr.type === 'indicator_red') &&
      p.lit !== n.lit
    ) {
      push(id, 'lamp', `${curr.label}: Leuchte ${n.lit ? 'EIN' : 'AUS'}`, 'info');
    }
  }

  return events;
}
