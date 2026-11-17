import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus, Trash2, Unlink, X } from 'lucide-react';
import { SimComponent } from '../engine/SimComponent';
import { FloatProbeComponent, TankComponent } from '../engine/components/FluidComponents';
import { Connection, PortDefinition } from '../engine/types';
import {
  RouteEndpoint,
  buildPreviewOrthogonalPath,
  routeAllOrthogonalWires,
} from '../utils/orthogonalRouting';
import { ComponentNode, PendingWireStart } from './ComponentNode';

interface WorkbenchCanvasProps {
  components: SimComponent[];
  connections: Connection[];
  selectedComponentId: string | null;
  selectedConnectionId: string | null;
  pan: { x: number; y: number };
  zoom: number;
  onPanZoomChange: (pan: { x: number; y: number }, zoom: number) => void;
  onSelectComponent: (id: string | null) => void;
  onSelectConnection: (id: string | null) => void;
  onOpenProperties: (id: string) => void;
  onDropNewComponent: (type: string, worldX: number, worldY: number) => void;
  onMoveComponent: (id: string, x: number, y: number) => void;
  onCreateConnection: (
    fromCompId: string,
    fromPortId: string,
    toCompId: string,
    toPortId: string
  ) => void;
  onDeleteConnection: (connectionId: string) => void;
  onDeleteSelected: () => void;
  onMutateComponent: () => void;
}

const DRAG_THRESHOLD_PX = 5;

export const WorkbenchCanvas: React.FC<WorkbenchCanvasProps> = ({
  components,
  connections,
  selectedComponentId,
  selectedConnectionId,
  pan,
  zoom,
  onPanZoomChange,
  onSelectComponent,
  onSelectConnection,
  onOpenProperties,
  onDropNewComponent,
  onMoveComponent,
  onCreateConnection,
  onDeleteConnection,
  onDeleteSelected,
  onMutateComponent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingWire, setPendingWire] = useState<PendingWireStart | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);

  const dragStateRef = useRef<
    | {
        kind: 'pan';
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startPanX: number;
        startPanY: number;
      }
    | {
        kind: 'comp';
        pointerId: number;
        compId: string;
        startClientX: number;
        startClientY: number;
        startCompX: number;
        startCompY: number;
        hasExceededThreshold: boolean;
      }
    | null
  >(null);

  useEffect(() => {
    setConfirmDisconnectId(null);
  }, [selectedConnectionId]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA');

      if (e.key === 'Escape') {
        setPendingWire(null);
        setConfirmDisconnectId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingInput) {
        onDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDeleteSelected]);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (pendingWire) {
      setPendingWire(null);
      return;
    }
    onSelectComponent(null);
    onSelectConnection(null);
    setConfirmDisconnectId(null);
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture fails
    }
    dragStateRef.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleStartDragComponent = (e: React.PointerEvent, componentId: string) => {
    if (e.button !== 0) return;
    const comp = components.find((c) => c.id === componentId);
    if (!comp) return;
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture fails
    }
    dragStateRef.current = {
      kind: 'comp',
      pointerId: e.pointerId,
      compId: componentId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCompX: comp.x,
      startCompY: comp.y,
      hasExceededThreshold: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pendingWire) {
      setCursorWorld(screenToWorld(e.clientX, e.clientY));
    }

    const drag = dragStateRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      onPanZoomChange({ x: drag.startPanX + dx, y: drag.startPanY + dy }, zoom);
    } else if (drag.kind === 'comp') {
      const distPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (!drag.hasExceededThreshold) {
        if (distPx < DRAG_THRESHOLD_PX) return;
        drag.hasExceededThreshold = true;
      }
      const dx = (e.clientX - drag.startClientX) / zoom;
      const dy = (e.clientY - drag.startClientY) / zoom;
      const nextX = Math.round((drag.startCompX + dx) / 4) * 4;
      const nextY = Math.round((drag.startCompY + dy) / 4) * 4;
      onMoveComponent(drag.compId, nextX, nextY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStateRef.current) {
      try {
        if (containerRef.current?.hasPointerCapture(e.pointerId)) {
          containerRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      dragStateRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = Math.max(0.35, Math.min(2.0, zoom * factor));
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const nextPanX = mouseX - worldX * nextZoom;
    const nextPanY = mouseY - worldY * nextZoom;
    onPanZoomChange({ x: nextPanX, y: nextPanY }, nextZoom);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/sim-component-type');
    if (!type) return;
    const world = screenToWorld(e.clientX, e.clientY);
    onDropNewComponent(type, Math.round(world.x - 90), Math.round(world.y - 50));
  };

  const handlePortClick = (
    e: React.MouseEvent,
    componentId: string,
    port: PortDefinition
  ) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    if (!pendingWire) {
      setPendingWire({
        componentId,
        portId: port.id,
        domain: port.domain,
        direction: port.direction,
      });
      return;
    }

    if (pendingWire.componentId === componentId && pendingWire.portId === port.id) {
      setPendingWire(null);
      return;
    }

    if (
      pendingWire.componentId !== componentId &&
      pendingWire.domain === port.domain &&
      pendingWire.direction !== port.direction
    ) {
      onCreateConnection(
        pendingWire.componentId,
        pendingWire.portId,
        componentId,
        port.id
      );
      setPendingWire(null);
    } else {
      setPendingWire({
        componentId,
        portId: port.id,
        domain: port.domain,
        direction: port.direction,
      });
    }
  };

  const compMap = useMemo(
    () => new Map(components.map((c) => [c.id, c])),
    [components]
  );

  // Berechne alle rechtwinkligen Leitungen + Option-C-Kreuzungen
  const routedWires = useMemo(() => {
    const endpoints: RouteEndpoint[] = [];
    for (const conn of connections) {
      const fromComp = compMap.get(conn.fromComponentId);
      const toComp = compMap.get(conn.toComponentId);
      if (!fromComp || !toComp) continue;
      const p1 = fromComp.getPortWorldPosition(conn.fromPortId);
      const p2 = toComp.getPortWorldPosition(conn.toPortId);
      if (!p1 || !p2) continue;

      endpoints.push({
        id: conn.id,
        domain: conn.domain,
        fromCompId: conn.fromComponentId,
        toCompId: conn.toComponentId,
        x1: p1.x,
        y1: p1.y,
        side1: p1.side,
        x2: p2.x,
        y2: p2.y,
        side2: p2.side,
      });
    }
    return routeAllOrthogonalWires(endpoints);
  }, [compMap, connections]);

  // Sortiere Render-Reihenfolge: Fluidrohre unten (innerhalb in Verbindungsreihenfolge, sodass spätere Rohre per Option-C Lücke drüberlaufen), dann Analog & Elektrik mit Brückenbögen drüber
  const orderedConnections = useMemo(() => {
    const fluids = connections.filter((c) => c.domain === 'fluid');
    const signals = connections.filter((c) => c.domain !== 'fluid');
    return [...fluids, ...signals];
  }, [connections]);

  let previewPath: string | null = null;
  if (pendingWire) {
    const srcComp = compMap.get(pendingWire.componentId);
    const pos = srcComp?.getPortWorldPosition(pendingWire.portId);
    if (pos) {
      const targetSide = pos.side === 'left' ? 'right' : 'left';
      previewPath = buildPreviewOrthogonalPath(
        pos.x,
        pos.y,
        pos.side,
        cursorWorld.x,
        cursorWorld.y,
        targetSide
      );
    }
  }

  const selectedRoute = selectedConnectionId ? routedWires.get(selectedConnectionId) : undefined;

  return (
    <main
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
      className="no-context-touch relative flex-1 bg-[#0B111A] overflow-hidden select-none touch-none"
      style={{
        backgroundImage: `radial-gradient(circle, #1E2D42 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        <svg
          className="overflow-visible absolute top-0 left-0 w-1 h-1 pointer-events-auto"
          style={{ zIndex: 5 }}
        >
          <defs>
            <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-blue" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-emerald" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Sensor-Zuordnungslinien: Schwimmerlanze -> Tank */}
          {components
            .filter((c): c is FloatProbeComponent => c instanceof FloatProbeComponent)
            .map((probe) => {
              const tankId = String(probe.params.tankId ?? '');
              const tank = compMap.get(tankId) as TankComponent | undefined;
              if (!tank) return null;
              const x1 = probe.x + probe.width / 2;
              const y1 = probe.y + probe.height / 2;
              const x2 = tank.x + tank.width / 2;
              const y2 = tank.y + tank.height / 2;
              return (
                <line
                  key={`link_${probe.id}_${tank.id}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#F59E0B"
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  className="pointer-events-none"
                />
              );
            })}

          {/* 90° Leitungen, Analogleitungen & Fluidrohre mit Option-C-Kreuzungen */}
          {orderedConnections.map((conn) => {
            const route = routedWires.get(conn.id);
            if (!route || !route.d) return null;

            const { d, midX, midY, gapMasks } = route;
            const isSelected = selectedConnectionId === conn.id;
            const isHovered = hoveredConnId === conn.id;
            const connFault = conn.fault ?? 'none';

            if (connFault !== 'none') {
              const isShort = connFault === 'short_circuit';
              return (
                <g
                  key={conn.id}
                  onMouseEnter={() => setHoveredConnId(conn.id)}
                  onMouseLeave={() => setHoveredConnId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectConnection(conn.id);
                  }}
                  className="cursor-pointer"
                >
                  {gapMasks.map((m, idx) => (
                    <line
                      key={idx}
                      x1={m.x1}
                      y1={m.y1}
                      x2={m.x2}
                      y2={m.y2}
                      stroke="#0B111A"
                      strokeWidth={16}
                      strokeLinecap="butt"
                    />
                  ))}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={18} />
                  <path
                    d={d}
                    fill="none"
                    stroke={isShort ? '#EF4444' : '#F59E0B'}
                    strokeWidth={isSelected ? 4 : 2.8}
                    strokeDasharray="7 5"
                    strokeLinejoin="round"
                  />
                  <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
                    <rect
                      x="-48"
                      y="-10"
                      width="96"
                      height="18"
                      rx="4"
                      fill="#1B0E11"
                      stroke={isShort ? '#EF4444' : '#F59E0B'}
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="2.5"
                      textAnchor="middle"
                      fill={isShort ? '#FCA5A5' : '#FCD34D'}
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="700"
                    >
                      {isShort
                        ? 'KURZSCHLUSS'
                        : conn.domain === 'fluid'
                        ? 'BLOCKIERT'
                        : 'UNTERBROCHEN'}
                    </text>
                  </g>
                </g>
              );
            }

            if (conn.domain === 'electrical') {
              const energized = conn.active;
              return (
                <g
                  key={conn.id}
                  onMouseEnter={() => setHoveredConnId(conn.id)}
                  onMouseLeave={() => setHoveredConnId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectConnection(conn.id);
                  }}
                  className="cursor-pointer"
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} />

                  {energized && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#EF4444"
                      strokeOpacity={0.35}
                      strokeWidth={6}
                      strokeLinejoin="round"
                      filter="url(#glow-red)"
                    />
                  )}

                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isSelected
                        ? '#FBBF24'
                        : energized
                        ? '#EF4444'
                        : isHovered
                        ? '#94A3B8'
                        : '#475569'
                    }
                    strokeWidth={isSelected ? 3.5 : energized ? 2.8 : 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {energized && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#FCA5A5"
                      strokeWidth={1.6}
                      strokeDasharray="4 20"
                      strokeLinejoin="round"
                      className="animate-electric-pulse pointer-events-none"
                    />
                  )}
                </g>
              );
            }

            if (conn.domain === 'analog') {
              const active = conn.active;
              const val = conn.analogValue ?? 0;
              const unit = conn.analogUnit ?? 'mA';
              return (
                <g
                  key={conn.id}
                  onMouseEnter={() => setHoveredConnId(conn.id)}
                  onMouseLeave={() => setHoveredConnId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectConnection(conn.id);
                  }}
                  className="cursor-pointer"
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                  {active && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#10B981"
                      strokeOpacity={0.3}
                      strokeWidth={5.5}
                      strokeLinejoin="round"
                      filter="url(#glow-emerald)"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isSelected
                        ? '#FBBF24'
                        : active
                        ? '#10B981'
                        : isHovered
                        ? '#94A3B8'
                        : '#475569'
                    }
                    strokeWidth={isSelected ? 3.2 : 2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {(active || isSelected || isHovered) && (
                    <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
                      <rect
                        x="-28"
                        y="-10"
                        width="56"
                        height="18"
                        rx="4"
                        fill="#0B111A"
                        fillOpacity={0.92}
                        stroke={active ? '#10B981' : '#334155'}
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="2.5"
                        textAnchor="middle"
                        fill={active ? '#6EE7B7' : '#94A3B8'}
                        fontSize="9.5"
                        fontFamily="monospace"
                        fontWeight="600"
                      >
                        {val.toFixed(1)} {unit}
                      </text>
                    </g>
                  )}
                </g>
              );
            }

            // Fluid-Rohrleitung (Anolyt/Wasser = Blau, Katholyt = Grün) + Option-C Unterbrechungslücke
            const flowLph = conn.flowRateLph ?? 0;
            const flowing = conn.active && flowLph > 0;
            const isKat = conn.medium === 'katholyte';
            const baseColor = isKat ? '#10B981' : '#0EA5E9';
            const pulseColor = isKat ? '#A7F3D0' : '#BAE6FD';
            const textColor = isKat ? '#6EE7B7' : '#7DD3FC';

            return (
              <g
                key={conn.id}
                onMouseEnter={() => setHoveredConnId(conn.id)}
                onMouseLeave={() => setHoveredConnId(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectConnection(conn.id);
                }}
                className="cursor-pointer"
              >
                {/* Option C: Saubere Unterbrechungslücke unter kreuzender Fluid-Leitung */}
                {gapMasks.map((m, idx) => (
                  <line
                    key={idx}
                    x1={m.x1}
                    y1={m.y1}
                    x2={m.x2}
                    y2={m.y2}
                    stroke="#0B111A"
                    strokeWidth={16}
                    strokeLinecap="butt"
                  />
                ))}

                <path d={d} fill="none" stroke="transparent" strokeWidth={18} />

                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? '#FBBF24' : '#1E293B'}
                  strokeWidth={8.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {flowing && (
                  <path
                    d={d}
                    fill="none"
                    stroke={baseColor}
                    strokeOpacity={0.35}
                    strokeWidth={10}
                    strokeLinejoin="round"
                    filter={isKat ? 'url(#glow-emerald)' : 'url(#glow-blue)'}
                  />
                )}

                <path
                  d={d}
                  fill="none"
                  stroke={flowing ? baseColor : isHovered ? '#64748B' : '#334155'}
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {flowing && (
                  <path
                    d={d}
                    fill="none"
                    stroke={pulseColor}
                    strokeWidth={2.5}
                    strokeDasharray="8 20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-fluid-flow pointer-events-none"
                  />
                )}

                {(flowing || isSelected || isHovered) && (
                  <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
                    <rect
                      x="-30"
                      y="-10"
                      width="60"
                      height="18"
                      rx="4"
                      fill="#0B111A"
                      fillOpacity={0.92}
                      stroke={flowing ? baseColor : '#334155'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="2.5"
                      textAnchor="middle"
                      fill={flowing ? textColor : '#94A3B8'}
                      fontSize="9.5"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {flowLph < 10 && flowLph > 0
                        ? `${flowLph.toFixed(1)} L/h`
                        : `${Math.round(flowLph)} L/h`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Rechtwinklige Gummiband-Vorschau */}
          {previewPath && pendingWire && (
            <path
              d={previewPath}
              fill="none"
              stroke={
                pendingWire.domain === 'electrical'
                  ? '#F87171'
                  : pendingWire.domain === 'analog'
                  ? '#34D399'
                  : '#38BDF8'
              }
              strokeWidth={pendingWire.domain === 'fluid' ? 4 : 2.5}
              strokeDasharray="6 6"
              className="pointer-events-none"
            />
          )}
        </svg>

        <div className="pointer-events-auto">
          {components.map((comp) => (
            <ComponentNode
              key={comp.id}
              component={comp}
              allComponents={components}
              isSelected={selectedComponentId === comp.id}
              pendingWire={pendingWire}
              onStartDrag={handleStartDragComponent}
              onSelect={(id) => {
                onSelectConnection(null);
                onSelectComponent(id);
              }}
              onOpenProperties={(id) => {
                onSelectConnection(null);
                onOpenProperties(id);
              }}
              onPortClick={handlePortClick}
              onMutateComponent={onMutateComponent}
            />
          ))}
        </div>

        {/* Schwebende Einzel-Trennen-Schaltfläche direkt an ausgewählter Leitung (mit Bestätigung) */}
        {selectedConnectionId && selectedRoute && (
          <div
            style={{
              left: `${selectedRoute.midX}px`,
              top: `${selectedRoute.midY - 26}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute -translate-x-1/2 -translate-y-full z-40 pointer-events-auto"
          >
            {confirmDisconnectId === selectedConnectionId ? (
              <div className="flex items-center gap-1 bg-[#141E2E] border border-red-500/70 rounded-md px-2 py-1 shadow-xl text-[11px] whitespace-nowrap">
                <span className="text-red-200 font-medium mr-1">Trennen?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteConnection(selectedConnectionId);
                    setConfirmDisconnectId(null);
                  }}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Ja</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisconnectId(null)}
                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDisconnectId(selectedConnectionId)}
                title="Diese einzelne Leitung trennen"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#141E2E] border border-amber-400/70 text-amber-200 hover:bg-red-950/80 hover:border-red-400 hover:text-red-200 text-[11px] font-medium shadow-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3 h-3" />
                <span>Leitung trennen</span>
              </button>
            )}
          </div>
        )}
      </div>

      {pendingWire && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#141E2E]/95 border border-amber-500/50 text-amber-200 px-3.5 py-1.5 rounded-md text-xs flex items-center gap-3 shadow-lg z-30">
          <Unlink className="w-3.5 h-3.5 text-amber-400" />
          <span>
            {pendingWire.domain === 'electrical'
              ? 'Elektrische Leitung: Kompatible Zielklemme anklicken'
              : pendingWire.domain === 'analog'
              ? 'Analogsignal (4–20mA / 0–10V): Kompatiblen Analogeingang anklicken'
              : 'Fluid-Rohrleitung: Kompatiblen Fluid-Anschluss anklicken'}
          </span>
          <button
            type="button"
            onClick={() => setPendingWire(null)}
            className="text-[11px] text-slate-300 hover:text-white underline cursor-pointer"
          >
            Abbrechen (Esc)
          </button>
        </div>
      )}

      {components.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-[#101826]/90 border border-[#223044] rounded-lg px-6 py-5 text-center max-w-md">
            <h3 className="text-sm font-semibold text-slate-100">Arbeitsfläche ist leer</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Ziehen Sie Bauteile aus der linken Bibliothek auf die Fläche, klicken Sie Klemmen zum Verdrahten an und speichern Sie fertige Anlagen oben in der Liste.
            </p>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-[#101826]/95 border border-[#223044] rounded-md p-1 z-30">
        <button
          type="button"
          onClick={() =>
            onPanZoomChange(pan, Math.max(0.35, Math.round((zoom - 0.1) * 100) / 100))
          }
          title="Herauszoomen"
          className="p-1 text-slate-300 hover:text-white hover:bg-[#19263A] rounded cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[11px] text-slate-300 px-2 min-w-[46px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            onPanZoomChange(pan, Math.min(2.0, Math.round((zoom + 0.1) * 100) / 100))
          }
          title="Hineinzoomen"
          className="p-1 text-slate-300 hover:text-white hover:bg-[#19263A] rounded cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </main>
  );
};
