import React from 'react';
import {
  AlertTriangle,
  Crosshair,
  PanelRightClose,
  ShieldCheck,
  Trash2,
  Unlink,
  Zap,
} from 'lucide-react';
import { SimComponent } from '../engine/SimComponent';
import {
  DrainConsumerComponent,
  FloatProbeComponent,
  GeneratorComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
} from '../engine/components/FluidComponents';
import { PowerSupply24V, SwitchComponent, SwitchMode } from '../engine/components/PowerAndSwitch';
import { TimeUnit, TimerMode, TimerRelayComponent } from '../engine/components/Relays';
import {
  CurrentTransformerComponent,
  SignalTransmitterComponent,
  TransmitterMode,
} from '../engine/components/SignalAndLogic';
import { TerminalBlockComponent } from '../engine/components/TerminalBlock';
import {
  AnalogSignal,
  ComponentFaultType,
  Connection,
  ConnectionFaultType,
  ElectricalSignal,
  FaultReportItem,
  FluidSignal,
} from '../engine/types';

interface InspectorPanelProps {
  components: SimComponent[];
  connections: Connection[];
  selectedComponent: SimComponent | null;
  selectedConnection: Connection | null;
  faultReports: FaultReportItem[];
  showFaultPanel: boolean;
  onSetShowFaultPanel: (show: boolean) => void;
  onSelectComponent: (id: string | null) => void;
  onSelectConnection: (id: string | null) => void;
  onMutate: () => void;
  onDeleteComponent: (id: string) => void;
  onDeleteConnection: (id: string) => void;
  onDisconnectAllFromComponent: (id: string) => void;
  onTriggerRandomFault: () => void;
  onClearAllFaults: () => void;
  onCollapse: () => void;
}

const FAULT_LABELS: Record<ComponentFaultType, string> = {
  none: 'Kein Fehler (Normalbetrieb)',
  power_failure: 'Ausfall Spannungsversorgung',
  short_circuit: 'Kurzschluss (>25 A)',
  valve_stuck_closed: 'Ventil klemmt (geschlossen / P→A)',
  valve_stuck_open: 'Ventil klemmt (offen / P→B)',
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  components,
  connections,
  selectedComponent,
  selectedConnection,
  faultReports,
  showFaultPanel,
  onSetShowFaultPanel,
  onSelectComponent,
  onSelectConnection,
  onMutate,
  onDeleteComponent,
  onDeleteConnection,
  onDisconnectAllFromComponent,
  onTriggerRandomFault,
  onClearAllFaults,
  onCollapse,
}) => {
  const tanks = components.filter((c): c is TankComponent => c instanceof TankComponent);

  const renderPanelTabs = () => (
    <div className="flex items-stretch border-b border-[#223044] bg-[#0B111A]">
      <div className="grid grid-cols-2 flex-1">
        <button
          type="button"
          onClick={() => onSetShowFaultPanel(false)}
          className={`py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            !showFaultPanel
              ? 'text-sky-300 bg-[#0E1522] border-b-2 border-sky-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Eigenschaften
        </button>
        <button
          type="button"
          onClick={() => onSetShowFaultPanel(true)}
          className={`py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
            showFaultPanel
              ? 'text-red-300 bg-[#0E1522] border-b-2 border-red-400'
              : faultReports.length > 0
              ? 'text-red-400 hover:text-red-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Fehler ({faultReports.length})
        </button>
      </div>
      <button
        type="button"
        onClick={onCollapse}
        title="Eigenschaften ausblenden"
        aria-label="Eigenschaften ausblenden"
        className="px-2.5 border-l border-[#223044] text-slate-400 hover:text-white hover:bg-[#19263B] transition-colors cursor-pointer"
      >
        <PanelRightClose className="w-4 h-4" />
      </button>
    </div>
  );

  // Fehler-Diagnose-Ansicht
  if (showFaultPanel) {
    return (
      <aside className="w-76 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
        {renderPanelTabs()}

        <div className="p-4 border-b border-[#223044] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-100">
              Fehler-Simulation &amp; Diagnose
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Lösen Sie zufällige Störungen aus oder wählen Sie gezielt ein Bauteil bzw. eine Leitung im Schaltplan.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onTriggerRandomFault}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Zufallsfehler</span>
            </button>
            <button
              type="button"
              onClick={onClearAllFaults}
              disabled={faultReports.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Alle beheben</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {faultReports.length === 0 ? (
            <div className="bg-[#141E2E] border border-[#223044] rounded-md p-4 text-center space-y-1.5">
              <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto" />
              <div className="font-medium text-slate-200">Keine aktiven Fehler</div>
              <p className="text-[11px] text-slate-400">
                Alle Bauteile, Leitungen und Ventile arbeiten im Normalbetrieb.
              </p>
            </div>
          ) : (
            faultReports.map((rep) => (
              <div
                key={rep.id}
                className={`rounded-md border p-3 space-y-2 ${
                  rep.severity === 'critical'
                    ? 'bg-red-950/30 border-red-500/45'
                    : 'bg-amber-950/25 border-amber-500/45'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className={`text-[11px] font-semibold flex items-center gap-1.5 ${
                        rep.severity === 'critical' ? 'text-red-300' : 'text-amber-300'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{rep.faultLabel}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-200 mt-0.5 truncate">
                      Ort: {rep.targetLabel}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {rep.impactSummary}
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (rep.targetKind === 'component') {
                        onSelectConnection(null);
                        onSelectComponent(rep.targetId);
                      } else {
                        onSelectComponent(null);
                        onSelectConnection(rep.targetId);
                      }
                      onSetShowFaultPanel(false);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] bg-[#141E2E] text-slate-200 border border-[#2A3B55] hover:bg-[#19263A] cursor-pointer"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Lokalisieren</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (rep.targetKind === 'component') {
                        const c = components.find((item) => item.id === rep.targetId);
                        if (c) c.fault = 'none';
                      } else {
                        const conn = connections.find((item) => item.id === rep.targetId);
                        if (conn) conn.fault = 'none';
                      }
                      onMutate();
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 cursor-pointer"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Beheben</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    );
  }

  // Ansicht 1: Ausgewählte Leitung / Rohrverbindung
  if (selectedConnection) {
    const fromComp = components.find((c) => c.id === selectedConnection.fromComponentId);
    const toComp = components.find((c) => c.id === selectedConnection.toComponentId);
    const fromPort = fromComp?.getPorts().find((p) => p.id === selectedConnection.fromPortId);
    const toPort = toComp?.getPorts().find((p) => p.id === selectedConnection.toPortId);
    const connFault: ConnectionFaultType = selectedConnection.fault ?? 'none';

    return (
      <aside className="w-76 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
        {renderPanelTabs()}

        <div className="px-4 py-2.5 border-b border-[#223044]">
          <h2 className="text-xs font-semibold text-slate-200">
            {selectedConnection.domain === 'electrical'
              ? 'Elektrische Leitung'
              : selectedConnection.domain === 'analog'
              ? 'Analoge Signalleitung'
              : 'Fluid-Rohrleitung'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="bg-[#141E2E] border border-[#223044] rounded-md p-3 space-y-2">
            <div>
              <div className="text-[11px] text-slate-400">Quelle (Ausgang)</div>
              <div className="font-medium text-slate-100 mt-0.5">
                {fromComp?.label ?? '—'} · <span className="font-mono text-sky-300">{fromPort?.label}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Ziel (Eingang)</div>
              <div className="font-medium text-slate-100 mt-0.5">
                {toComp?.label ?? '—'} · <span className="font-mono text-sky-300">{toPort?.label}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#141E2E] border border-[#223044] rounded-md p-3">
            <div className="text-[11px] text-slate-400">Aktueller Zustand</div>
            {selectedConnection.domain === 'electrical' ? (
              <div
                className={`font-mono text-sm font-semibold mt-1 ${
                  selectedConnection.active ? 'text-red-400' : 'text-slate-400'
                }`}
              >
                {selectedConnection.active
                  ? `${selectedConnection.voltage ?? 24} V DC AKTIV`
                  : '0 V (Inaktiv)'}
              </div>
            ) : selectedConnection.domain === 'analog' ? (
              <div
                className={`font-mono text-sm font-semibold mt-1 ${
                  selectedConnection.active ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {(selectedConnection.analogValue ?? 0).toFixed(2)}{' '}
                {selectedConnection.analogUnit ?? 'mA'}
              </div>
            ) : (
              <div
                className={`font-mono text-sm font-semibold mt-1 ${
                  selectedConnection.active ? 'text-sky-400' : 'text-slate-400'
                }`}
              >
                {Math.round(selectedConnection.flowRateLph ?? 0)} L/h Durchfluss
              </div>
            )}
          </div>

          <div className="border-t border-[#223044] pt-4 space-y-2">
            <h3 className="text-[11px] font-semibold text-slate-400">
              Gezielter Leitungsfehler
            </h3>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  selectedConnection.fault =
                    connFault === 'open_circuit' ? 'none' : 'open_circuit';
                  onMutate();
                }}
                className={`w-full px-3 py-1.5 rounded-md text-xs font-medium border text-left transition-colors cursor-pointer ${
                  connFault === 'open_circuit'
                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                    : 'bg-[#141E2E] text-slate-300 border-[#243247] hover:bg-[#19263B]'
                }`}
              >
                {connFault === 'open_circuit'
                  ? '✓ Unterbrechung aktiv (Klicken zum Beheben)'
                  : selectedConnection.domain === 'fluid'
                  ? 'Rohrleitung blockieren / unterbrechen'
                  : 'Leitungsunterbrechung aktivieren'}
              </button>

              {selectedConnection.domain === 'electrical' && (
                <button
                  type="button"
                  onClick={() => {
                    selectedConnection.fault =
                      connFault === 'short_circuit' ? 'none' : 'short_circuit';
                    onMutate();
                  }}
                  className={`w-full px-3 py-1.5 rounded-md text-xs font-medium border text-left transition-colors cursor-pointer ${
                    connFault === 'short_circuit'
                      ? 'bg-red-500/20 text-red-200 border-red-500/50'
                      : 'bg-[#141E2E] text-slate-300 border-[#243247] hover:bg-[#19263B]'
                  }`}
                >
                  {connFault === 'short_circuit'
                    ? '✓ Kurzschluss aktiv (Klicken zum Beheben)'
                    : 'Kurzschluss auf Leitung auslösen'}
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDeleteConnection(selectedConnection.id)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Verbindung trennen (Entf)</span>
          </button>
        </div>
      </aside>
    );
  }

  // Ansicht 2: Ausgewähltes Bauteil
  if (selectedComponent) {
    const ports = selectedComponent.getPorts();
    const attachedCount = connections.filter(
      (c) =>
        c.fromComponentId === selectedComponent.id ||
        c.toComponentId === selectedComponent.id
    ).length;
    const supportedFaults = selectedComponent.getSupportedFaults();

    return (
      <aside className="w-76 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
        {renderPanelTabs()}

        <div className="px-4 py-2.5 border-b border-[#223044] flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-200 truncate">
            Bauteil-Eigenschaften
          </h2>
          <span className="font-mono text-[10px] text-slate-400">{selectedComponent.type}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Bezeichnung
            </label>
            <input
              type="text"
              value={selectedComponent.label}
              onChange={(e) => {
                selectedComponent.label = e.target.value;
                onMutate();
              }}
              className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          {selectedComponent instanceof PowerSupply24V && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Ausgang aktiv</span>
                <button
                  type="button"
                  onClick={() => {
                    selectedComponent.togglePower();
                    onMutate();
                  }}
                  className={`px-3 py-1 rounded text-xs font-semibold border cursor-pointer ${
                    selectedComponent.params.enabled
                      ? 'bg-red-500/20 text-red-300 border-red-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-600'
                  }`}
                >
                  {selectedComponent.params.enabled ? 'EIN (24V)' : 'AUS (0V)'}
                </button>
              </div>
            </div>
          )}

          {selectedComponent instanceof TerminalBlockComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Anzahl Ausgänge (Igel-Klemmen)
                </label>
                <select
                  value={Number(selectedComponent.params.outputCount ?? 10)}
                  onChange={(e) => {
                    selectedComponent.params.outputCount = Number(e.target.value);
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value={5}>5 Ausgänge</option>
                  <option value={10}>10 Ausgänge</option>
                  <option value={15}>15 Ausgänge</option>
                  <option value={20}>20 Ausgänge</option>
                </select>
              </div>
            </div>
          )}

          {selectedComponent instanceof SwitchComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Schaltverhalten
                </label>
                <select
                  value={String(selectedComponent.params.mode ?? 'toggle')}
                  onChange={(e) => {
                    selectedComponent.params.mode = e.target.value as SwitchMode;
                    selectedComponent.params.pressed = false;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="toggle">Schalter (Rastend)</option>
                  <option value="momentary_no">Taster (Schließer NO)</option>
                  <option value="momentary_nc">Taster (Öffner NC)</option>
                </select>
              </div>
            </div>
          )}

          {selectedComponent instanceof TimerRelayComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Betriebsart
                </label>
                <select
                  value={String(selectedComponent.params.mode ?? 'on_delay')}
                  onChange={(e) => {
                    selectedComponent.params.mode = e.target.value as TimerMode;
                    selectedComponent.reset();
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="on_delay">Ansprechverzögert (TON)</option>
                  <option value="off_delay">Rückfallverzögert (TOF)</option>
                  <option value="pulse">Taktgeber (Blinker)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Zeitwert
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={Number(selectedComponent.params.durationValue ?? 5)}
                    onChange={(e) => {
                      selectedComponent.params.durationValue = Math.max(
                        0.1,
                        Number(e.target.value)
                      );
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Einheit
                  </label>
                  <select
                    value={String(selectedComponent.params.durationUnit ?? 's')}
                    onChange={(e) => {
                      selectedComponent.params.durationUnit = e.target.value as TimeUnit;
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="s">Sekunden</option>
                    <option value="m">Minuten</option>
                    <option value="h">Stunden</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {selectedComponent instanceof CurrentTransformerComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Messbereichsendwert (Ampere)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  value={Number(selectedComponent.params.maxCurrentAmps ?? 10)}
                  onChange={(e) => {
                    selectedComponent.params.maxCurrentAmps = Math.max(
                      0.5,
                      Number(e.target.value)
                    );
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Ausgangssignal
                </label>
                <select
                  value={String(selectedComponent.params.outputType ?? '4_20mA')}
                  onChange={(e) => {
                    selectedComponent.params.outputType = e.target.value;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="4_20mA">4–20 mA (Normsignal)</option>
                  <option value="0_10V">0–10 V (Spannungssignal)</option>
                </select>
              </div>
            </div>
          )}

          {selectedComponent instanceof SignalTransmitterComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Umformungs-Modus
                </label>
                <select
                  value={String(selectedComponent.params.conversionMode ?? 'v10_to_ma')}
                  onChange={(e) => {
                    selectedComponent.params.conversionMode = e.target.value as TransmitterMode;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="v10_to_ma">0–10 V → 4–20 mA</option>
                  <option value="v24_to_ma">0–24 V → 4–20 mA</option>
                  <option value="ma_to_v10">4–20 mA → 0–10 V</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Schaltschwelle Q 24V (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Number(selectedComponent.params.thresholdPct ?? 50)}
                  onChange={(e) => {
                    selectedComponent.params.thresholdPct = Math.max(
                      1,
                      Math.min(100, Number(e.target.value))
                    );
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {selectedComponent instanceof TankComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Tankvolumen (Liter)
                </label>
                <input
                  type="number"
                  min={10}
                  max={100000}
                  step={50}
                  value={Number(selectedComponent.params.capacityLiters ?? 1000)}
                  onChange={(e) => {
                    const nextCap = Math.max(10, Number(e.target.value));
                    const prevPct = selectedComponent.getLevelPercent();
                    selectedComponent.params.capacityLiters = nextCap;
                    selectedComponent.setManualLevelPercent(prevPct);
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Schwimmerlanze (Schaltpunkte)
                </label>
                <select
                  value={String(selectedComponent.params.probeMode ?? '3_points')}
                  onChange={(e) => {
                    selectedComponent.params.probeMode = e.target.value as '3_points' | '5_points';
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="3_points">3 Schaltpunkte (Trocken, Min NO, Max NC)</option>
                  <option value="5_points">5 Schaltpunkte (Trocken, Vorleer, Min, Max, Überlauf)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Trockenlauf (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedComponent.params.dryPct ?? 10)}
                    onChange={(e) => {
                      selectedComponent.params.dryPct = Number(e.target.value);
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Min (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedComponent.params.minPct ?? 40)}
                    onChange={(e) => {
                      selectedComponent.params.minPct = Number(e.target.value);
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Max (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedComponent.params.maxPct ?? 80)}
                    onChange={(e) => {
                      selectedComponent.params.maxPct = Number(e.target.value);
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
                {String(selectedComponent.params.probeMode ?? '3_points') === '5_points' && (
                  <>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Vorleer (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Number(selectedComponent.params.preLowPct ?? 25)}
                        onChange={(e) => {
                          selectedComponent.params.preLowPct = Number(e.target.value);
                          onMutate();
                        }}
                        className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Überlauf (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Number(selectedComponent.params.overflowPct ?? 95)}
                        onChange={(e) => {
                          selectedComponent.params.overflowPct = Number(e.target.value);
                          onMutate();
                        }}
                        className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono text-xs text-slate-100"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {selectedComponent instanceof GeneratorComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Produktionsleistung (Liter / Stunde)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={50}
                  value={Number(selectedComponent.params.flowRateLph ?? 1200)}
                  onChange={(e) => {
                    selectedComponent.params.flowRateLph = Math.max(
                      0,
                      Number(e.target.value)
                    );
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {selectedComponent instanceof SolenoidValve22Component && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Ruhezustand (bei 0V)
                </label>
                <select
                  value={String(selectedComponent.params.normalState ?? 'NC')}
                  onChange={(e) => {
                    selectedComponent.params.normalState = e.target.value as 'NC' | 'NO';
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="NC">Stromlos geschlossen (NC)</option>
                  <option value="NO">Stromlos offen (NO)</option>
                </select>
              </div>
            </div>
          )}

          {selectedComponent instanceof DrainConsumerComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Ablassrate (Liter / Stunde)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={25}
                  value={Number(selectedComponent.params.drainRateLph ?? 450)}
                  onChange={(e) => {
                    selectedComponent.params.drainRateLph = Math.max(
                      0,
                      Number(e.target.value)
                    );
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Manueller Testbetrieb</span>
                <button
                  type="button"
                  onClick={() => {
                    selectedComponent.params.manualOverride = !Boolean(
                      selectedComponent.params.manualOverride
                    );
                    onMutate();
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                    selectedComponent.params.manualOverride
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-600'
                  }`}
                >
                  {selectedComponent.params.manualOverride ? 'EIN' : 'AUS'}
                </button>
              </div>
            </div>
          )}

          {supportedFaults.length > 0 && (
            <div className="border-t border-[#223044] pt-4 space-y-2">
              <h3 className="text-[11px] font-semibold text-slate-400">
                Fehler-Simulation (Gezielt)
              </h3>
              <select
                aria-label="Fehler für Bauteil auswählen"
                value={selectedComponent.fault}
                onChange={(e) => {
                  selectedComponent.fault = e.target.value as ComponentFaultType;
                  onMutate();
                }}
                className={`w-full rounded-md px-2.5 py-1.5 text-xs border focus:outline-none cursor-pointer ${
                  selectedComponent.fault !== 'none'
                    ? 'bg-red-950/50 border-red-500/60 text-red-200'
                    : 'bg-[#0B111A] border-[#243247] text-slate-200'
                }`}
              >
                <option value="none">{FAULT_LABELS.none}</option>
                {supportedFaults.map((f) => {
                  let text = FAULT_LABELS[f];
                  if (selectedComponent instanceof SolenoidValve32Component) {
                    if (f === 'valve_stuck_closed') text = 'Klemmt in Stellung P → A';
                    if (f === 'valve_stuck_open') text = 'Klemmt in Stellung P → B';
                  }
                  return (
                    <option key={f} value={f}>
                      {text}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="border-t border-[#223044] pt-4">
            <h3 className="text-[11px] font-semibold text-slate-400 mb-2">
              Klemmen-Status (Live)
            </h3>
            <div className="space-y-1.5">
              {ports.map((p) => {
                const sig = selectedComponent.portSignals.get(p.id);
                let valText = '—';
                let valColor = 'text-slate-400';

                if (p.domain === 'electrical') {
                  const eSig = sig as ElectricalSignal | undefined;
                  const on = Boolean(eSig?.energized);
                  valText = on ? `${eSig?.voltage ?? 24} V` : '0 V';
                  valColor = on ? 'text-red-400 font-semibold' : 'text-slate-500';
                } else if (p.domain === 'analog') {
                  const aSig = sig as AnalogSignal | undefined;
                  valText = aSig ? `${aSig.value.toFixed(1)} ${aSig.unit}` : '4.0 mA';
                  valColor = aSig?.active ? 'text-emerald-400 font-semibold' : 'text-slate-500';
                } else if (p.domain === 'fluid') {
                  const fSig = sig as FluidSignal | undefined;
                  const flow = fSig?.flowRateLph ?? 0;
                  valText = `${Math.round(flow)} L/h`;
                  valColor = flow > 0 ? 'text-sky-400 font-semibold' : 'text-slate-500';
                }

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-[#141E2E] border border-[#223044] rounded px-2.5 py-1.5"
                  >
                    <span className="font-mono text-[11px] text-slate-200">
                      {p.label}
                    </span>
                    <span className={`font-mono text-[11px] ${valColor}`}>{valText}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#223044] pt-4 space-y-2">
            {attachedCount > 0 && (
              <button
                type="button"
                onClick={() => onDisconnectAllFromComponent(selectedComponent.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#141E2E] text-slate-300 border border-[#243247] hover:bg-[#19263B] transition-colors cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Alle {attachedCount} Leitungen lösen</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onDeleteComponent(selectedComponent.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bauteil entfernen (Entf)</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Ansicht 3: Systemübersicht
  const activeElecCount = connections.filter(
    (c) => c.domain === 'electrical' && c.active
  ).length;
  const activeFluidCount = connections.filter(
    (c) => c.domain === 'fluid' && c.active
  ).length;

  return (
    <aside className="w-76 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
      {renderPanelTabs()}

      <div className="px-4 py-2.5 border-b border-[#223044]">
        <h2 className="text-xs font-semibold text-slate-200">
          Anlagen-Inspektor
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Bauteil oder Leitung anklicken
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-400">
            Netzwerk-Übersicht
          </h3>
          <div className="bg-[#141E2E] border border-[#223044] rounded-md p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Bauteile</span>
              <span className="font-mono text-slate-100">{components.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">24V Leitungen aktiv</span>
              <span className="font-mono text-red-400">{activeElecCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fluid-Rohre aktiv</span>
              <span className="font-mono text-sky-400">{activeFluidCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Aktive Fehler</span>
              <span
                className={`font-mono ${
                  faultReports.length > 0 ? 'text-red-400 font-semibold' : 'text-emerald-400'
                }`}
              >
                {faultReports.length}
              </span>
            </div>
          </div>
        </div>

        {tanks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-slate-400">
              Tank-Füllstände
            </h3>
            <div className="space-y-2">
              {tanks.map((tank) => {
                const pct = tank.getLevelPercent();
                return (
                  <div
                    key={tank.id}
                    className="bg-[#141E2E] border border-[#223044] rounded-md p-2.5 space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-200 truncate">
                        {tank.label}
                      </span>
                      <span className="font-mono text-sky-300">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#0B111A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>{Math.round(tank.getLevelLiters())} L</span>
                      <span>max. {tank.getCapacity()} L</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-[#223044] pt-4">
          <h3 className="text-[11px] font-semibold text-slate-400">
            Bedienung
          </h3>
          <ol className="text-[11px] text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Bauteile links per Drag &amp; Drop auf die Fläche ziehen.</li>
            <li>Klemmen anklicken, um 24V, 4–20mA oder Rohre zu verbinden.</li>
            <li>Über „Zufallsfehler“ oder im Inspektor Störungen testen.</li>
            <li>Schaltplan jederzeit als JSON speichern und laden.</li>
          </ol>
        </div>
      </div>
    </aside>
  );
};
