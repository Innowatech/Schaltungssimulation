import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FastForward,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  History,
  Maximize2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  StepForward,
  Sun,
  Trash2,
  Upload,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { CURRENT_VERSION } from '../changelog';
import { SavedSimulationEntry } from '../engine/types';
import { PWAInstallButton } from './PWAInstallButton';

interface TopControlBarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  viewMode: 'schematic' | 'animation';
  onChangeViewMode: (mode: 'schematic' | 'animation') => void;
  isRunning: boolean;
  onToggleRun: () => void;
  onStepOneSecond: () => void;
  onFastForward: (seconds: number) => void;
  onReset: () => void;
  totalSimSeconds: number;
  timeScale: number;
  onChangeTimeScale: (scale: number) => void;
  activeCircuitId: string;
  savedSimulations: SavedSimulationEntry[];
  onSelectCircuit: (circuitId: string) => void;
  onSaveToList: (name: string) => void;
  onDeleteSavedSimulation: (id: string) => void;
  onResetView: () => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => void;
  onOpenHtmlExport: () => void;
  onOpenPdfExport: () => void;
  hasPdfLoaded: boolean;
  showPdfPanel: boolean;
  onImportPdfFile: (file: File) => void;
  onTogglePdfPanel: () => void;
  activeFaultCount: number;
  showFaultPanel: boolean;
  onToggleFaultPanel: () => void;
  onTriggerRandomFault: () => void;
  onClearAllFaults: () => void;
  onOpenChangelog: () => void;
}

const TIME_SCALE_PRESETS = [1, 10, 60, 600, 3600];

const JUMP_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: '+1 Min', seconds: 60 },
  { label: '+10 Min', seconds: 600 },
  { label: '+1 Std', seconds: 3600 },
  { label: '+6 Std', seconds: 6 * 3600 },
  { label: '+12 Std', seconds: 12 * 3600 },
  { label: '+23 Std', seconds: 23 * 3600 },
  { label: '+24 Std', seconds: 24 * 3600 },
];

function formatSimTime(totalSeconds: number): {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const whole = Math.floor(Math.max(0, totalSeconds));
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

function formatDurationReadable(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  const d = Math.floor(whole / 86400);
  const h = Math.floor((whole % 86400) / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} T`);
  if (h > 0) parts.push(`${h} Std`);
  if (m > 0) parts.push(`${m} Min`);
  if (s > 0 || parts.length === 0) parts.push(`${s} s`);
  return parts.join(' ');
}

function scaleToSlider(scale: number): number {
  const clamped = Math.max(1, Math.min(3600, scale));
  return Math.round((Math.log(clamped) / Math.log(3600)) * 1000);
}

function sliderToScale(val: number): number {
  const ratio = Math.max(0, Math.min(1, val / 1000));
  const raw = Math.pow(3600, ratio);
  if (raw < 10) return Math.round(raw * 10) / 10;
  if (raw < 100) return Math.round(raw);
  return Math.round(raw / 5) * 5;
}

export const TopControlBar: React.FC<TopControlBarProps> = ({
  theme,
  onToggleTheme,
  viewMode,
  onChangeViewMode,
  isRunning,
  onToggleRun,
  onStepOneSecond,
  onFastForward,
  onReset,
  totalSimSeconds,
  timeScale,
  onChangeTimeScale,
  activeCircuitId,
  savedSimulations,
  onSelectCircuit,
  onSaveToList,
  onDeleteSavedSimulation,
  onResetView,
  onExportJson,
  onImportJson,
  onOpenHtmlExport,
  onOpenPdfExport,
  hasPdfLoaded,
  showPdfPanel,
  onImportPdfFile,
  onTogglePdfPanel,
  activeFaultCount,
  showFaultPanel,
  onToggleFaultPanel,
  onTriggerRandomFault,
  onClearAllFaults,
  onOpenChangelog,
}) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const jumpBtnRef = useRef<HTMLButtonElement>(null);
  const jumpPopoverRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPopoverRef = useRef<HTMLDivElement>(null);

  const [isSavingNamed, setIsSavingNamed] = useState(false);
  const [saveNameDraft, setSaveNameDraft] = useState('');
  const [confirmDeleteSavedId, setConfirmDeleteSavedId] = useState<string | null>(null);
  const [confirmMenuDeleteId, setConfirmMenuDeleteId] = useState<string | null>(null);

  // Horizontal overflow scroll arrows
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Zahnrad-Menü (Settings Popover)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsPopoverPos, setSettingsPopoverPos] = useState<{ top: number; left: number }>({
    top: 60,
    left: 200,
  });

  // Zeitsprung popover
  const [showJumpPopover, setShowJumpPopover] = useState(false);
  const [jumpPopoverPos, setJumpPopoverPos] = useState<{ top: number; left: number }>({
    top: 60,
    left: 200,
  });
  const [deltaH, setDeltaH] = useState('1');
  const [deltaM, setDeltaM] = useState('0');
  const [deltaS, setDeltaS] = useState('0');
  const [targetD, setTargetD] = useState('0');
  const [targetH, setTargetH] = useState('23');
  const [targetM, setTargetM] = useState('30');
  const [targetS, setTargetS] = useState('0');

  const t = formatSimTime(totalSimSeconds);
  const activeSavedEntry = savedSimulations.find((s) => s.id === activeCircuitId) ?? null;

  const updateScrollIndicators = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    updateScrollIndicators();
    const el = scrollContainerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => updateScrollIndicators());
    ro.observe(el);
    window.addEventListener('resize', updateScrollIndicators);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScrollIndicators);
    };
  }, [updateScrollIndicators, activeCircuitId, activeFaultCount, hasPdfLoaded, isSavingNamed]);

  useEffect(() => {
    setConfirmDeleteSavedId(null);
  }, [activeCircuitId]);

  useEffect(() => {
    if (!showJumpPopover && !showSettingsMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        showJumpPopover &&
        !jumpPopoverRef.current?.contains(target) &&
        !jumpBtnRef.current?.contains(target)
      ) {
        setShowJumpPopover(false);
      }
      if (
        showSettingsMenu &&
        !settingsPopoverRef.current?.contains(target) &&
        !settingsBtnRef.current?.contains(target)
      ) {
        setShowSettingsMenu(false);
        setConfirmMenuDeleteId(null);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [showJumpPopover, showSettingsMenu]);

  const openJumpPopover = () => {
    if (showJumpPopover) {
      setShowJumpPopover(false);
      return;
    }
    setShowSettingsMenu(false);
    const rect = jumpBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const popWidth = 320;
      const clampedLeft = Math.max(
        12,
        Math.min(window.innerWidth - popWidth - 12, rect.left - 60)
      );
      setJumpPopoverPos({
        top: rect.bottom + 8,
        left: clampedLeft,
      });
    }
    setShowJumpPopover(true);
  };

  const openSettingsMenu = () => {
    if (showSettingsMenu) {
      setShowSettingsMenu(false);
      setConfirmMenuDeleteId(null);
      return;
    }
    setShowJumpPopover(false);
    const rect = settingsBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const popWidth = 310;
      const clampedLeft = Math.max(
        12,
        Math.min(window.innerWidth - popWidth - 12, rect.right - popWidth)
      );
      setSettingsPopoverPos({
        top: rect.bottom + 8,
        left: clampedLeft,
      });
    }
    setShowSettingsMenu(true);
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportPdfFile(file);
    e.target.value = '';
  };

  const openSaveNamedPrompt = () => {
    setSaveNameDraft(
      activeSavedEntry?.name ?? `Anlage ${savedSimulations.length + 1}`
    );
    setIsSavingNamed(true);
    setConfirmDeleteSavedId(null);
  };

  const commitSaveNamed = () => {
    const trimmed = saveNameDraft.trim();
    if (!trimmed) return;
    onSaveToList(trimmed);
    setIsSavingNamed(false);
    setSaveNameDraft('');
  };

  const customDeltaSeconds =
    Math.max(0, Number(deltaH) || 0) * 3600 +
    Math.max(0, Number(deltaM) || 0) * 60 +
    Math.max(0, Number(deltaS) || 0);

  const targetTotalSeconds =
    Math.max(0, Number(targetD) || 0) * 86400 +
    Math.max(0, Number(targetH) || 0) * 3600 +
    Math.max(0, Number(targetM) || 0) * 60 +
    Math.max(0, Number(targetS) || 0);
  const jumpToTargetDelta = targetTotalSeconds - totalSimSeconds;

  const isLight = theme === 'light';

  return (
    <header className="relative h-14 bg-[#101826] border-b border-[#223044] select-none shrink-0 z-30 flex items-center">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollContainerRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
          title="Kopfleiste nach links scrollen"
          aria-label="Kopfleiste nach links scrollen"
          className={`absolute left-0 inset-y-0 z-20 px-1.5 flex items-center cursor-pointer transition-opacity ${
            isLight
              ? 'bg-gradient-to-r from-white via-white/95 to-transparent text-sky-700 hover:text-sky-900'
              : 'bg-gradient-to-r from-[#101826] via-[#101826]/95 to-transparent text-sky-300 hover:text-white'
          }`}
        >
          <span
            className={`w-6 h-7 rounded flex items-center justify-center border shadow-sm ${
              isLight
                ? 'bg-slate-100 border-slate-300'
                : 'bg-[#162133] border-[#2A3B55]'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </span>
        </button>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={updateScrollIndicators}
        className="flex-1 flex items-center justify-between gap-3 px-3.5 h-full overflow-x-auto no-scrollbar"
      >
        {/* Zone 1: Titel, Version & Gespeicherte Simulationen */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <h1 className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            AnlagenSim
          </h1>

          <button
            type="button"
            onClick={onOpenChangelog}
            title="Changelog & Versionshistorie öffnen"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono text-sky-300 bg-[#162133] border border-[#243247] hover:border-sky-500/60 hover:text-sky-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <History className="w-3 h-3" />
            <span>v{CURRENT_VERSION}</span>
          </button>

          <select
            aria-label="Gespeicherte Simulation auswählen"
            value={activeCircuitId}
            onChange={(e) => onSelectCircuit(e.target.value)}
            className="bg-[#0B111A] border border-[#243247] text-xs text-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-sky-500 max-w-[185px] truncate cursor-pointer"
          >
            <option value="empty">Leere Arbeitsfläche</option>
            {savedSimulations.map((sim) => (
              <option key={sim.id} value={sim.id}>
                {sim.name}
              </option>
            ))}
            {activeCircuitId === 'custom' && (
              <option value="custom">Ungespeichert</option>
            )}
          </select>

          {isSavingNamed ? (
            <div className="flex items-center gap-1 bg-[#0B111A] border border-sky-500/50 rounded-md px-1.5 py-0.5">
              <input
                type="text"
                value={saveNameDraft}
                onChange={(e) => setSaveNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSaveNamed();
                  if (e.key === 'Escape') setIsSavingNamed(false);
                }}
                placeholder="Name der Simulation..."
                autoFocus
                className="w-32 bg-transparent text-xs text-slate-100 focus:outline-none px-1"
              />
              <button
                type="button"
                onClick={commitSaveNamed}
                title="In Liste sichern"
                className="p-1 rounded bg-sky-600 text-white hover:bg-sky-500 cursor-pointer"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setIsSavingNamed(false)}
                title="Abbrechen"
                className="p-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openSaveNamedPrompt}
              title="Aktuellen Stand lokal in der Dropdown-Liste speichern"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-sky-300 bg-[#162133] border border-[#243247] hover:border-sky-500/60 hover:bg-[#1D2B42] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Sichern</span>
            </button>
          )}

          {activeSavedEntry && !isSavingNamed && (
            confirmDeleteSavedId === activeSavedEntry.id ? (
              <div className="flex items-center gap-1 bg-red-950/60 border border-red-500/50 rounded-md px-1.5 py-0.5 text-[11px]">
                <span className="text-red-200 whitespace-nowrap">Löschen?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSavedSimulation(activeSavedEntry.id);
                    setConfirmDeleteSavedId(null);
                  }}
                  className="px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500 font-semibold cursor-pointer"
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSavedId(null)}
                  className="px-1.5 py-0.5 rounded bg-[#162133] text-slate-300 hover:text-white cursor-pointer"
                >
                  Nein
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteSavedId(activeSavedEntry.id)}
                title="Gespeicherte Simulation aus Liste entfernen"
                className="p-1.5 rounded-md text-slate-400 bg-[#162133] border border-[#243247] hover:text-red-400 hover:border-red-500/50 transition-colors shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>

        {/* Zone 2: Playback, Simulierte Gesamtzeit, Zeitsprung & Zeitraffer */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleRun}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isRunning
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25'
                  : 'bg-sky-600 text-white border border-sky-500 hover:bg-sky-500'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isRunning ? 'Pause' : 'Start'}</span>
            </button>

            <button
              type="button"
              onClick={onStepOneSecond}
              disabled={isRunning}
              title="Einzelschritt (+1 Sekunde simuliert)"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-[#162133] text-slate-300 border border-[#243247] hover:bg-[#1D2B42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <StepForward className="w-3.5 h-3.5" />
              <span>+1s</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              title="Simulation & Zeit zurücksetzen"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-[#162133] text-slate-300 border border-[#243247] hover:bg-[#1D2B42] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* Simulierte Gesamtzeit + Zeitsprung-Button */}
          <div className="flex items-center gap-1 bg-[#0B111A] border border-[#223044] rounded-md p-0.5 pl-2">
            <span className="text-[11px] text-slate-400 whitespace-nowrap mr-1">Zeit</span>
            <div className="font-mono text-xs font-semibold text-slate-100 tracking-tight whitespace-nowrap pr-1.5">
              <span>{t.days}T</span>
              <span className="text-slate-500 mx-0.5">:</span>
              <span>{t.hours}Std</span>
              <span className="text-slate-500 mx-0.5">:</span>
              <span>{t.minutes}Min</span>
              <span className="text-slate-500 text-[10px] ml-1">({t.seconds}s)</span>
            </div>
            <button
              ref={jumpBtnRef}
              type="button"
              onClick={openJumpPopover}
              title="Zeitsprung ausführen (z. B. +23 Std vorspulen oder auf 23:30 springen)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                showJumpPopover
                  ? 'bg-sky-600 text-white'
                  : 'bg-[#162133] text-sky-300 border border-[#243247] hover:border-sky-500/60 hover:bg-[#1D2B42]'
              }`}
            >
              <FastForward className="w-3 h-3" />
              <span>Sprung</span>
            </button>
          </div>

          {/* Zeitraffer */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-[#0B111A] border border-[#223044] rounded-md p-0.5">
              {TIME_SCALE_PRESETS.map((preset) => {
                const active = Math.abs(timeScale - preset) < 0.05;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChangeTimeScale(preset)}
                    className={`px-1.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}x
                  </button>
                );
              })}
            </div>
            <input
              type="range"
              aria-label="Stufenloser Zeitraffer-Faktor"
              min={0}
              max={1000}
              value={scaleToSlider(timeScale)}
              onChange={(e) => onChangeTimeScale(sliderToScale(Number(e.target.value)))}
              className="w-14 accent-sky-500 cursor-pointer"
            />
            <span className="font-mono text-[11px] text-sky-400 w-10 text-right whitespace-nowrap">
              {timeScale >= 10 ? Math.round(timeScale) : timeScale.toFixed(1)}x
            </span>
          </div>
        </div>

        {/* Zone 3: Modus-Umschalter, Fehler-Simulation & Menü */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Modus-Umschalter: Schaltplan vs. saubere Prozessanimation */}
          <div
            role="group"
            aria-label="Ansichtsmodus"
            className="flex items-center bg-[#0B111A] border border-[#223044] rounded-md p-0.5"
          >
            <button
              type="button"
              onClick={() => onChangeViewMode('schematic')}
              title="Schaltplan- & Verdrahtungsmodus"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'schematic'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>Schaltplan</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('animation')}
              title="Prozessanimation (ohne Klemmen/Kabel, mit Zeitrelais & Ablauf-Ticker)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'animation'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Film className="w-3 h-3" />
              <span>Animation</span>
            </button>
          </div>

          {viewMode === 'schematic' && (
            <>
              <button
                type="button"
                onClick={onTriggerRandomFault}
                title="Zufälligen Fehler in der Anlage aktivieren"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Zufallsfehler</span>
              </button>

              <button
                type="button"
                onClick={onToggleFaultPanel}
                title="Fehler-Diagnose & Auswirkungen anzeigen"
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  activeFaultCount > 0
                    ? showFaultPanel
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-red-500/20 text-red-300 border-red-500/50 hover:bg-red-500/30'
                    : showFaultPanel
                    ? 'bg-sky-600 text-white border-sky-500'
                    : 'bg-[#162133] text-slate-300 border-[#243247] hover:bg-[#1D2B42]'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Fehler{activeFaultCount > 0 ? ` (${activeFaultCount})` : ''}</span>
              </button>

              {activeFaultCount > 0 && (
                <button
                  type="button"
                  onClick={onClearAllFaults}
                  title="Alle Fehler beheben"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Beheben</span>
                </button>
              )}
            </>
          )}

          <div className="h-5 w-px bg-[#223044] mx-0.5" />

          <button
            ref={settingsBtnRef}
            type="button"
            onClick={openSettingsMenu}
            title="Einstellungen, Pläne, Import/Export & Design"
            aria-label="Zahnrad-Menü öffnen"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
              showSettingsMenu
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-[#162133] text-slate-200 border-[#243247] hover:border-sky-500/60 hover:bg-[#1D2B42]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Menü</span>
          </button>

          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleJsonFileChange}
            className="hidden"
          />
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf,image/*"
            onChange={handlePdfFileChange}
            className="hidden"
          />
        </div>
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollContainerRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
          title="Weitere Werkzeuge rechts anzeigen"
          aria-label="Kopfleiste nach rechts scrollen"
          className={`absolute right-0 inset-y-0 z-20 px-1.5 flex items-center cursor-pointer transition-opacity ${
            isLight
              ? 'bg-gradient-to-l from-white via-white/95 to-transparent text-sky-700 hover:text-sky-900'
              : 'bg-gradient-to-l from-[#101826] via-[#101826]/95 to-transparent text-sky-300 hover:text-white'
          }`}
        >
          <span
            className={`w-6 h-7 rounded flex items-center justify-center border shadow-sm ${
              isLight
                ? 'bg-slate-100 border-slate-300'
                : 'bg-[#162133] border-[#2A3B55]'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Zeitsprung Popover (fixed position, niemals abgeschnitten) */}
      {showJumpPopover && (
        <div
          ref={jumpPopoverRef}
          style={{ top: `${jumpPopoverPos.top}px`, left: `${jumpPopoverPos.left}px` }}
          className="fixed w-[320px] bg-[#101826] border border-[#26364D] rounded-lg shadow-2xl p-3.5 z-50 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-[#223044] pb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-semibold text-slate-100">
                Zeitsprung (Proportional-Simulation)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowJumpPopover(false)}
              className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Berechnet Tankfüllstände, Zeitrelais und Schaltvorgänge physikalisch exakt für die übersprungene Zeitspanne.
          </p>

          {/* Schnellsprünge (+ Delta) */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-200">
              Vorspulen um (+ Zeitspanne)
            </div>
            <div className="grid grid-cols-4 gap-1">
              {JUMP_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onFastForward(p.seconds);
                    setShowJumpPopover(false);
                  }}
                  className="px-1.5 py-1 rounded text-[11px] font-mono font-medium bg-[#162133] text-sky-300 border border-[#243247] hover:border-sky-500/60 hover:bg-[#1D2B42] transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 pt-1">
              <div className="flex-1 flex items-center gap-1 bg-[#0B111A] border border-[#243247] rounded px-1.5 py-1">
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={deltaH}
                  onChange={(e) => setDeltaH(e.target.value)}
                  className="w-9 bg-transparent text-xs font-mono text-slate-100 text-right focus:outline-none"
                  aria-label="Stunden vorspulen"
                />
                <span className="text-[10px] text-slate-400">h</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={deltaM}
                  onChange={(e) => setDeltaM(e.target.value)}
                  className="w-8 bg-transparent text-xs font-mono text-slate-100 text-right focus:outline-none"
                  aria-label="Minuten vorspulen"
                />
                <span className="text-[10px] text-slate-400">m</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={deltaS}
                  onChange={(e) => setDeltaS(e.target.value)}
                  className="w-8 bg-transparent text-xs font-mono text-slate-100 text-right focus:outline-none"
                  aria-label="Sekunden vorspulen"
                />
                <span className="text-[10px] text-slate-400">s</span>
              </div>
              <button
                type="button"
                disabled={customDeltaSeconds <= 0}
                onClick={() => {
                  if (customDeltaSeconds > 0) {
                    onFastForward(customDeltaSeconds);
                    setShowJumpPopover(false);
                  }
                }}
                className="px-2.5 py-1.5 rounded bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                + Sprung
              </button>
            </div>
          </div>

          {/* Direkter Sprung zu Zielzeit */}
          <div className="space-y-1.5 border-t border-[#223044] pt-2.5">
            <div className="text-[11px] font-semibold text-slate-200">
              Direkt zu Zielzeit springen (z. B. 23:30)
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <label className="flex flex-col gap-0.5 bg-[#0B111A] border border-[#243247] rounded px-1.5 py-1">
                <span className="text-[9px] text-slate-400">Tage</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={targetD}
                  onChange={(e) => setTargetD(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-0.5 bg-[#0B111A] border border-[#243247] rounded px-1.5 py-1">
                <span className="text-[9px] text-slate-400">Std</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={targetH}
                  onChange={(e) => setTargetH(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-0.5 bg-[#0B111A] border border-[#243247] rounded px-1.5 py-1">
                <span className="text-[9px] text-slate-400">Min</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={targetM}
                  onChange={(e) => setTargetM(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-0.5 bg-[#0B111A] border border-[#243247] rounded px-1.5 py-1">
                <span className="text-[9px] text-slate-400">Sek</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={targetS}
                  onChange={(e) => setTargetS(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] font-mono text-slate-400">
                {jumpToTargetDelta > 0
                  ? `Simuliert +${formatDurationReadable(jumpToTargetDelta)}`
                  : 'Zielzeit liegt vor aktueller Zeit'}
              </span>
              <button
                type="button"
                disabled={jumpToTargetDelta <= 0}
                onClick={() => {
                  if (jumpToTargetDelta > 0) {
                    onFastForward(jumpToTargetDelta);
                    setShowJumpPopover(false);
                  }
                }}
                className="px-2.5 py-1.5 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                Auf Zielzeit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zahnrad-Menü Popover (Pläne, Import/Export, PDF, Design, Ansicht) */}
      {showSettingsMenu && (
        <div
          ref={settingsPopoverRef}
          style={{ top: `${settingsPopoverPos.top}px`, left: `${settingsPopoverPos.left}px` }}
          className="fixed w-[310px] max-h-[82vh] overflow-y-auto bg-[#101826] border border-[#26364D] rounded-lg shadow-2xl p-3.5 z-50 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-[#223044] pb-2">
            <div className="flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-semibold text-slate-100">
                Einstellungen &amp; Pläne
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSettingsMenu(false);
                setConfirmMenuDeleteId(null);
              }}
              className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Darstellung & Ansicht */}
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-semibold text-slate-400">
              Oberfläche &amp; Ansicht
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors cursor-pointer"
              >
                {isLight ? (
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>{isLight ? 'Dunkel-Modus' : 'Hell-Modus'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onResetView();
                  setShowSettingsMenu(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Ansicht zentr.</span>
              </button>
            </div>
          </div>

          {/* JSON Dateien & PDF-Plan */}
          <div className="space-y-1.5 border-t border-[#223044] pt-2.5">
            <div className="text-[10.5px] font-semibold text-slate-400">
              Schaltplan-Dateien &amp; Referenz
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  jsonInputRef.current?.click();
                  setShowSettingsMenu(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>JSON Laden</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onExportJson();
                  setShowSettingsMenu(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>JSON Speichern</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  pdfInputRef.current?.click();
                  setShowSettingsMenu(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-amber-200 bg-[#162133] border border-[#243247] hover:border-amber-500/50 hover:bg-[#1D2B42] transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>PDF-Plan laden</span>
              </button>

              {hasPdfLoaded ? (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePdfPanel();
                    setShowSettingsMenu(false);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    showPdfPanel
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-[#162133] text-amber-300 border-amber-500/40 hover:bg-[#1D2B42]'
                  }`}
                >
                  <span>{showPdfPanel ? 'PDF ausblenden' : 'PDF einblenden'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChangelog();
                    setShowSettingsMenu(false);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-sky-400" />
                  <span>Changelog</span>
                </button>
              )}
            </div>
          </div>

          {/* Export: Prozessanimation (HTML) & Anlagenbau-Schaltplan (PDF) */}
          <div className="space-y-1.5 border-t border-[#223044] pt-2.5">
            <div className="text-[10.5px] font-semibold text-slate-400">
              Export: Animation &amp; Anlagenbau-PDF
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  onOpenPdfExport();
                  setShowSettingsMenu(false);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold text-emerald-200 bg-emerald-600/20 border border-emerald-500/50 hover:bg-emerald-600/30 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Anlagenbau-Schaltplan (PDF)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenHtmlExport();
                  setShowSettingsMenu(false);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold text-sky-200 bg-sky-600/20 border border-sky-500/50 hover:bg-sky-600/30 transition-colors cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Animation exportieren (.html)</span>
              </button>
            </div>
          </div>

          {/* Gespeicherte Pläne im Dropdown verwalten & direkt löschen */}
          <div className="space-y-1.5 border-t border-[#223044] pt-2.5">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-slate-400">
              <span>Gespeicherte Pläne ({savedSimulations.length})</span>
            </div>
            {savedSimulations.length === 0 ? (
              <div className="text-[11px] text-slate-500 bg-[#0B111A] border border-[#223044] rounded px-2.5 py-2">
                Noch keine Pläne lokal gespeichert.
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
                {savedSimulations.map((sim) => {
                  const isActive = sim.id === activeCircuitId;
                  const isConfirming = confirmMenuDeleteId === sim.id;
                  return (
                    <div
                      key={sim.id}
                      className={`flex items-center justify-between gap-1.5 rounded px-2 py-1.5 border text-xs ${
                        isActive
                          ? 'bg-sky-500/10 border-sky-500/40 text-sky-200'
                          : 'bg-[#0B111A] border-[#223044] text-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCircuit(sim.id);
                          setShowSettingsMenu(false);
                        }}
                        className="truncate text-left flex-1 hover:text-sky-300 cursor-pointer font-medium"
                        title="Diesen Plan laden"
                      >
                        {sim.name}
                      </button>

                      {isConfirming ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteSavedSimulation(sim.id);
                              setConfirmMenuDeleteId(null);
                            }}
                            className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-semibold cursor-pointer"
                          >
                            Ja
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmMenuDeleteId(null)}
                            className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-[10px] cursor-pointer"
                          >
                            Nein
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmMenuDeleteId(sim.id)}
                          title={`"${sim.name}" aus Liste löschen`}
                          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* App Installation & Info */}
          <div className="flex items-center justify-between gap-2 border-t border-[#223044] pt-2.5">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => {
                onOpenChangelog();
                setShowSettingsMenu(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-sky-300 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] cursor-pointer ml-auto"
            >
              <History className="w-3.5 h-3.5" />
              <span>v{CURRENT_VERSION} Historie</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
