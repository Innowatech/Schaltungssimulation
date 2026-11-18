import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus, Trash2, Unlink, X } from 'lucide-react';
import { SimComponent } from '../engine/SimComponent';
import { FloatProbeComponent, TankComponent } from '../engine/components/FluidComponents';
import { Connection, PortDefinition } from '../engine/types';
import {
  ComponentObstacle,
  RouteEndpoint,
  buildPreviewOrthogonalPath,
  resolveComponentPlacement,
  routeAllOrthogonalWires,
} from '../utils/orthogonalRouting';
import { ComponentNode, PendingWireStart } from './ComponentNode';
import { OfflineIndicator } from './OfflineIndicator';

interface WorkbenchCanvasProps {
  theme: 'dark' | 'light';
  viewMode?: 'schematic' | 'animation';
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
  theme,
  viewMode = 'schematic',
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

  const wireDragRef = useRef<{
    pointerId: number;
    sourceComponentId: string;
    sourcePort: PortDefinition;
    startClientX: number;
    startClientY: number;
    wasAlreadyPendingOrigin: boolean;
    hadDragged: boolean;
  } | null>(null);

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

  const latestPropsRef = useRef({
    pan,
    zoom,
    components,
    pendingWire,
    onPanZoomChange,
    onMoveComponent,
    onCreateConnection,
  });
  latestPropsRef.current = {
    pan,
    zoom,
    components,
    pendingWire,
    onPanZoomChange,
    onMoveComponent,
    onCreateConnection,
  };

  useEffect(() => {
    setConfirmDisconnectId(null);
  }, [selectedConnectionId]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { pan: curPan, zoom: curZoom } = latestPropsRef.current;
    return {
      x: (clientX - rect.left - curPan.x) / curZoom,
      y: (clientY - rect.top - curPan.y) / curZoom,
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
        wireDragRef.current = null;
        setConfirmDisconnectId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingInput) {
        onDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDeleteSelected]);

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      const {
        zoom: curZoom,
        pendingWire: curPending,
        onPanZoomChange: updatePanZoom,
        onMoveComponent: moveComp,
      } = latestPropsRef.current;

      if (curPending || wireDragRef.current) {
        setCursorWorld(screenToWorld(e.clientX, e.clientY));
      }

      const wDrag = wireDragRef.current;
      if (wDrag && wDrag.pointerId === e.pointerId) {
        const dist = Math.hypot(e.clientX - wDrag.startClientX, e.clientY - wDrag.startClientY);
        if (dist >= DRAG_THRESHOLD_PX) {
          wDrag.hadDragged = true;
        }
      }

      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      if (drag.kind === 'pan') {
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        updatePanZoom({ x: drag.startPanX + dx, y: drag.startPanY + dy }, curZoom);
      } else if (drag.kind === 'comp') {
        const distPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
        if (!drag.hasExceededThreshold) {
          if (distPx < DRAG_THRESHOLD_PX) return;
          drag.hasExceededThreshold = true;
        }
        const dx = (e.clientX - drag.startClientX) / curZoom;
        const dy = (e.clientY - drag.startClientY) / curZoom;
        const nextX = Math.round((drag.startCompX + dx) / 4) * 4;
        const nextY = Math.round((drag.startCompY + dy) / 4) * 4;
        moveComp(drag.compId, nextX, nextY);
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (drag && drag.pointerId === e.pointerId) {
        dragStateRef.current = null;
        if (drag.kind === 'comp' && drag.hasExceededThreshold) {
          const allComps = latestPropsRef.current.components;
          const moved = allComps.find((c) => c.id === drag.compId);
          if (moved) {
            const obstacles: ComponentObstacle[] = allComps.map((c) => ({
              id: c.id,
              x: c.x,
              y: c.y,
              width: c.width,
              height: c.height,
            }));
            const resolved = resolveComponentPlacement(
              moved.id,
              moved.x,
              moved.y,
              moved.width,
              moved.height,
              obstacles,
              36
            );
            if (resolved.x !== moved.x || resolved.y !== moved.y) {
              latestPropsRef.current.onMoveComponent(moved.id, resolved.x, resolved.y);
            }
          }
        }
      }

      const wDrag = wireDragRef.current;
      if (wDrag && wDrag.pointerId === e.pointerId) {
        wireDragRef.current = null;

        if (wDrag.hadDragged) {
          // Drag-&-Drop-Verbindung direkt auf Zielklemme prüfen
          const hitEl = document.elementFromPoint(e.clientX, e.clientY);
          const portEl = hitEl?.closest?.('[data-port-id][data-component-id]') as HTMLElement | null;
          if (portEl) {
            const targetCompId = portEl.dataset.componentId;
            const targetPortId = portEl.dataset.portId;
            if (targetCompId && targetPortId) {
              const targetComp = latestPropsRef.current.components.find(
                (c) => c.id === targetCompId
              );
              const targetPort = targetComp?.getPorts().find((p) => p.id === targetPortId);
              if (
                targetPort &&
                !(targetCompId === wDrag.sourceComponentId && targetPort.id === wDrag.sourcePort.id) &&
                targetPort.domain === wDrag.sourcePort.domain &&
                (targetPort.domain === 'electrical'
                  ? !(targetPort.direction === 'output' && wDrag.sourcePort.direction === 'output')
                  : targetCompId !== wDrag.sourceComponentId &&
                    targetPort.direction !== wDrag.sourcePort.direction)
              ) {
                latestPropsRef.current.onCreateConnection(
                  wDrag.sourceComponentId,
                  wDrag.sourcePort.id,
                  targetCompId,
                  targetPort.id
                );
              }
            }
          }
          setPendingWire(null);
        } else if (wDrag.wasAlreadyPendingOrigin) {
          // Zweiter Klick auf die bereits gewählte Startklemme bricht ab
          setPendingWire(null);
        }
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, []);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1 && e.button !== -1) return;
    if (pendingWire) {
      setPendingWire(null);
      wireDragRef.current = null;
      return;
    }
    onSelectComponent(null);
    onSelectConnection(null);
    setConfirmDisconnectId(null);
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
    if (e.button !== 0 && e.button !== -1) return;
    const comp = components.find((c) => c.id === componentId);
    if (!comp) return;
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const { pan: curPan, zoom: curZoom, onPanZoomChange: updatePanZoom } = latestPropsRef.current;

      const stepSize =
        Math.abs(e.deltaY) >= 40
          ? 0.05
          : Math.max(0.015, Math.min(0.05, Math.abs(e.deltaY) * 0.0012));
      const delta = e.deltaY < 0 ? stepSize : -stepSize;
      const nextZoom = Math.max(0.35, Math.min(2.0, Math.round((curZoom + delta) * 100) / 100));
      if (nextZoom === curZoom) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - curPan.x) / curZoom;
      const worldY = (mouseY - curPan.y) / curZoom;

      const nextPanX = mouseX - worldX * nextZoom;
      const nextPanY = mouseY - worldY * nextZoom;
      updatePanZoom({ x: nextPanX, y: nextPanY }, nextZoom);
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const applyButtonZoom = (delta: number) => {
    const nextZoom = Math.max(0.35, Math.min(2.0, Math.round((zoom + delta) * 100) / 100));
    if (nextZoom === zoom) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      onPanZoomChange(pan, nextZoom);
      return;
    }
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - pan.x) / zoom;
    const worldY = (centerY - pan.y) / zoom;
    onPanZoomChange(
      { x: centerX - worldX * nextZoom, y: centerY - worldY * nextZoom },
      nextZoom
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/sim-component-type');
    if (!type) return;
    const world = screenToWorld(e.clientX, e.clientY);
    onDropNewComponent(type, Math.round(world.x - 90), Math.round(world.y - 50));
  };

  const handlePortPointerDown = (
    e: React.PointerEvent,
    componentId: string,
    port: PortDefinition
  ) => {
    if (e.button !== 0 && e.button !== -1) return;
    const world = screenToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    // Fall A: Es läuft bereits eine Verdrahtung -> kompatible Zielklemme (inkl. Brücke) direkt verbinden
    const isCompatiblePending =
      pendingWire &&
      !(pendingWire.componentId === componentId && pendingWire.portId === port.id) &&
      pendingWire.domain === port.domain &&
      (port.domain === 'electrical'
        ? !(pendingWire.direction === 'output' && port.direction === 'output')
        : pendingWire.componentId !== componentId && pendingWire.direction !== port.direction);

    if (isCompatiblePending && pendingWire) {
      onCreateConnection(
        pendingWire.componentId,
        pendingWire.portId,
        componentId,
        port.id
      );
      setPendingWire(null);
      wireDragRef.current = null;
      return;
    }

    // Fall B: Gleiche Startklemme nochmal gedrückt -> bei kurzem Loslassen abbrechen, bei Ziehen neu starten
    const isSameOrigin =
      pendingWire?.componentId === componentId && pendingWire?.portId === port.id;

    setPendingWire({
      componentId,
      portId: port.id,
      domain: port.domain,
      direction: port.direction,
    });

    wireDragRef.current = {
      pointerId: e.pointerId,
      sourceComponentId: componentId,
      sourcePort: port,
      startClientX: e.clientX,
      startClientY: e.clientY,
      wasAlreadyPendingOrigin: isSameOrigin,
      hadDragged: false,
    };
  };

  const isAnimationMode = viewMode === 'animation';

  const visibleComponents = useMemo(() => {
    if (!isAnimationMode) return components;
    const hiddenTypes = new Set(['power_24v', 'power_230v', 'terminal_block', 'contactor_relay']);
    return components.filter((c) => !hiddenTypes.has(c.type));
  }, [components, isAnimationMode]);

  const visibleConnections = useMemo(() => {
    if (!isAnimationMode) return connections;
    return connections.filter((c) => c.domain === 'fluid' || c.domain === 'air');
  }, [connections, isAnimationMode]);

  const compMap = useMemo(
    () => new Map(visibleComponents.map((c) => [c.id, c])),
    [visibleComponents]
  );

  const obstacles = useMemo<ComponentObstacle[]>(
    () =>
      visibleComponents.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
      })),
    [visibleComponents]
  );

  // Berechne alle hindernis-freien rechtwinkligen Leitungen + Option-C-Kreuzungen
  const routedWires = useMemo(() => {
    const endpoints: RouteEndpoint[] = [];
    for (const conn of visibleConnections) {
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
    return routeAllOrthogonalWires(endpoints, obstacles);
  }, [compMap, visibleConnections, obstacles]);

  // Sortiere Render-Reihenfolge: Fluidrohre & Luftschläuche unten, dann Analog & Elektrik mit Brückenbögen drüber
  const orderedConnections = useMemo(() => {
    const fluidsAndAir = visibleConnections.filter((c) => c.domain === 'fluid' || c.domain === 'air');
    const signals = visibleConnections.filter((c) => c.domain !== 'fluid' && c.domain !== 'air');
    return [...fluidsAndAir, ...signals];
  }, [visibleConnections]);

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
        targetSide,
        obstacles
      );
    }
  }

  const selectedRoute = selectedConnectionId ? routedWires.get(selectedConnectionId) : undefined;

  const isLight = theme === 'light';
  const canvasMaskColor = isLight ? '#F1F5F9' : '#0B111A';
  const labelBgColor = isLight ? '#FFFFFF' : '#0B111A';

  return (
    <main
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handleCanvasPointerDown}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
      className="no-context-touch relative flex-1 bg-[#0B111A] overflow-hidden select-none touch-none"
      style={{
        backgroundImage: `radial-gradient(circle, ${isLight ? '#CBD5E1' : '#1E2D42'} 1px, transparent 1px)`,
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
                      stroke={canvasMaskColor}
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
                        : conn.domain === 'air'
                        ? 'ABGEKNICKT'
                        : 'UNTERBROCHEN'}
                    </text>
                  </g>
                </g>
              );
            }

            if (conn.domain === 'electrical') {
              const energized = conn.active;
              const is230V =
                (conn.voltage ?? 0) >= 100 ||
                conn.fromPortId === 'out_230v' ||
                conn.toPortId === 'l_230v';
              const activeStroke = is230V ? '#F97316' : '#EF4444';
              const pulseStroke = is230V ? '#FED7AA' : '#FCA5A5';
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
                      stroke={activeStroke}
                      strokeOpacity={0.28}
                      strokeWidth={7.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isSelected
                        ? '#F59E0B'
                        : energized
                        ? activeStroke
                        : isHovered
                        ? isLight
                          ? '#475569'
                          : '#94A3B8'
                        : is230V
                        ? isLight
                          ? '#FB923C'
                          : '#7C2D12'
                        : isLight
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
                      stroke={pulseStroke}
                      strokeWidth={1.6}
                      strokeDasharray="4 20"
                      strokeLinejoin="round"
                      className="animate-electric-pulse pointer-events-none"
                    />
                  )}

                  {is230V && (energized || isSelected || isHovered) && (
                    <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
                      <rect
                        x="-22"
                        y="-9"
                        width="44"
                        height="16"
                        rx="4"
                        fill={labelBgColor}
                        fillOpacity={0.94}
                        stroke={energized ? '#F97316' : isLight ? '#CBD5E1' : '#334155'}
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="2"
                        textAnchor="middle"
                        fill={energized ? (isLight ? '#C2410C' : '#FB923C') : isLight ? '#475569' : '#94A3B8'}
                        fontSize="8.5"
                        fontFamily="monospace"
                        fontWeight="700"
                      >
                        230V~
                      </text>
                    </g>
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
                      strokeOpacity={0.26}
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isSelected
                        ? '#F59E0B'
                        : active
                        ? '#10B981'
                        : isHovered
                        ? isLight
                          ? '#475569'
                          : '#94A3B8'
                        : isLight
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
                        fill={labelBgColor}
                        fillOpacity={0.94}
                        stroke={active ? '#10B981' : isLight ? '#CBD5E1' : '#334155'}
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="2.5"
                        textAnchor="middle"
                        fill={active ? (isLight ? '#047857' : '#6EE7B7') : isLight ? '#475569' : '#94A3B8'}
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

            if (conn.domain === 'air') {
              const airLpm = conn.airFlowLpm ?? 0;
              const flowingAir = conn.active && airLpm > 0;
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
                      stroke={canvasMaskColor}
                      strokeWidth={14}
                      strokeLinecap="butt"
                    />
                  ))}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                  {flowingAir && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#06B6D4"
                      strokeOpacity={0.28}
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isSelected
                        ? '#F59E0B'
                        : flowingAir
                        ? '#06B6D4'
                        : isHovered
                        ? isLight
                          ? '#0E7490'
                          : '#67E8F9'
                        : isLight
                        ? '#94A3B8'
                        : '#334155'
                    }
                    strokeWidth={isSelected ? 3.8 : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {flowingAir && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#CFFAFE"
                      strokeWidth={2}
                      strokeDasharray="6 14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-fluid-flow pointer-events-none"
                    />
                  )}
                  {(flowingAir || isSelected || isHovered) && (
                    <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
                      <rect
                        x="-30"
                        y="-10"
                        width="60"
                        height="18"
                        rx="4"
                        fill={labelBgColor}
                        fillOpacity={0.94}
                        stroke={flowingAir ? '#06B6D4' : isLight ? '#CBD5E1' : '#334155'}
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="2.5"
                        textAnchor="middle"
                        fill={flowingAir ? (isLight ? '#0E7490' : '#67E8F9') : isLight ? '#475569' : '#94A3B8'}
                        fontSize="9.5"
                        fontFamily="monospace"
                        fontWeight="600"
                      >
                        {Math.round(airLpm)} L/min
                      </text>
                    </g>
                  )}
                </g>
              );
            }

            // Fluid-Rohrleitung (Anolyt = Gelb, Katholyte = Grün, Wasser = Kräftiges Blau) + Option-C Unterbrechungslücke
            const flowLph = conn.flowRateLph ?? 0;
            const flowing = conn.active && flowLph > 0;
            const isKat = conn.medium === 'katholyte';
            const isAno = conn.medium === 'anolyte';
            const baseColor = isKat ? '#10B981' : isAno ? '#EAB308' : '#1D4ED8';
            const pulseColor = isKat ? '#A7F3D0' : isAno ? '#FEF08A' : '#93C5FD';
            const textColor = isKat ? '#6EE7B7' : isAno ? '#FDE047' : '#60A5FA';
            const lightTextColor = isKat ? '#047857' : isAno ? '#A16207' : '#1E40AF';

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
                    stroke={canvasMaskColor}
                    strokeWidth={16}
                    strokeLinecap="butt"
                  />
                ))}

                <path d={d} fill="none" stroke="transparent" strokeWidth={18} />

                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? '#F59E0B' : isLight ? '#CBD5E1' : '#1E293B'}
                  strokeWidth={8.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {flowing && (
                  <path
                    d={d}
                    fill="none"
                    stroke={baseColor}
                    strokeOpacity={0.28}
                    strokeWidth={11}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                <path
                  d={d}
                  fill="none"
                  stroke={
                    flowing
                      ? baseColor
                      : isHovered
                      ? isLight
                        ? '#475569'
                        : '#64748B'
                      : isLight
                      ? '#94A3B8'
                      : '#334155'
                  }
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
                      fill={labelBgColor}
                      fillOpacity={0.94}
                      stroke={flowing ? baseColor : isLight ? '#CBD5E1' : '#334155'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="2.5"
                      textAnchor="middle"
                      fill={
                        flowing
                          ? isLight
                            ? lightTextColor
                            : textColor
                          : isLight
                          ? '#475569'
                          : '#94A3B8'
                      }
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
                  : pendingWire.domain === 'air'
                  ? '#22D3EE'
                  : '#2563EB'
              }
              strokeWidth={pendingWire.domain === 'fluid' ? 4 : pendingWire.domain === 'air' ? 3 : 2.5}
              strokeDasharray="6 6"
              className="pointer-events-none"
            />
          )}
        </svg>

        <div className="relative z-10 pointer-events-auto">
          {visibleComponents.map((comp) => (
            <ComponentNode
              key={comp.id}
              component={comp}
              allComponents={visibleComponents}
              isSelected={selectedComponentId === comp.id}
              hideTerminals={isAnimationMode}
              pendingWire={isAnimationMode ? null : pendingWire}
              onStartDrag={handleStartDragComponent}
              onSelect={(id) => {
                onSelectConnection(null);
                onSelectComponent(id);
              }}
              onOpenProperties={(id) => {
                onSelectConnection(null);
                onOpenProperties(id);
              }}
              onPortPointerDown={handlePortPointerDown}
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
              ? 'Elektrische Leitung: Zielklemme oder weiteren Eingang zum Brücken anklicken'
              : pendingWire.domain === 'analog'
              ? 'Analogsignal (4–20mA / 0–10V): Kompatiblen Analogeingang anklicken'
              : pendingWire.domain === 'air'
              ? 'Druckluftschlauch (Luftpumpe): Luft-Anschluss am Tank anklicken'
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

      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-[#101826]/95 border border-[#223044] rounded-md p-1 z-30 shadow-md">
        <button
          type="button"
          onClick={() => applyButtonZoom(-0.05)}
          title="Herauszoomen (-5%)"
          className="p-1 text-slate-300 hover:text-white hover:bg-[#19263A] rounded cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[11px] text-slate-300 px-2 min-w-[46px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => applyButtonZoom(0.05)}
          title="Hineinzoomen (+5%)"
          className="p-1 text-slate-300 hover:text-white hover:bg-[#19263A] rounded cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#101826]/90 border border-[#223044] text-[11px] font-mono text-slate-400 select-none z-20 shadow-sm">
        <OfflineIndicator inline />
        <span className="pointer-events-none">Copyright © 2026 #MAT</span>
      </div>
    </main>
  );
};
