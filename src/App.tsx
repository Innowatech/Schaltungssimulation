import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { ChangelogModal } from './components/ChangelogModal';
import { ComponentLibrary } from './components/ComponentLibrary';
import { InspectorPanel } from './components/InspectorPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TopControlBar } from './components/TopControlBar';
import { WorkbenchCanvas } from './components/WorkbenchCanvas';
import { ComponentRegistry } from './engine/ComponentRegistry';
import { SimulationEngine } from './engine/SimulationEngine';
import { FloatProbeComponent, TankComponent } from './engine/components/FluidComponents';
import { CIRCUIT_PRESETS } from './engine/presets';
import { SerializedCircuit } from './engine/types';

export default function App() {
  const engineRef = useRef<SimulationEngine | null>(null);
  if (!engineRef.current) {
    const engine = new SimulationEngine();
    engine.loadCircuit(CIRCUIT_PRESETS[0].circuit);
    engineRef.current = engine;
  }

  const [activePresetId, setActivePresetId] = useState<string>(CIRCUIT_PRESETS[0].id);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [timeScale, setTimeScale] = useState<number>(60);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [showFaultPanel, setShowFaultPanel] = useState<boolean>(false);
  const [showLibrary, setShowLibrary] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [showInspector, setShowInspector] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [showChangelog, setShowChangelog] = useState<boolean>(false);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const [zoom, setZoom] = useState<number>(0.88);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [, setTickRevision] = useState<number>(0);
  const forceRefresh = useCallback(() => {
    setTickRevision((v) => v + 1);
  }, []);

  const showNotice = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!isRunning) return;

    let rafId = 0;
    let lastTimestamp = performance.now();

    const frame = (now: number) => {
      const dtReal = Math.min(0.05, (now - lastTimestamp) / 1000);
      lastTimestamp = now;

      const engine = engineRef.current!;
      const totalDtSim = dtReal * timeScale;

      if (totalDtSim > 0) {
        const subSteps = totalDtSim > 2 ? Math.min(12, Math.ceil(totalDtSim / 5)) : 1;
        const subDt = totalDtSim / subSteps;
        for (let i = 0; i < subSteps; i++) {
          engine.step(subDt);
        }
        forceRefresh();
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, timeScale, forceRefresh]);

  const engine = engineRef.current!;
  const components = Array.from(engine.components.values());
  const connections = engine.connections;
  const faultReports = engine.getActiveFaultReports();

  const selectedComponent = selectedComponentId
    ? engine.components.get(selectedComponentId) ?? null
    : null;
  const selectedConnection = selectedConnectionId
    ? connections.find((c) => c.id === selectedConnectionId) ?? null
    : null;

  const handleMutateComponent = useCallback(() => {
    engineRef.current?.evaluateInstant();
    forceRefresh();
  }, [forceRefresh]);

  const handleStepOneSecond = useCallback(() => {
    engineRef.current?.step(1);
    forceRefresh();
  }, [forceRefresh]);

  const handleReset = useCallback(() => {
    engineRef.current?.reset();
    forceRefresh();
  }, [forceRefresh]);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const preset = CIRCUIT_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      engineRef.current?.loadCircuit(preset.circuit);
      setActivePresetId(preset.id);
      setSelectedComponentId(null);
      setSelectedConnectionId(null);
      setShowFaultPanel(false);
      setPan({ x: 24, y: 24 });
      setZoom(preset.id === 'empty' ? 1 : 0.88);
      forceRefresh();
    },
    [forceRefresh]
  );

  const spawnComponent = useCallback(
    (type: string, worldX: number, worldY: number) => {
      const eng = engineRef.current!;
      const meta = ComponentRegistry.getMeta(type);
      if (!meta) return;

      const existingCount = Array.from(eng.components.values()).filter(
        (c) => c.type === type
      ).length;
      const prefixParts = meta.defaultLabelPrefix.split(' ');
      const baseCode = prefixParts[0]?.replace(/\d+$/, '') || 'B';
      const restName = prefixParts.slice(1).join(' ') || meta.name;
      const label = `${baseCode}${existingCount + 1} ${restName}`;

      const id = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const snappedX = Math.round(worldX / 4) * 4;
      const snappedY = Math.round(worldY / 4) * 4;
      const comp = ComponentRegistry.create(type, id, snappedX, snappedY, label);

      if (comp instanceof FloatProbeComponent) {
        const tanks = Array.from(eng.components.values()).filter(
          (c): c is TankComponent => c instanceof TankComponent
        );
        if (tanks.length > 0) {
          let nearest = tanks[0];
          let minDist = Number.POSITIVE_INFINITY;
          for (const t of tanks) {
            const d = Math.hypot(t.x - snappedX, t.y - snappedY);
            if (d < minDist) {
              minDist = d;
              nearest = t;
            }
          }
          comp.params.tankId = nearest.id;
        }
      }

      eng.addComponent(comp);
      setSelectedComponentId(comp.id);
      setSelectedConnectionId(null);
      setShowFaultPanel(false);
      setActivePresetId('custom');
      forceRefresh();
    },
    [forceRefresh]
  );

  const handleQuickAdd = useCallback(
    (type: string) => {
      const count = engineRef.current?.components.size ?? 0;
      const offset = (count % 6) * 28;
      const centerWorldX = (360 - pan.x) / zoom + offset;
      const centerWorldY = (200 - pan.y) / zoom + offset;
      spawnComponent(type, centerWorldX, centerWorldY);
    },
    [pan, zoom, spawnComponent]
  );

  const handleMoveComponent = useCallback(
    (id: string, x: number, y: number) => {
      const comp = engineRef.current?.components.get(id);
      if (!comp) return;
      comp.x = x;
      comp.y = y;
      forceRefresh();
    },
    [forceRefresh]
  );

  const handleCreateConnection = useCallback(
    (fromCompId: string, fromPortId: string, toCompId: string, toPortId: string) => {
      const conn = engineRef.current?.addConnection(
        fromCompId,
        fromPortId,
        toCompId,
        toPortId
      );
      if (conn) {
        setActivePresetId('custom');
        forceRefresh();
      }
    },
    [forceRefresh]
  );

  const handleDeleteComponent = useCallback(
    (id: string) => {
      engineRef.current?.removeComponent(id);
      if (selectedComponentId === id) setSelectedComponentId(null);
      setActivePresetId('custom');
      forceRefresh();
    },
    [selectedComponentId, forceRefresh]
  );

  const handleDeleteConnection = useCallback(
    (id: string) => {
      engineRef.current?.removeConnection(id);
      if (selectedConnectionId === id) setSelectedConnectionId(null);
      setActivePresetId('custom');
      forceRefresh();
    },
    [selectedConnectionId, forceRefresh]
  );

  const handleDisconnectAllFromComponent = useCallback(
    (id: string) => {
      const eng = engineRef.current!;
      eng.connections = eng.connections.filter(
        (c) => c.fromComponentId !== id && c.toComponentId !== id
      );
      eng.evaluateInstant();
      setActivePresetId('custom');
      forceRefresh();
    },
    [forceRefresh]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedConnectionId) {
      handleDeleteConnection(selectedConnectionId);
    } else if (selectedComponentId) {
      handleDeleteComponent(selectedComponentId);
    }
  }, [
    selectedConnectionId,
    selectedComponentId,
    handleDeleteConnection,
    handleDeleteComponent,
  ]);

  const handleTriggerRandomFault = useCallback(() => {
    const item = engineRef.current?.triggerRandomFault();
    if (item) {
      setShowInspector(true);
      setShowFaultPanel(true);
      if (item.targetKind === 'component') {
        setSelectedComponentId(item.targetId);
        setSelectedConnectionId(null);
      } else {
        setSelectedConnectionId(item.targetId);
        setSelectedComponentId(null);
      }
      showNotice(`Fehler ausgelöst: ${item.faultLabel} (${item.targetLabel})`);
    } else {
      showNotice('Keine weiteren Fehlerkandidaten verfügbar.');
    }
    forceRefresh();
  }, [forceRefresh, showNotice]);

  const handleClearAllFaults = useCallback(() => {
    engineRef.current?.clearAllFaults();
    showNotice('Alle Fehler wurden behoben.');
    forceRefresh();
  }, [forceRefresh, showNotice]);

  const handleResetView = useCallback(() => {
    setPan({ x: 24, y: 24 });
    setZoom(0.88);
  }, []);

  const handleExportJson = useCallback(() => {
    const presetName =
      CIRCUIT_PRESETS.find((p) => p.id === activePresetId)?.name ?? 'Schaltplan';
    const data = engineRef.current?.serializeCircuit(presetName);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schaltplan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('Schaltplan als JSON-Datei heruntergeladen.');
  }, [activePresetId, showNotice]);

  const handleImportJson = useCallback(
    (jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText) as SerializedCircuit;
        if (!Array.isArray(parsed.components) || !Array.isArray(parsed.connections)) {
          throw new Error('Ungültiges Format');
        }
        engineRef.current?.loadCircuit(parsed);
        setSelectedComponentId(null);
        setSelectedConnectionId(null);
        setShowFaultPanel(false);
        setActivePresetId('custom');
        forceRefresh();
        showNotice(
          `Schaltplan geladen (${parsed.components.length} Bauteile, ${parsed.connections.length} Verbindungen).`
        );
      } catch {
        showNotice('Fehler: Ungültige Schaltplan-JSON-Datei.');
      }
    },
    [forceRefresh, showNotice]
  );

  return (
    <div className="h-dvh w-screen flex flex-col bg-[#0B111A] text-slate-100 overflow-hidden">
      <TopControlBar
        isRunning={isRunning}
        onToggleRun={() => setIsRunning((r) => !r)}
        onStepOneSecond={handleStepOneSecond}
        onReset={handleReset}
        totalSimSeconds={engine.totalSimSeconds}
        timeScale={timeScale}
        onChangeTimeScale={setTimeScale}
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onResetView={handleResetView}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        activeFaultCount={faultReports.length}
        showFaultPanel={showFaultPanel}
        onToggleFaultPanel={() => {
          setShowInspector(true);
          setShowFaultPanel((v) => !v);
        }}
        onTriggerRandomFault={handleTriggerRandomFault}
        onClearAllFaults={handleClearAllFaults}
        onOpenChangelog={() => setShowChangelog(true)}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {showLibrary && (
          <ComponentLibrary
            onQuickAdd={handleQuickAdd}
            onCollapse={() => setShowLibrary(false)}
          />
        )}

        <div className="relative flex-1 flex min-w-0 min-h-0 overflow-hidden">
          <WorkbenchCanvas
            components={components}
            connections={connections}
            selectedComponentId={selectedComponentId}
            selectedConnectionId={selectedConnectionId}
            pan={pan}
            zoom={zoom}
            onPanZoomChange={(nextPan, nextZoom) => {
              setPan(nextPan);
              setZoom(nextZoom);
            }}
            onSelectComponent={(id) => {
              setSelectedComponentId(id);
              if (id) setShowFaultPanel(false);
            }}
            onSelectConnection={(id) => {
              setSelectedConnectionId(id);
              if (id) setShowFaultPanel(false);
            }}
            onDropNewComponent={spawnComponent}
            onMoveComponent={handleMoveComponent}
            onCreateConnection={handleCreateConnection}
            onDeleteSelected={handleDeleteSelected}
            onMutateComponent={handleMutateComponent}
          />

          {!showLibrary && (
            <button
              type="button"
              onClick={() => setShowLibrary(true)}
              title="Bauteil-Bibliothek einblenden"
              className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#101826]/95 text-slate-200 border border-[#243247] hover:border-sky-500/60 hover:text-white shadow-lg transition-colors z-30 cursor-pointer"
            >
              <PanelLeftOpen className="w-3.5 h-3.5 text-sky-400" />
              <span>Bibliothek</span>
            </button>
          )}

          {!showInspector && (
            <button
              type="button"
              onClick={() => setShowInspector(true)}
              title="Eigenschaften & Diagnose einblenden"
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#101826]/95 text-slate-200 border border-[#243247] hover:border-sky-500/60 hover:text-white shadow-lg transition-colors z-30 cursor-pointer"
            >
              <span>Eigenschaften</span>
              <PanelRightOpen className="w-3.5 h-3.5 text-sky-400" />
            </button>
          )}
        </div>

        {showInspector && (
          <InspectorPanel
            components={components}
            connections={connections}
            selectedComponent={selectedComponent}
            selectedConnection={selectedConnection}
            faultReports={faultReports}
            showFaultPanel={showFaultPanel}
            onSetShowFaultPanel={setShowFaultPanel}
            onSelectComponent={setSelectedComponentId}
            onSelectConnection={setSelectedConnectionId}
            onMutate={handleMutateComponent}
            onDeleteComponent={handleDeleteComponent}
            onDeleteConnection={handleDeleteConnection}
            onDisconnectAllFromComponent={handleDisconnectAllFromComponent}
            onTriggerRandomFault={handleTriggerRandomFault}
            onClearAllFaults={handleClearAllFaults}
            onCollapse={() => setShowInspector(false)}
          />
        )}
      </div>

      {toastMessage && (
        <div
          className={`fixed bottom-4 bg-[#141E2E] border border-sky-500/50 text-slate-100 text-xs px-3.5 py-2 rounded-md shadow-lg z-50 ${
            showInspector ? 'right-80' : 'right-4'
          }`}
        >
          {toastMessage}
        </div>
      )}
      <OfflineIndicator />
      <ChangelogModal
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
      />
    </div>
  );
}
