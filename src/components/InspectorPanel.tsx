import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Crosshair,
  GitFork,
  PanelRightClose,
  ShieldCheck,
  Syringe,
  Trash2,
  Unlink,
  X,
  Zap,
} from 'lucide-react';
import { SimComponent } from '../engine/SimComponent';
import {
  DDA_MODELS,
  DdaModel,
  DdaOperatingMode,
  DosingPumpComponent,
  DrainConsumerComponent,
  FloatProbeComponent,
  FluidTeeComponent,
  GeneratorComponent,
  GeneratorControlMode,
  GullyDrainComponent,
  InjectionPointComponent,
  MainWaterLineComponent,
  SolenoidValve22Component,
  SolenoidValve32Component,
  TankComponent,
  TankProbeMode,
  TeeMode,
  WaterMeterComponent,
} from '../engine/components/FluidComponents';
import { PowerSupply24V, SwitchComponent, SwitchMode } from '../engine/components/PowerAndSwitch';
import {
  TELE_FUNCTIONS,
  TELE_TIME_RANGES,
  TeleTimeRange,
  TeleTimerFunction,
  TimerRelayComponent,
  formatTeleDuration,
} from '../engine/components/Relays';
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
  FluidMedium,
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
  onPruneComponentPorts: (componentId: string) => void;
  onInsertOnFluidConnection: (
    connectionId: string,
    newType: 'fluid_tee' | 'injection_point'
  ) => void;
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
  onPruneComponentPorts,
  onInsertOnFluidConnection,
  onDeleteComponent,
  onDeleteConnection,
  onDisconnectAllFromComponent,
  onTriggerRandomFault,
  onClearAllFaults,
  onCollapse,
}) => {
  const [confirmingConnId, setConfirmingConnId] = useState<string | null>(null);
  const [confirmingAllFromComp, setConfirmingAllFromComp] = useState(false);

  useEffect(() => {
    setConfirmingConnId(null);
    setConfirmingAllFromComp(false);
  }, [selectedComponent?.id, selectedConnection?.id]);

  const tanks = components.filter((c): c is TankComponent => c instanceof TankComponent);

  const renderPanelTabs = () => (
    <div className="flex items-stretch border-b border-[#223044] bg-[#0B111A]">
      <button
        type="button"
        onClick={onCollapse}
        title="Eigenschaften ausblenden"
        aria-label="Eigenschaften ausblenden"
        className="px-2.5 border-r border-[#223044] text-slate-400 hover:text-white hover:bg-[#19263B] transition-colors cursor-pointer shrink-0"
      >
        <PanelRightClose className="w-4 h-4" />
      </button>
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
    </div>
  );

  // Fehler-Diagnose-Ansicht
  if (showFaultPanel) {
    return (
      <aside className="w-80 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
        {renderPanelTabs()}

        <div className="p-4 border-b border-[#223044] space-y-2">
          <h2 className="text-xs font-semibold text-slate-100">Fehler-Simulation &amp; Diagnose</h2>
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
                <p className="text-[11px] text-slate-300 leading-relaxed">{rep.impactSummary}</p>
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
      <aside className="w-80 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
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
              <div className={`font-mono text-sm font-semibold mt-1 ${selectedConnection.active ? 'text-red-400' : 'text-slate-400'}`}>
                {selectedConnection.active ? `${selectedConnection.voltage ?? 24} V DC AKTIV` : '0 V (Inaktiv)'}
              </div>
            ) : selectedConnection.domain === 'analog' ? (
              <div className={`font-mono text-sm font-semibold mt-1 ${selectedConnection.active ? 'text-emerald-400' : 'text-slate-400'}`}>
                {(selectedConnection.analogValue ?? 0).toFixed(2)} {selectedConnection.analogUnit ?? 'mA'}
              </div>
            ) : (
              <div className="space-y-1 mt-1">
                <div className={`font-mono text-sm font-semibold ${selectedConnection.active ? 'text-sky-400' : 'text-slate-400'}`}>
                  {(selectedConnection.flowRateLph ?? 0).toFixed(1)} L/h Durchfluss
                </div>
                <div className="text-[11px] text-slate-400">
                  Medium:{' '}
                  <span className="font-semibold text-slate-200">
                    {selectedConnection.medium === 'katholyte'
                      ? 'Katholyt (Grün)'
                      : selectedConnection.medium === 'anolyte'
                      ? 'Anolyt (Blau)'
                      : 'Wasser (Blau)'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {selectedConnection.domain === 'fluid' && (
            <div className="border-t border-[#223044] pt-4 space-y-2">
              <h3 className="text-[11px] font-semibold text-slate-400">
                Bauteil direkt in Leitung einfügen
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onInsertOnFluidConnection(selectedConnection.id, 'fluid_tee')}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium bg-[#141E2E] text-sky-300 border border-[#243247] hover:border-sky-500/60 hover:bg-[#19263B] cursor-pointer"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>T-Stück</span>
                </button>
                <button
                  type="button"
                  onClick={() => onInsertOnFluidConnection(selectedConnection.id, 'injection_point')}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium bg-[#141E2E] text-emerald-300 border border-[#243247] hover:border-emerald-500/60 hover:bg-[#19263B] cursor-pointer"
                >
                  <Syringe className="w-3.5 h-3.5" />
                  <span>Impfstelle</span>
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-[#223044] pt-4 space-y-2">
            <h3 className="text-[11px] font-semibold text-slate-400">Gezielter Leitungsfehler</h3>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  selectedConnection.fault = connFault === 'open_circuit' ? 'none' : 'open_circuit';
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

          <div className="border-t border-[#223044] pt-4">
            {confirmingConnId === selectedConnection.id ? (
              <div className="bg-red-950/35 border border-red-500/50 rounded-md p-2.5 space-y-2">
                <div className="text-[11px] text-red-200 font-medium">
                  Diese Leitung wirklich trennen?
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteConnection(selectedConnection.id);
                      setConfirmingConnId(null);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Ja, trennen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingConnId(null)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Abbrechen</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingConnId(selectedConnection.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Verbindung trennen</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // Ansicht 2: Ausgewähltes Bauteil
  if (selectedComponent) {
    const ports = selectedComponent.getPorts();
    const attachedConnections = connections.filter(
      (c) =>
        c.fromComponentId === selectedComponent.id ||
        c.toComponentId === selectedComponent.id
    );
    const supportedFaults = selectedComponent.getSupportedFaults();

    return (
      <aside className="w-80 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
        {renderPanelTabs()}

        <div className="px-4 py-2.5 border-b border-[#223044] flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-200 truncate">Bauteil-Eigenschaften</h2>
          <span className="font-mono text-[10px] text-slate-400">{selectedComponent.type}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Bezeichnung</label>
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
                    onPruneComponentPorts(selectedComponent.id);
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
                <label className="block text-[11px] text-slate-400 mb-1">Schaltverhalten</label>
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

          {/* TELE ENYA E1ZM10 Zeitrelais */}
          {selectedComponent instanceof TimerRelayComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Funktion (TELE E1ZM10)
                </label>
                <select
                  value={selectedComponent.getTeleFunction()}
                  onChange={(e) => {
                    selectedComponent.params.teleFunction = e.target.value as TeleTimerFunction;
                    selectedComponent.reset();
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {TELE_FUNCTIONS.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] text-slate-400 mt-1.5 leading-snug bg-[#141E2E] border border-[#223044] rounded p-2">
                  {TELE_FUNCTIONS.find((f) => f.code === selectedComponent.getTeleFunction())?.description}
                </p>

                {(() => {
                  const currentFn = TELE_FUNCTIONS.find(
                    (f) => f.code === selectedComponent.getTeleFunction()
                  );
                  return (
                    <div className="mt-2 bg-[#121D2E] border border-sky-500/30 rounded p-2.5 space-y-1.5 text-[10.5px]">
                      <div className="font-semibold text-sky-300">
                        Anschluss-Empfehlung für {currentFn?.code}:
                      </div>
                      <ul className="space-y-1 text-slate-300">
                        <li>
                          • <strong className="text-slate-100 font-mono">A1 (+):</strong> Dauerhaft an 24V DC (Betriebsspannung).
                        </li>
                        <li>
                          • <strong className="text-slate-100 font-mono">B1 (S):</strong>{' '}
                          {currentFn?.usesB1 ? (
                            <span className="text-amber-300 font-medium">Wird benötigt! Über Schalter/Taster an 24V anschließen.</span>
                          ) : (
                            <span className="text-slate-400">Wird <strong className="text-slate-200">nicht</strong> benötigt (offen lassen).</span>
                          )}
                        </li>
                        <li>
                          • <strong className="text-slate-100 font-mono">15 / 16 / 18:</strong> Wechsler (15 = COM Eingang, 18 = Schließer NO).
                        </li>
                      </ul>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Zeitbereich</label>
                <select
                  value={selectedComponent.getTeleRange()}
                  onChange={(e) => {
                    selectedComponent.params.teleRange = e.target.value as TeleTimeRange;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {TELE_TIME_RANGES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} ({r.minLabel} – {r.maxLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Feineinstellung (5–100%)</span>
                  <span className="font-mono text-lime-300 font-semibold">
                    {formatTeleDuration(selectedComponent.getTargetSeconds())} ({selectedComponent.getTeleScalePct()}%)
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={selectedComponent.getTeleScalePct()}
                  onChange={(e) => {
                    selectedComponent.params.teleScalePct = Number(e.target.value);
                    onMutate();
                  }}
                  className="w-full accent-lime-400 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Anolyte / Katholyte Tank */}
          {selectedComponent instanceof TankComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Medium</label>
                  <select
                    value={selectedComponent.getMedium()}
                    onChange={(e) => {
                      selectedComponent.params.medium = e.target.value as FluidMedium;
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2 py-1.5 text-slate-100 cursor-pointer"
                  >
                    <option value="anolyte">Anolyt (Blau)</option>
                    <option value="katholyte">Katholyt (Grün)</option>
                    <option value="water">Wasser (Blau)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Volumen (L)</label>
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
                    className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2 py-1.5 font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Sauglanzen (für Dosierpumpen)
                </label>
                <select
                  value={selectedComponent.getSuctionCount()}
                  onChange={(e) => {
                    selectedComponent.params.suctionCount = Number(e.target.value);
                    onPruneComponentPorts(selectedComponent.id);
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value={0}>0 Sauglanzen</option>
                  <option value={1}>1 Sauglanze (Standard)</option>
                  <option value={2}>2 Sauglanzen</option>
                  <option value={3}>3 Sauglanzen</option>
                  <option value={4}>4 Sauglanzen</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Schwimmerlanze (Schaltpunkte)
                </label>
                <select
                  value={selectedComponent.getProbeMode()}
                  onChange={(e) => {
                    selectedComponent.params.probeMode = e.target.value as TankProbeMode;
                    onPruneComponentPorts(selectedComponent.id);
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value="none">Keine Schwimmerlanze</option>
                  <option value="3_points">3 Schaltpunkte (Trocken, Min NO, Max NC)</option>
                  <option value="5_points">5 Schaltpunkte (Trocken, Vorleer, Min, Max, Überlauf)</option>
                </select>
              </div>

              {selectedComponent.getProbeMode() !== 'none' && (
                <div className="space-y-2 bg-[#141E2E] border border-[#223044] rounded-md p-2.5">
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
                    {selectedComponent.getProbeMode() === '5_points' && (
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

                  <div className="pt-1 border-t border-[#223044] space-y-1 text-[10.5px]">
                    <div className="text-slate-400 font-medium">Kontaktlogik umkehren (NO ↔ NC):</div>
                    <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                      <span>MIN invertieren</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedComponent.params.invertMin)}
                        onChange={(e) => {
                          selectedComponent.params.invertMin = e.target.checked;
                          onMutate();
                        }}
                      />
                    </label>
                    <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                      <span>MAX invertieren</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedComponent.params.invertMax)}
                        onChange={(e) => {
                          selectedComponent.params.invertMax = e.target.checked;
                          onMutate();
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Separate Schwimmerlanze */}
          {selectedComponent instanceof FloatProbeComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Zugeordneter Tank</label>
                <select
                  value={String(selectedComponent.params.tankId ?? '')}
                  onChange={(e) => {
                    selectedComponent.params.tankId = e.target.value;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value="">— Manuell (ohne Tank) —</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400">Trocken %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedComponent.params.dryPct ?? 10)}
                    onChange={(e) => {
                      selectedComponent.params.dryPct = Number(e.target.value);
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Min %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedComponent.params.minPct ?? 40)}
                    onChange={(e) => {
                      selectedComponent.params.minPct = Number(e.target.value);
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Max %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedComponent.params.maxPct ?? 80)}
                    onChange={(e) => {
                      selectedComponent.params.maxPct = Number(e.target.value);
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Erzeuger-Anlage */}
          {selectedComponent instanceof GeneratorComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Steuerungsart</label>
                <select
                  value={selectedComponent.getControlMode()}
                  onChange={(e) => {
                    selectedComponent.params.controlMode = e.target.value as GeneratorControlMode;
                    onPruneComponentPorts(selectedComponent.id);
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value="tank_minmax">Tank-Automatik (MIN + MAX Hysterese)</option>
                  <option value="enable_24v">Externe 24V-Freigabe (EN + Sperre)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10.5px] text-sky-300 mb-1">Anolyt (L/h)</label>
                  <input
                    type="number"
                    min={0}
                    max={50000}
                    step={25}
                    value={selectedComponent.getAnolyteNominalLph()}
                    onChange={(e) => {
                      selectedComponent.params.anolyteFlowLph = Math.max(0, Number(e.target.value));
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1.5 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] text-emerald-300 mb-1">Katholyt (L/h)</label>
                  <input
                    type="number"
                    min={0}
                    max={50000}
                    step={25}
                    value={selectedComponent.getKatholyteNominalLph()}
                    onChange={(e) => {
                      selectedComponent.params.katholyteFlowLph = Math.max(0, Number(e.target.value));
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1.5 font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-300">Hand-Stopp / Automatik</span>
                <button
                  type="button"
                  onClick={() => {
                    selectedComponent.params.manualStop = !Boolean(selectedComponent.params.manualStop);
                    onMutate();
                  }}
                  className={`px-3 py-1 rounded text-xs font-semibold border cursor-pointer ${
                    selectedComponent.params.manualStop
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {selectedComponent.params.manualStop ? 'HAND-STOPP' : 'AUTOMATIK'}
                </button>
              </div>
            </div>
          )}

          {/* 2/2-Magnetventil */}
          {selectedComponent instanceof SolenoidValve22Component && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Ruhezustand (bei 0V)</label>
                <select
                  value={String(selectedComponent.params.normalState ?? 'NC')}
                  onChange={(e) => {
                    selectedComponent.params.normalState = e.target.value as 'NC' | 'NO';
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value="NC">Stromlos geschlossen (NC)</option>
                  <option value="NO">Stromlos offen (NO)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Durchfluss-Kapazität (L/h)
                </label>
                <input
                  type="number"
                  min={10}
                  max={50000}
                  step={50}
                  value={selectedComponent.getFlowRateLimitLph()}
                  onChange={(e) => {
                    selectedComponent.params.flowRateLph = Math.max(10, Number(e.target.value));
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
            </div>
          )}

          {/* Verbraucher */}
          {selectedComponent instanceof DrainConsumerComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Ablassrate (L/h)</label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={25}
                  value={Number(selectedComponent.params.drainRateLph ?? 450)}
                  onChange={(e) => {
                    selectedComponent.params.drainRateLph = Math.max(0, Number(e.target.value));
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Manueller Testbetrieb</span>
                <button
                  type="button"
                  onClick={() => {
                    selectedComponent.params.manualOverride = !Boolean(selectedComponent.params.manualOverride);
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

          {/* Gulli */}
          {selectedComponent instanceof GullyDrainComponent && (
            <div className="space-y-2 border-t border-[#223044] pt-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Aktueller Ablauf</span>
                <span className="font-mono text-sky-300">
                  {Math.round(Number(selectedComponent.runtimeState.actualFlowLph ?? 0))} L/h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Verworfene Gesamtmenge</span>
                <span className="font-mono text-slate-200">
                  {Number(selectedComponent.runtimeState.totalDiscardedLiters ?? 0).toFixed(2)} L
                </span>
              </div>
            </div>
          )}

          {/* Hauptleitung */}
          {selectedComponent instanceof MainWaterLineComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Volumenstrom (L/h)</span>
                  <span className="font-mono text-sky-300">
                    {(selectedComponent.getNominalFlowLph() / 1000).toFixed(2)} m³/h
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={200000}
                  step={100}
                  value={selectedComponent.getNominalFlowLph()}
                  onChange={(e) => {
                    selectedComponent.params.flowRateLph = Math.max(0, Number(e.target.value));
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>24V-Freigabe (EN) erforderlich</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedComponent.params.require24V)}
                  onChange={(e) => {
                    selectedComponent.params.require24V = e.target.checked;
                    onMutate();
                  }}
                />
              </label>
            </div>
          )}

          {/* Kontakt-Wasserzähler */}
          {selectedComponent instanceof WaterMeterComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Taktung (Liter pro 24V-Impuls)
                </label>
                <div className="grid grid-cols-4 gap-1 mb-1.5">
                  {[1, 10, 100, 1000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        selectedComponent.params.litersPerPulse = v;
                        onMutate();
                      }}
                      className={`py-1 rounded text-[10.5px] font-mono border cursor-pointer ${
                        Number(selectedComponent.params.litersPerPulse ?? 10) === v
                          ? 'bg-sky-600 text-white border-sky-500'
                          : 'bg-[#0B111A] text-slate-300 border-[#243247]'
                      }`}
                    >
                      {v} L
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={Number(selectedComponent.params.litersPerPulse ?? 10)}
                  onChange={(e) => {
                    selectedComponent.params.litersPerPulse = Math.max(0.1, Number(e.target.value));
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Impulsdauer (s)</label>
                  <input
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={Number(selectedComponent.params.pulseDurationSec ?? 0.5)}
                    onChange={(e) => {
                      selectedComponent.params.pulseDurationSec = Math.max(0.1, Number(e.target.value));
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">20mA-Endwert (L/h)</label>
                  <input
                    type="number"
                    min={10}
                    step={500}
                    value={Number(selectedComponent.params.maxFlowLph ?? 10000)}
                    onChange={(e) => {
                      selectedComponent.params.maxFlowLph = Math.max(10, Number(e.target.value));
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Grundfos DDA Dosierpumpe */}
          {selectedComponent instanceof DosingPumpComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Pumpentyp</label>
                <select
                  value={String(selectedComponent.params.model ?? 'DDA 17-7')}
                  onChange={(e) => {
                    selectedComponent.params.model = e.target.value as DdaModel;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  {(Object.keys(DDA_MODELS) as DdaModel[]).map((m) => (
                    <option key={m} value={m}>
                      {DDA_MODELS[m].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Betriebsart</label>
                <select
                  value={selectedComponent.getOperatingMode()}
                  onChange={(e) => {
                    selectedComponent.params.operatingMode = e.target.value as DdaOperatingMode;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value="manual">Manuell (L/h fest)</option>
                  <option value="pulse">Kontakt / Impuls (mL pro Impuls)</option>
                  <option value="analog">Analog (4–20 mA Profil)</option>
                </select>
              </div>

              {selectedComponent.getOperatingMode() === 'manual' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Förderleistung (0 – {selectedComponent.getMaxFlowLph()} L/h)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={selectedComponent.getMaxFlowLph()}
                    step={0.5}
                    value={Number(selectedComponent.params.manualFlowLph ?? 5)}
                    onChange={(e) => {
                      selectedComponent.params.manualFlowLph = Math.max(
                        0,
                        Math.min(selectedComponent.getMaxFlowLph(), Number(e.target.value))
                      );
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              )}

              {selectedComponent.getOperatingMode() === 'pulse' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Dosiermenge pro Kontakt-Impuls (mL)
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    max={500}
                    step={0.5}
                    value={Number(selectedComponent.params.mlPerPulse ?? 2.0)}
                    onChange={(e) => {
                      selectedComponent.params.mlPerPulse = Math.max(0.05, Number(e.target.value));
                      onMutate();
                    }}
                    className="w-full bg-[#0B111A] border border-[#243247] rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              )}

              {selectedComponent.getOperatingMode() === 'analog' && (
                <div className="bg-[#141E2E] border border-[#223044] rounded-md p-2.5 space-y-2">
                  <div className="text-[11px] font-semibold text-emerald-300">Analogprofil (4–20 mA)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">Min mA</label>
                      <input
                        type="number"
                        step={0.5}
                        value={Number(selectedComponent.params.analogMinMa ?? 4)}
                        onChange={(e) => {
                          selectedComponent.params.analogMinMa = Number(e.target.value);
                          onMutate();
                        }}
                        className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Leistung bei Min (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Number(selectedComponent.params.analogMinPct ?? 0)}
                        onChange={(e) => {
                          selectedComponent.params.analogMinPct = Number(e.target.value);
                          onMutate();
                        }}
                        className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Max mA</label>
                      <input
                        type="number"
                        step={0.5}
                        value={Number(selectedComponent.params.analogMaxMa ?? 20)}
                        onChange={(e) => {
                          selectedComponent.params.analogMaxMa = Number(e.target.value);
                          onMutate();
                        }}
                        className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Leistung bei Max (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Number(selectedComponent.params.analogMaxPct ?? 100)}
                        onChange={(e) => {
                          selectedComponent.params.analogMaxPct = Number(e.target.value);
                          onMutate();
                        }}
                        className="w-full bg-[#0B111A] border border-[#243247] rounded px-2 py-1 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>24V-Freigabe (Klemme) nötig</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedComponent.params.require24VEnable)}
                  onChange={(e) => {
                    selectedComponent.params.require24VEnable = e.target.checked;
                    onMutate();
                  }}
                />
              </label>
            </div>
          )}

          {/* T-Stück */}
          {selectedComponent instanceof FluidTeeComponent && (
            <div className="space-y-2 border-t border-[#223044] pt-4">
              <label className="block text-[11px] text-slate-400 mb-1">Flussrichtung</label>
              <select
                value={selectedComponent.getTeeMode()}
                onChange={(e) => {
                  selectedComponent.params.teeMode = e.target.value as TeeMode;
                  onPruneComponentPorts(selectedComponent.id);
                  onMutate();
                }}
                className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
              >
                <option value="split">Verteiler (1 Eingang → 2 Ausgänge)</option>
                <option value="merge">Sammler (2 Eingänge → 1 Ausgang)</option>
              </select>
            </div>
          )}

          {/* Impfstelle */}
          {selectedComponent instanceof InjectionPointComponent && (
            <div className="space-y-2 border-t border-[#223044] pt-4 bg-[#141E2E] rounded p-2.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Hauptstrom</span>
                <span className="font-mono text-sky-300">
                  {Math.round(Number(selectedComponent.runtimeState.mainFlowLph ?? 0))} L/h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Dosier-Impfung</span>
                <span className="font-mono text-emerald-300">
                  {Number(selectedComponent.runtimeState.dosingFlowLph ?? 0).toFixed(2)} L/h
                </span>
              </div>
              <div className="flex justify-between border-t border-[#223044] pt-1.5">
                <span className="text-slate-300 font-medium">Konzentration</span>
                <span className="font-mono text-amber-300 font-semibold">
                  {Number(selectedComponent.runtimeState.concentrationPpm ?? 0).toFixed(1)} mL/m³
                </span>
              </div>
            </div>
          )}

          {selectedComponent instanceof CurrentTransformerComponent && (
            <div className="space-y-3 border-t border-[#223044] pt-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Messbereichsendwert (A)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={Number(selectedComponent.params.maxCurrentAmps ?? 10)}
                  onChange={(e) => {
                    selectedComponent.params.maxCurrentAmps = Math.max(0.5, Number(e.target.value));
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Ausgangssignal</label>
                <select
                  value={String(selectedComponent.params.outputType ?? '4_20mA')}
                  onChange={(e) => {
                    selectedComponent.params.outputType = e.target.value;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
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
                <label className="block text-[11px] text-slate-400 mb-1">Umformungs-Modus</label>
                <select
                  value={String(selectedComponent.params.conversionMode ?? 'v10_to_ma')}
                  onChange={(e) => {
                    selectedComponent.params.conversionMode = e.target.value as TransmitterMode;
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 text-slate-100 cursor-pointer"
                >
                  <option value="v10_to_ma">0–10 V → 4–20 mA</option>
                  <option value="v24_to_ma">0–24 V → 4–20 mA</option>
                  <option value="ma_to_v10">4–20 mA → 0–10 V</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Schaltschwelle Q 24V (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Number(selectedComponent.params.thresholdPct ?? 50)}
                  onChange={(e) => {
                    selectedComponent.params.thresholdPct = Math.max(1, Math.min(100, Number(e.target.value)));
                    onMutate();
                  }}
                  className="w-full bg-[#0B111A] border border-[#243247] rounded-md px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
            </div>
          )}

          {supportedFaults.length > 0 && (
            <div className="border-t border-[#223044] pt-4 space-y-2">
              <h3 className="text-[11px] font-semibold text-slate-400">Fehler-Simulation (Gezielt)</h3>
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

          {/* Klemmen-Status & Einzel-Leitungen mit Bestätigung zum Trennen */}
          <div className="border-t border-[#223044] pt-4">
            <h3 className="text-[11px] font-semibold text-slate-400 mb-2">
              Klemmen &amp; Einzel-Leitungen
            </h3>
            <div className="space-y-2">
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

                const portConns = attachedConnections.filter(
                  (c) =>
                    (c.fromComponentId === selectedComponent.id && c.fromPortId === p.id) ||
                    (c.toComponentId === selectedComponent.id && c.toPortId === p.id)
                );

                return (
                  <div
                    key={p.id}
                    className="bg-[#141E2E] border border-[#223044] rounded px-2.5 py-1.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] font-semibold text-slate-200">
                          {p.label}
                        </div>
                        {p.description && (
                          <div className="text-[10px] text-slate-400 leading-tight">
                            {p.description}
                          </div>
                        )}
                      </div>
                      <span className={`font-mono text-[11px] shrink-0 ${valColor}`}>{valText}</span>
                    </div>

                    {portConns.map((c) => {
                      const isOutgoing = c.fromComponentId === selectedComponent.id;
                      const otherCompId = isOutgoing ? c.toComponentId : c.fromComponentId;
                      const otherPortId = isOutgoing ? c.toPortId : c.fromPortId;
                      const otherComp = components.find((item) => item.id === otherCompId);
                      const otherPort = otherComp?.getPorts().find((op) => op.id === otherPortId);
                      const isConfirming = confirmingConnId === c.id;
                      const isSelfBridge = otherCompId === selectedComponent.id;

                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#1E2A3B] text-[10.5px]"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectComponent(null);
                              onSelectConnection(c.id);
                            }}
                            className="text-slate-300 hover:text-sky-300 truncate text-left flex-1 cursor-pointer"
                            title="Leitung auswählen"
                          >
                            {isSelfBridge
                              ? `Brücke ↔ ${otherPort?.label ?? otherPortId}`
                              : `${isOutgoing ? '→' : '←'} ${otherComp?.label ?? '?'} (${
                                  otherPort?.label ?? otherPortId
                                })`}
                          </button>

                          {isConfirming ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteConnection(c.id);
                                  setConfirmingConnId(null);
                                }}
                                title="Wirklich trennen"
                                className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold cursor-pointer"
                              >
                                Ja
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingConnId(null)}
                                title="Abbrechen"
                                className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                              >
                                Nein
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingConnId(c.id)}
                              title="Diese einzelne Leitung trennen"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-300 bg-[#0B111A] border border-[#243247] hover:text-red-300 hover:border-red-500/50 hover:bg-red-500/15 transition-colors cursor-pointer shrink-0"
                            >
                              <Unlink className="w-2.5 h-2.5" />
                              <span>Trennen</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#223044] pt-4 space-y-2">
            {attachedConnections.length > 0 &&
              (confirmingAllFromComp ? (
                <div className="bg-amber-950/35 border border-amber-500/50 rounded-md p-2 space-y-1.5">
                  <div className="text-[11px] text-amber-200">
                    Wirklich alle {attachedConnections.length} Leitungen von diesem Bauteil lösen?
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onDisconnectAllFromComponent(selectedComponent.id);
                        setConfirmingAllFromComp(false);
                      }}
                      className="flex-1 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                    >
                      Ja, alle lösen
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingAllFromComp(false)}
                      className="flex-1 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingAllFromComp(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#141E2E] text-slate-300 border border-[#243247] hover:bg-[#19263B] transition-colors cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Alle {attachedConnections.length} Leitungen lösen</span>
                </button>
              ))}

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
  const activeElecCount = connections.filter((c) => c.domain === 'electrical' && c.active).length;
  const activeFluidCount = connections.filter((c) => c.domain === 'fluid' && c.active).length;

  return (
    <aside className="w-80 bg-[#0E1522] border-l border-[#223044] flex flex-col shrink-0 overflow-hidden max-md:fixed max-md:inset-y-14 max-md:right-0 max-md:z-40 max-md:shadow-2xl">
      {renderPanelTabs()}

      <div className="px-4 py-2.5 border-b border-[#223044]">
        <h2 className="text-xs font-semibold text-slate-200">Anlagen-Inspektor</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Bauteil oder Leitung anklicken (oder Zahnrad-Symbol nutzen)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-400">Netzwerk-Übersicht</h3>
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
            <h3 className="text-[11px] font-semibold text-slate-400">Tank-Füllstände</h3>
            <div className="space-y-2">
              {tanks.map((tank) => {
                const pct = tank.getLevelPercent();
                const isKat = tank.getMedium() === 'katholyte';
                return (
                  <div
                    key={tank.id}
                    onClick={() => onSelectComponent(tank.id)}
                    className="bg-[#141E2E] border border-[#223044] hover:border-sky-500/50 rounded-md p-2.5 space-y-1.5 cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-200 truncate">{tank.label}</span>
                      <span className={`font-mono ${isKat ? 'text-emerald-400' : 'text-sky-400'}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#0B111A] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isKat ? 'bg-emerald-500' : 'bg-sky-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
