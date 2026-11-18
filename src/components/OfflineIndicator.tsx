import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineIndicatorProps {
  inline?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ inline = false }) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  if (inline) {
    return (
      <span
        title="Offline-Modus — App läuft lokal im Cache"
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40"
      >
        <WifiOff className="w-2.5 h-2.5" />
        <span>Offline</span>
      </span>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 rounded-md bg-amber-500/95 px-2.5 py-1 text-[11px] font-semibold text-slate-950 shadow-lg">
      <WifiOff className="w-3 h-3" />
      <span>Offline</span>
    </div>
  );
};
