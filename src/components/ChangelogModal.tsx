import React from 'react';
import { History, X } from 'lucide-react';
import { CHANGELOG_ENTRIES, CURRENT_VERSION } from '../changelog';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-[1px] flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#101826] border border-[#26364D] rounded-lg w-full max-w-xl max-h-[82vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[#223044] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Changelog — Version {CURRENT_VERSION}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Changelog schließen"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#19263A] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <section
              key={entry.version}
              className={idx > 0 ? 'border-t border-[#223044] pt-4' : ''}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-sm font-bold text-sky-400">
                    v{entry.version}
                  </span>
                  <h3 className="text-xs font-semibold text-slate-100">
                    {entry.title}
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-slate-500 shrink-0">
                  {entry.date}
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside leading-relaxed">
                {entry.changes.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[#223044] flex items-center justify-between gap-4">
          <span className="text-[11px] font-mono text-slate-400">
            © 2026 @MAT
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-sky-600 text-white hover:bg-sky-500 transition-colors cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
