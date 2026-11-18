import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { ChangelogModal } from './components/ChangelogModal';
import { ComponentLibrary } from './components/ComponentLibrary';
import { InspectorPanel } from './components/InspectorPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PdfReferencePanel } from './components/PdfReferencePanel';
import { TopControlBar } from './components/TopControlBar';
import { WorkbenchCanvas } from './components/WorkbenchCanvas';
import { ComponentRegistry } from './engine/ComponentRegistry';
import { SimulationEngine } from './engine/SimulationEngine';
import { FloatProbeComponent, TankComponent } from './engine/components/FluidComponents';
import {
  EMPTY_CIRCUIT,
  loadSavedSimulations,
  persistSavedSimulations,
} from './engine/presets';
import { SavedSimulationEntry, SerializedCircuit } from './engine/types';
import { resolveComponentPlacement } from './utils/orthogonalRouting';
import { parseExternalProjectJson } from './utils/externalProjectAdapter';

export default function App() {
  const engineRef = useRef<SimulationEngine | null>(null);
  if (!engineRef.current) {
    const engine = new SimulationEngine();
    engine.loadCircuit(EMPTY_CIRCUIT);
    engineRef.current = engine;
  }

  const [savedSimulations, setSavedSimulations] = useState<SavedSimulationEntry[]>(() =>
    loadSavedSimulations()
  );
  const [activeCircuitId, setActiveCircuitId] = useState<string>('empty');
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
  const [zoom, setZoom] = useState<number>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfIsImage, setPdfIsImage] = useState<boolean>(false);
  const [showPdfPanel, setShowPdfPanel] = useState<boolean>(false);
  const pdfUrlRef = useRef<string | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('mechafluid_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    try {
      localStorage.setItem('mechafluid_theme', theme);
    } catch {
      // ignore storage errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#FFFFFF' : '#0B111A');
    }
  }, [theme]);

  useEffect(() => {
    // Verhindert im installierten PWA-/Browser-Fenster, dass Strg+Mausrad oder Pinch das gesamte Fenster statt nur der Arbeitsfläche zoomt
    const preventGlobalBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', preventGlobalBrowserZoom, { passive: false });
    return () => {
      window.removeEventListener('wheel', preventGlobalBrowserZoom);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    };
  }, []);

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
  const connections = [...engine.connections];
  const faultReports = engine.getActiveFaultReports();

  const selectedComponent = selectedComponentId
    ? engine.components.get(selectedComponentId) ?? null
    : null;
  const selectedConnection = selectedConnectionId
    ? connections.find((c) => c.id === selectedConnectionId) ?? null
    : null;

  const markModified = useCallback(() => {
    setActiveCircuitId((prev) => (prev === 'empty' || prev === 'custom' ? 'custom' : 'custom'));
  }, []);

  const handleMutateComponent = useCallback(() => {
    engineRef.current?.evaluateInstant();
    forceRefresh();
  }, [forceRefresh]);

  const handlePruneComponentPorts = useCallback(
    (componentId: string) => {
      engineRef.current?.pruneInvalidConnectionsForComponent(componentId);
      forceRefresh();
    },
    [forceRefresh]
  );

  const handleStepOneSecond = useCallback(() => {
    engineRef.current?.step(1);
    forceRefresh();
  }, [forceRefresh]);

  const handleFastForward = useCallback(
    (jumpSeconds: number) => {
      if (!engineRef.current || jumpSeconds <= 0) return;
      engineRef.current.fastForward(jumpSeconds);
      forceRefresh();

      const whole = Math.round(jumpSeconds);
      const d = Math.floor(whole / 86400);
      const h = Math.floor((whole % 86400) / 3600);
      const m = Math.floor((whole % 3600) / 60);
      const s = whole % 60;
      const parts: string[] = [];
      if (d > 0) parts.push(`${d} T`);
      if (h > 0) parts.push(`${h} Std`);
      if (m > 0) parts.push(`${m} Min`);
      if (s > 0 && d === 0 && h === 0) parts.push(`${s} s`);
      showNotice(`Zeitsprung ausgeführt: +${parts.join(' ') || `${whole} s`} simuliert.`);
    },
    [forceRefresh, showNotice]
  );

  const handleReset = useCallback(() => {
    engineRef.current?.reset();
    forceRefresh();
  }, [forceRefresh]);

  const handleSelectCircuit = useCallback(
    (circuitId: string) => {
      if (circuitId === 'custom') return;
      if (circuitId === 'empty') {
        engineRef.current?.loadCircuit(EMPTY_CIRCUIT);
        setActiveCircuitId('empty');
        setSelectedComponentId(null);
        setSelectedConnectionId(null);
        setShowFaultPanel(false);
        setPan({ x: 24, y: 24 });
        setZoom(1);
        forceRefresh();
        return;
      }

      const found = savedSimulations.find((s) => s.id === circuitId);
      if (!found) return;
      engineRef.current?.loadCircuit(found.circuit);
      setActiveCircuitId(found.id);
      setSelectedComponentId(null);
      setSelectedConnectionId(null);
      setShowFaultPanel(false);
      setPan({ x: 24, y: 24 });
      setZoom(0.92);
      forceRefresh();
    },
    [savedSimulations, forceRefresh]
  );

  const handleSaveToList = useCallback(
    (name: string) => {
      const eng = engineRef.current;
      if (!eng) return;
      const serialized = eng.serializeCircuit(name);
      const nowIso = new Date().toISOString();

      const existing = savedSimulations.find(
        (s) => s.id === activeCircuitId || s.name.toLowerCase() === name.toLowerCase()
      );
      let nextList: SavedSimulationEntry[];
      let targetId: string;

      if (existing) {
        targetId = existing.id;
        nextList = savedSimulations.map((s) =>
          s.id === existing.id
            ? { ...s, name, updatedAt: nowIso, circuit: serialized }
            : s
        );
      } else {
        targetId = `sim_${Date.now()}`;
        nextList = [
          { id: targetId, name, updatedAt: nowIso, circuit: serialized },
          ...savedSimulations,
        ];
      }

      setSavedSimulations(nextList);
      persistSavedSimulations(nextList);
      setActiveCircuitId(targetId);
      showNotice(`Simulation "${name}" in Liste gespeichert.`);
    },
    [activeCircuitId, savedSimulations, showNotice]
  );

  const handleDeleteSavedSimulation = useCallback(
    (id: string) => {
      const nextList = savedSimulations.filter((s) => s.id !== id);
      setSavedSimulations(nextList);
      persistSavedSimulations(nextList);
      if (activeCircuitId === id) {
        setActiveCircuitId('custom');
      }
      showNotice('Gespeicherte Simulation entfernt.');
    },
    [activeCircuitId, savedSimulations, showNotice]
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
      const resolvedPos = resolveComponentPlacement(
        comp.id,
        snappedX,
        snappedY,
        comp.width,
        comp.height,
        Array.from(eng.components.values()).map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
        })),
        36
      );
      comp.x = resolvedPos.x;
      comp.y = resolvedPos.y;

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
      markModified();
      forceRefresh();
    },
    [forceRefresh, markModified]
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
        markModified();
        forceRefresh();
      }
    },
    [forceRefresh, markModified]
  );

  const handleDeleteComponent = useCallback(
    (id: string) => {
      engineRef.current?.removeComponent(id);
      if (selectedComponentId === id) setSelectedComponentId(null);
      markModified();
      forceRefresh();
    },
    [selectedComponentId, forceRefresh, markModified]
  );

  const handleDeleteConnection = useCallback(
    (id: string) => {
      engineRef.current?.removeConnection(id);
      if (selectedConnectionId === id) setSelectedConnectionId(null);
      markModified();
      forceRefresh();
    },
    [selectedConnectionId, forceRefresh, markModified]
  );

  const handleDisconnectAllFromComponent = useCallback(
    (id: string) => {
      const eng = engineRef.current!;
      eng.connections = eng.connections.filter(
        (c) => c.fromComponentId !== id && c.toComponentId !== id
      );
      eng.evaluateInstant();
      markModified();
      forceRefresh();
    },
    [forceRefresh, markModified]
  );

  const handleInsertOnFluidConnection = useCallback(
    (connectionId: string, newType: 'fluid_tee' | 'injection_point') => {
      const created = engineRef.current?.insertFluidComponentOnConnection(
        connectionId,
        newType
      );
      if (created) {
        setSelectedConnectionId(null);
        setSelectedComponentId(created.id);
        setShowFaultPanel(false);
        markModified();
        forceRefresh();
        showNotice(`${created.label} in Leitung eingefügt.`);
      }
    },
    [forceRefresh, markModified, showNotice]
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

  const handleOpenProperties = useCallback((id: string) => {
    setSelectedComponentId(id);
    setSelectedConnectionId(null);
    setShowFaultPanel(false);
    setShowInspector(true);
  }, []);

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
    setZoom(0.95);
  }, []);

  const handleExportJson = useCallback(() => {
    const activeName =
      savedSimulations.find((s) => s.id === activeCircuitId)?.name ?? 'Schaltplan';
    const data = engineRef.current?.serializeCircuit(activeName);
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
    showNotice('Schaltplan als JSON-Datei exportiert.');
  }, [activeCircuitId, savedSimulations, showNotice]);

  const handleImportJson = useCallback(
    (jsonText: string) => {
      try {
        let parsed = parseExternalProjectJson(jsonText);
        if (!parsed) {
          const direct = JSON.parse(jsonText) as SerializedCircuit;
          if (!Array.isArray(direct.components) || !Array.isArray(direct.connections)) {
            throw new Error('Ungültiges Format');
          }
          parsed = direct;
        }

        engineRef.current?.loadCircuit(parsed);
        setSelectedComponentId(null);
        setSelectedConnectionId(null);
        setShowFaultPanel(false);
        setActiveCircuitId('custom');
        forceRefresh();
        showNotice(
          `Schaltplan "${parsed.name || 'Projekt'}" geladen (${parsed.components.length} Bauteile, ${parsed.connections.length} Verbindungen).`
        );
      } catch {
        showNotice('Fehler: Ungültige Schaltplan-JSON-Datei.');
      }
    },
    [forceRefresh, showNotice]
  );

  const handleImportPdfFile = useCallback(
    (file: File) => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
      const nextUrl = URL.createObjectURL(file);
      pdfUrlRef.current = nextUrl;
      setPdfFileUrl(nextUrl);
      setPdfFileName(file.name);
      setPdfIsImage(file.type.startsWith('image/'));
      setShowPdfPanel(true);
      showNotice(`Schaltplan "${file.name}" als Referenz-Ansicht geöffnet.`);
    },
    [showNotice]
  );

  const handleClearPdfFile = useCallback(() => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    setPdfFileUrl(null);
    setPdfFileName('');
    setShowPdfPanel(false);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0B111A] text-slate-100 overflow-hidden overscroll-none">
      <TopControlBar
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        isRunning={isRunning}
        onToggleRun={() => setIsRunning((r) => !r)}
        onStepOneSecond={handleStepOneSecond}
        onFastForward={handleFastForward}
        onReset={handleReset}
        totalSimSeconds={engine.totalSimSeconds}
        timeScale={timeScale}
        onChangeTimeScale={setTimeScale}
        activeCircuitId={activeCircuitId}
        savedSimulations={savedSimulations}
        onSelectCircuit={handleSelectCircuit}
        onSaveToList={handleSaveToList}
        onDeleteSavedSimulation={handleDeleteSavedSimulation}
        onResetView={handleResetView}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        hasPdfLoaded={Boolean(pdfFileUrl)}
        showPdfPanel={showPdfPanel}
        onImportPdfFile={handleImportPdfFile}
        onTogglePdfPanel={() => setShowPdfPanel((v) => !v)}
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
            theme={theme}
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
            onOpenProperties={handleOpenProperties}
            onDropNewComponent={spawnComponent}
            onMoveComponent={handleMoveComponent}
            onCreateConnection={handleCreateConnection}
            onDeleteConnection={handleDeleteConnection}
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

        <PdfReferencePanel
          fileUrl={pdfFileUrl}
          fileName={pdfFileName}
          isImage={pdfIsImage}
          isOpen={showPdfPanel}
          onClose={() => setShowPdfPanel(false)}
          onClearFile={handleClearPdfFile}
        />

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
            onPruneComponentPorts={handlePruneComponentPorts}
            onInsertOnFluidConnection={handleInsertOnFluidConnection}
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
