import React, { useState } from 'react';
import { Download, FileCode2, FileSpreadsheet, Film, RotateCw, X } from 'lucide-react';
import { PdfExportOptions } from '../utils/pdfSchematicGenerator';
import { HtmlAnimationExportOptions } from '../utils/htmlAnimationExporter';

interface HtmlAnimationExportModalProps {
  isOpen: boolean;
  theme: 'dark' | 'light';
  componentCount: number;
  onClose: () => void;
  onExport: (options: HtmlAnimationExportOptions) => void;
}

export const HtmlAnimationExportModal: React.FC<HtmlAnimationExportModalProps> = ({
  isOpen,
  theme,
  componentCount,
  onClose,
  onExport,
}) => {
  const [durationHours, setDurationHours] = useState<number>(24);
  const [customHours, setCustomHours] = useState<string>('24');
  const [loopDefault, setLoopDefault] = useState<boolean>(true);
  const [autoEnablePower, setAutoEnablePower] = useState<boolean>(true);

  if (!isOpen) return null;

  const effectiveHours = Math.max(1, Math.min(240, Number(customHours) || durationHours));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[#101826] border border-[#26364D] rounded-xl shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#223044] bg-[#141E2E]">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold">Prozessanimation als HTML exportieren</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <p className="text-slate-400 leading-relaxed">
            Erstellt eine eigenständige Offline-HTML-Animation ohne Klemmen und Kabel (inkl.
            Zeitrelais-Fortschritt, Tankfüllständen, Sprudelblasen, Leitungsfluss und Ablauf-Ticker).
          </p>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-200">
              Zyklusdauer der Animation
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[24, 48, 72].map((h) => {
                const active = effectiveHours === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setDurationHours(h);
                      setCustomHours(String(h));
                    }}
                    className={`py-1.5 rounded-md font-mono font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-[#162133] text-slate-300 border-[#243247] hover:bg-[#1D2B42]'
                    }`}
                  >
                    {h} Std
                  </button>
                );
              })}
              <div className="flex items-center bg-[#0B111A] border border-[#243247] rounded-md px-2">
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  className="w-full bg-transparent font-mono text-slate-100 focus:outline-none text-right pr-1"
                  aria-label="Benutzerdefinierte Stunden"
                />
                <span className="text-[10px] text-slate-400">h</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0B111A] border border-[#223044] cursor-pointer">
              <input
                type="checkbox"
                checked={loopDefault}
                onChange={(e) => setLoopDefault(e.target.checked)}
                className="mt-0.5 accent-sky-500 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Endlos-Schleife (Loop) aktivieren</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Läuft in der exportierten HTML-Datei automatisch im Kreis herum (Standard).
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0B111A] border border-[#223044] cursor-pointer">
              <input
                type="checkbox"
                checked={autoEnablePower}
                onChange={(e) => setAutoEnablePower(e.target.checked)}
                className="mt-0.5 accent-sky-500 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-slate-200">
                  Netzteile &amp; Hauptschalter für Export einschalten
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Startet die aufgezeichnete Anlage ab T=0 unter Spannung, auch wenn aktuell Pause
                  oder Aus gewählt ist.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#223044]">
            <span className="text-[11px] text-slate-400">
              {componentCount} Bauteile erfasst
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md border border-[#243247] bg-[#162133] text-slate-300 hover:text-white cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={componentCount === 0}
                onClick={() => {
                  onExport({
                    durationHours: effectiveHours,
                    loopDefault,
                    autoEnablePower,
                    theme,
                  });
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-sky-600 text-white font-semibold hover:bg-sky-500 disabled:opacity-40 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>HTML herunterladen</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PdfSchematicExportModalProps {
  isOpen: boolean;
  componentCount: number;
  onClose: () => void;
  onExport: (options: PdfExportOptions) => void;
}

export const PdfSchematicExportModal: React.FC<PdfSchematicExportModalProps> = ({
  isOpen,
  componentCount,
  onClose,
  onExport,
}) => {
  const [includeCoverAndBom, setIncludeCoverAndBom] = useState(true);
  const [includeElectrical, setIncludeElectrical] = useState(true);
  const [includeWiringAndTerminals, setIncludeWiringAndTerminals] = useState(true);
  const [includeFluidAndAir, setIncludeFluidAndAir] = useState(true);

  if (!isOpen) return null;

  const anySelected =
    includeCoverAndBom ||
    includeElectrical ||
    includeWiringAndTerminals ||
    includeFluidAndAir;

  const items: Array<{
    key: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    title: string;
    desc: string;
  }> = [
    {
      key: 'cover',
      checked: includeCoverAndBom,
      onChange: setIncludeCoverAndBom,
      title: '1. Deckblatt, Stückliste (BOM) & Einstellwerte',
      desc: 'BMK-Übersicht, Plausibilitätsprüfung (z. B. A2-Check) und alle Zeit-/Tank-Sollwerte.',
    },
    {
      key: 'elec',
      checked: includeElectrical,
      onChange: setIncludeElectrical,
      title: '2. Normnaher Stromlaufplan (230V AC + 24V DC + 0V/N/PE)',
      desc: 'Strompfade mit Kontaktspiegel, automatischer 0V-Sammelschiene und 24V→230V Koppelrelais.',
    },
    {
      key: 'wire',
      checked: includeWiringAndTerminals,
      onChange: setIncludeWiringAndTerminals,
      title: '3. Klemmenplan (-X1 / -X0) & Verdrahtungs-Hakenliste',
      desc: 'Ader-für-Ader-Checkliste zum Abhaken inkl. Querschnitt, Aderfarbe, 0V, N und PE.',
    },
    {
      key: 'fluid',
      checked: includeFluidAndAir,
      onChange: setIncludeFluidAndAir,
      title: '4. Fluidik- & Pneumatik-Schema (R&I-Fließbild)',
      desc: 'Skalierter Verrohrungsplan (Anolyt/Katholyte/Wasser/Druckluft) + Schlauchliste.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[#101826] border border-[#26364D] rounded-xl shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#223044] bg-[#141E2E]">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold">Anlagenbau-Schaltplan (PDF) erstellen</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-slate-400 leading-relaxed">
            Wähle aus, welche Blätter im DIN-A4-Querformat-PDF enthalten sein sollen. Ideal zum
            1:1-Nachbau im Schaltschrank inkl. automatischer 0V-, N- und PE-Leitungen.
          </p>

          <div className="space-y-2">
            {items.map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0B111A] border border-[#223044] hover:border-sky-500/40 transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="mt-0.5 accent-emerald-500 cursor-pointer"
                />
                <div>
                  <div className="font-semibold text-slate-100">{item.title}</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#223044]">
            <button
              type="button"
              onClick={() => {
                const next = !anySelected;
                setIncludeCoverAndBom(next);
                setIncludeElectrical(next);
                setIncludeWiringAndTerminals(next);
                setIncludeFluidAndAir(next);
              }}
              className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              {anySelected ? 'Alle abwählen' : 'Alle auswählen'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md border border-[#243247] bg-[#162133] text-slate-300 hover:text-white cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={!anySelected || componentCount === 0}
                onClick={() => {
                  onExport({
                    includeCoverAndBom,
                    includeElectrical,
                    includeWiringAndTerminals,
                    includeFluidAndAir,
                  });
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF generieren</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
