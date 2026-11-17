import React, { useState } from 'react';
import { MonitorDown, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="App auf PC oder Smartphone installieren"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-600/20 text-sky-300 border border-sky-500/50 hover:bg-sky-600/35 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <MonitorDown className="w-3.5 h-3.5" />
        <span>Installieren</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="App auf iPhone / iPad installieren"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-sky-600/20 text-sky-300 border border-sky-500/50 hover:bg-sky-600/35 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MonitorDown className="w-3.5 h-3.5" />
          <span>App installieren</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-lg bg-[#0E1522] border border-[#243247] p-5 shadow-2xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  Auf iPhone / iPad installieren
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-slate-300 space-y-2 leading-relaxed list-decimal list-inside">
                <li>
                  Tippen Sie in Safari unten oder oben auf das{' '}
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                    <Share className="w-3.5 h-3.5" /> Teilen-Symbol
                  </span>
                  .
                </li>
                <li>
                  Wählen Sie <strong>„Zum Home-Bildschirm“</strong> aus.
                </li>
                <li>
                  Bestätigen Sie oben rechts mit <strong>„Hinzufügen“</strong>.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-md bg-[#162133] border border-[#243247] text-xs font-medium text-slate-200 hover:bg-[#1D2B42] cursor-pointer"
              >
                Verstanden
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
