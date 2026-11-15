import React from 'react';
import { PanelLeftClose, Plus } from 'lucide-react';
import { ComponentRegistry } from '../engine/ComponentRegistry';
import { ComponentCategory, ComponentMetadata } from '../engine/types';

interface ComponentLibraryProps {
  onQuickAdd: (type: string) => void;
  onCollapse: () => void;
}

const CATEGORY_GROUPS: Array<{ title: string; categories: ComponentCategory[] }> = [
  {
    title: 'Elektrik & Steuerung',
    categories: ['electric', 'relay'],
  },
  {
    title: 'Logik & Messtechnik',
    categories: ['logic'],
  },
  {
    title: 'Fluidik & Sensorik',
    categories: ['fluid', 'sensor'],
  },
];

function renderMiniSchematic(type: string): React.ReactNode {
  switch (type) {
    case 'power_24v':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="3" y="4" width="30" height="20" rx="3" fill="#162133" stroke="#EF4444" strokeWidth="1.5" />
          <text x="18" y="17" textAnchor="middle" fill="#F87171" fontSize="9" fontFamily="monospace" fontWeight="600">
            24V
          </text>
        </svg>
      );
    case 'switch':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <line x1="3" y1="16" x2="12" y2="16" stroke="#94A3B8" strokeWidth="1.75" />
          <line x1="12" y1="16" x2="23" y2="8" stroke="#F87171" strokeWidth="1.75" />
          <line x1="24" y1="16" x2="33" y2="16" stroke="#94A3B8" strokeWidth="1.75" />
          <circle cx="12" cy="16" r="2" fill="#94A3B8" />
          <circle cx="24" cy="16" r="2" fill="#94A3B8" />
        </svg>
      );
    case 'timer_relay':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="5" y="4" width="26" height="20" rx="2.5" fill="#162133" stroke="#F59E0B" strokeWidth="1.4" />
          <circle cx="14" cy="14" r="5" fill="none" stroke="#FBBF24" strokeWidth="1.3" />
          <polyline points="14,11 14,14 16.5,15.5" fill="none" stroke="#FBBF24" strokeWidth="1.3" />
          <line x1="23" y1="9" x2="27" y2="9" stroke="#94A3B8" strokeWidth="1.3" />
          <line x1="23" y1="19" x2="27" y2="19" stroke="#94A3B8" strokeWidth="1.3" />
        </svg>
      );
    case 'contactor_relay':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="5" y="5" width="11" height="18" rx="1.5" fill="#162133" stroke="#94A3B8" strokeWidth="1.4" />
          <line x1="5" y1="20" x2="16" y2="8" stroke="#94A3B8" strokeWidth="1.2" />
          <line x1="16" y1="14" x2="21" y2="14" stroke="#64748B" strokeDasharray="2 1.5" strokeWidth="1.2" />
          <line x1="22" y1="9" x2="30" y2="6" stroke="#38BDF8" strokeWidth="1.4" />
          <line x1="22" y1="19" x2="30" y2="16" stroke="#38BDF8" strokeWidth="1.4" />
        </svg>
      );
    case 'current_transformer':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <line x1="3" y1="14" x2="33" y2="14" stroke="#EF4444" strokeWidth="1.6" />
          <circle cx="18" cy="14" r="7" fill="none" stroke="#10B981" strokeWidth="1.8" />
          <text x="18" y="17" textAnchor="middle" fill="#6EE7B7" fontSize="8" fontFamily="monospace" fontWeight="700">
            A
          </text>
        </svg>
      );
    case 'signal_transmitter':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="5" y="4" width="26" height="20" rx="2.5" fill="#162133" stroke="#10B981" strokeWidth="1.4" />
          <line x1="8" y1="20" x2="28" y2="8" stroke="#34D399" strokeWidth="1.3" />
          <text x="13" y="12" fill="#94A3B8" fontSize="6" fontFamily="monospace">
            V
          </text>
          <text x="22" y="21" fill="#6EE7B7" fontSize="6" fontFamily="monospace">
            mA
          </text>
        </svg>
      );
    case 'logic_and':
    case 'logic_or':
    case 'logic_not': {
      const sym = type === 'logic_and' ? '&' : type === 'logic_or' ? '≥1' : '1';
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="8" y="4" width="20" height="20" rx="2" fill="#162133" stroke="#A78BFA" strokeWidth="1.4" />
          <text x="18" y="17" textAnchor="middle" fill="#DDD6FE" fontSize="9" fontFamily="monospace" fontWeight="700">
            {sym}
          </text>
          {type === 'logic_not' && (
            <circle cx="30" cy="14" r="2.2" fill="#162133" stroke="#A78BFA" strokeWidth="1.3" />
          )}
        </svg>
      );
    }
    case 'tank':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="8" y="3" width="20" height="22" rx="2" fill="#0F172A" stroke="#64748B" strokeWidth="1.5" />
          <rect x="9.5" y="13" width="17" height="10.5" rx="1" fill="#0EA5E9" fillOpacity="0.65" />
          <line x1="8" y1="13" x2="28" y2="13" stroke="#38BDF8" strokeWidth="1.2" />
        </svg>
      );
    case 'float_probe':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <line x1="18" y1="3" x2="18" y2="24" stroke="#94A3B8" strokeWidth="2" />
          <circle cx="18" cy="10" r="3" fill="#0EA5E9" stroke="#E0F2FE" strokeWidth="1" />
          <circle cx="18" cy="19" r="3" fill="#F59E0B" stroke="#FEF3C7" strokeWidth="1" />
        </svg>
      );
    case 'generator':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <circle cx="17" cy="14" r="9" fill="#162133" stroke="#0EA5E9" strokeWidth="1.5" />
          <polygon points="15,9 23,14 15,19" fill="#38BDF8" />
          <line x1="26" y1="14" x2="33" y2="14" stroke="#0EA5E9" strokeWidth="2" />
        </svg>
      );
    case 'valve_32':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <rect x="8" y="6" width="10" height="16" fill="#162133" stroke="#38BDF8" strokeWidth="1.3" />
          <rect x="18" y="6" width="10" height="16" fill="#162133" stroke="#64748B" strokeWidth="1.3" />
          <line x1="10" y1="18" x2="16" y2="10" stroke="#38BDF8" strokeWidth="1.3" />
          <line x1="20" y1="10" x2="26" y2="18" stroke="#94A3B8" strokeWidth="1.3" />
        </svg>
      );
    case 'valve_22':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <polygon points="8,8 18,14 8,20" fill="#162133" stroke="#38BDF8" strokeWidth="1.4" />
          <polygon points="28,8 18,14 28,20" fill="#162133" stroke="#38BDF8" strokeWidth="1.4" />
          <line x1="18" y1="4" x2="18" y2="14" stroke="#94A3B8" strokeWidth="1.3" />
        </svg>
      );
    case 'drain_consumer':
      return (
        <svg viewBox="0 0 36 28" className="w-9 h-7 shrink-0">
          <line x1="5" y1="10" x2="20" y2="10" stroke="#0EA5E9" strokeWidth="2" />
          <path d="M20 10 Q24 10 24 15 L24 20" fill="none" stroke="#0EA5E9" strokeWidth="2" />
          <polygon points="21,20 27,20 24,25" fill="#38BDF8" />
        </svg>
      );
    default:
      return null;
  }
}

export const ComponentLibrary: React.FC<ComponentLibraryProps> = ({
  onQuickAdd,
  onCollapse,
}) => {
  const allEntries = ComponentRegistry.getAll();

  const handleDragStart = (e: React.DragEvent, meta: ComponentMetadata) => {
    e.dataTransfer.setData('application/sim-component-type', meta.type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-64 bg-[#0E1522] border-r border-[#223044] flex flex-col shrink-0 select-none overflow-hidden">
      <div className="px-4 py-3 border-b border-[#223044] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
            Bauteil-Bibliothek
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Auf Fläche ziehen oder + klicken
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Bauteil-Bibliothek ausblenden"
          aria-label="Bauteil-Bibliothek ausblenden"
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#19263B] transition-colors cursor-pointer shrink-0"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {CATEGORY_GROUPS.map((group) => {
          const items = allEntries.filter((e) =>
            group.categories.includes(e.meta.category)
          );
          return (
            <section key={group.title}>
              <h3 className="text-[11px] font-semibold text-slate-400 px-1 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {items.map(({ meta }) => (
                  <div
                    key={meta.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, meta)}
                    onDoubleClick={() => onQuickAdd(meta.type)}
                    className="group flex items-center gap-2.5 p-2 rounded-lg bg-[#141E2E] border border-[#223044] hover:border-sky-500/60 hover:bg-[#19263B] transition-colors cursor-grab active:cursor-grabbing"
                  >
                    {renderMiniSchematic(meta.type)}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-100 truncate">
                        {meta.name}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight line-clamp-2 mt-0.5">
                        {meta.shortDescription}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickAdd(meta.type);
                      }}
                      title={`${meta.name} hinzufügen`}
                      className="p-1 rounded text-slate-400 hover:text-sky-300 hover:bg-sky-500/15 opacity-75 group-hover:opacity-100 transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-[#223044] bg-[#0B111A]/60 text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-0.5 bg-red-500" />
          <span>24V DC aktiv / Grau = 0V</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-0.5 bg-emerald-400" />
          <span>Analogsignal (4–20mA / 0–10V)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-1 bg-sky-400 rounded-xs" />
          <span>Fluid-Durchfluss animiert</span>
        </div>
      </div>
    </aside>
  );
};
