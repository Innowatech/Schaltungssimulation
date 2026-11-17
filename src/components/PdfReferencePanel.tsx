import React, { useState } from 'react';
import {
  FileText,
  Maximize2,
  Minimize2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface PdfReferencePanelProps {
  fileUrl: string | null;
  fileName: string;
  isImage: boolean;
  isOpen: boolean;
  onClose: () => void;
  onClearFile: () => void;
}

export const PdfReferencePanel: React.FC<PdfReferencePanelProps> = ({
  fileUrl,
  fileName,
  isImage,
  isOpen,
  onClose,
  onClearFile,
}) => {
  const [wide, setWide] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);

  if (!isOpen || !fileUrl) return null;

  return (
    <aside
      className={`fixed md:static inset-y-14 right-0 md:inset-y-auto z-40 md:z-20 flex flex-col bg-[#0F1724] border-l border-[#223044] shrink-0 shadow-2xl md:shadow-none transition-[width] duration-150 ${
        wide ? 'w-[92vw] sm:w-[540px]' : 'w-[86vw] sm:w-[380px]'
      }`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#223044] flex items-center justify-between gap-2 bg-[#101826]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate" title={fileName}>
              {fileName || 'Schaltplan-Referenz'}
            </div>
            <div className="text-[10px] text-slate-400">
              Lokaler Referenz-Plan (kein Backend)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isImage && (
            <>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.max(0.4, Math.round((z - 0.2) * 10) / 10))}
                title="Verkleinern"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1B2639] cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-slate-300 w-9 text-center">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.min(3, Math.round((z + 0.2) * 10) / 10))}
                title="Vergrößern"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1B2639] cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setWide((w) => !w)}
            title={wide ? 'Schmalere Ansicht' : 'Breitere Ansicht'}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1B2639] cursor-pointer"
          >
            {wide ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClearFile}
            title="Geladene Referenz-Datei entfernen"
            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Schaltplan-Ansicht ausblenden"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1B2639] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hinweis */}
      <div className="px-3 py-1.5 bg-[#121D2E] border-b border-[#1E2C42] text-[10px] text-slate-400 leading-relaxed">
        Direkte Nachbau-Vorlage direkt neben der Arbeitsfläche. Datei verbleibt lokal im Browser.
      </div>

      {/* Viewer Body */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#080D14]">
        {isImage ? (
          <div className="p-3 min-h-full flex items-start justify-center">
            <img
              src={fileUrl}
              alt={fileName}
              style={{
                width: `${imageZoom * 100}%`,
                maxWidth: 'none',
              }}
              className="rounded border border-[#223044] shadow-lg"
            />
          </div>
        ) : (
          <iframe
            src={fileUrl}
            title={fileName || 'PDF Schaltplan'}
            className="w-full h-full border-0 bg-slate-900"
          />
        )}
      </div>
    </aside>
  );
};
