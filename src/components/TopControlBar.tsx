import React, { useRef } from 'react';
import {
  AlertTriangle,
  Download,
  History,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  StepForward,
  Upload,
  Zap,
} from 'lucide-react';
import { CURRENT_VERSION } from '../changelog';
import { CIRCUIT_PRESETS } from '../engine/presets';

interface TopControlBarProps {
  isRunning: boolean;
  onToggleRun: () => void;
  onStepOneSecond: () => void;
  onReset: () => void;
  totalSimSeconds: number;
  timeScale: number;
  onChangeTimeScale: (scale: number) => void;
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onResetView: () => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => void;
  activeFaultCount: number;
  showFaultPanel: boolean;
  onToggleFaultPanel: () => void;
  onTriggerRandomFault: () => void;
  onClearAllFaults: () => void;
  onOpenChangelog: () => void;
}

const TIME_SCALE_PRESETS = [1, 10, 60, 600, 3600];

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
  isRunning,
  onToggleRun,
  onStepOneSecond,
  onReset,
  totalSimSeconds,
  timeScale,
  onChangeTimeScale,
  activePresetId,
  onSelectPreset,
  onResetView,
  onExportJson,
  onImportJson,
  activeFaultCount,
  showFaultPanel,
  onToggleFaultPanel,
  onTriggerRandomFault,
  onClearAllFaults,
  onOpenChangelog,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = formatSimTime(totalSimSeconds);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  return (
    <header className="h-14 bg-[#101826] border-b border-[#223044] px-3.5 flex items-center justify-between gap-3 select-none shrink-0 z-30 overflow-x-auto">
      {/* Zone 1: Titel, Version & Vorlagen */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          Mechatronik &amp; Fluidik
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
          aria-label="Anlagen-Vorlage auswählen"
          value={activePresetId}
          onChange={(e) => onSelectPreset(e.target.value)}
          className="bg-[#0B111A] border border-[#243247] text-xs text-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-sky-500 max-w-[195px] truncate cursor-pointer"
        >
          {CIRCUIT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {activePresetId === 'custom' && (
            <option value="custom">Benutzerdefiniert</option>
          )}
        </select>
      </div>

      {/* Zone 2: Playback, Simulierte Gesamtzeit & Zeitraffer */}
      <div className="flex items-center gap-3 shrink-0">
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

        {/* Simulierte Gesamtzeit (Tage:Stunden:Minuten) */}
        <div className="flex items-center gap-2 bg-[#0B111A] border border-[#223044] rounded-md px-2.5 py-1">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">Zeit</span>
          <div className="font-mono text-xs font-semibold text-slate-100 tracking-tight whitespace-nowrap">
            <span>{t.days}T</span>
            <span className="text-slate-500 mx-0.5">:</span>
            <span>{t.hours}Std</span>
            <span className="text-slate-500 mx-0.5">:</span>
            <span>{t.minutes}Min</span>
            <span className="text-slate-500 text-[10px] ml-1">({t.seconds}s)</span>
          </div>
        </div>

        {/* Zeitraffer */}
        <div className="flex items-center gap-2">
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
            className="w-16 accent-sky-500 cursor-pointer"
          />
          <span className="font-mono text-[11px] text-sky-400 w-11 text-right whitespace-nowrap">
            {timeScale >= 10 ? Math.round(timeScale) : timeScale.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Zone 3: Fehler-Simulation & Schaltplan Speichern/Laden */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onTriggerRandomFault}
          title="Zufälligen Fehler in der Anlage aktivieren"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Zufallsfehler</span>
        </button>

        <button
          type="button"
          onClick={onToggleFaultPanel}
          title="Fehler-Diagnose & Auswirkungen anzeigen"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
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

        <div className="h-5 w-px bg-[#223044] mx-0.5" />

        <button
          type="button"
          onClick={onExportJson}
          title="Schaltplan als JSON-Datei speichern"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span>Speichern</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Schaltplan aus JSON-Datei laden"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-sky-400" />
          <span>Laden</span>
        </button>

        <button
          type="button"
          onClick={onResetView}
          title="Ansicht zentrieren"
          className="inline-flex items-center p-1.5 rounded-md text-xs text-slate-300 bg-[#162133] border border-[#243247] hover:bg-[#1D2B42] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </header>
  );
};
