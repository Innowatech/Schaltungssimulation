import { PortDefinition, PortDomain } from '../engine/types';

export interface RouteEndpoint {
  id: string;
  domain: PortDomain;
  fromCompId: string;
  toCompId: string;
  x1: number;
  y1: number;
  side1: PortDefinition['side'];
  x2: number;
  y2: number;
  side2: PortDefinition['side'];
}

export interface Point2D {
  x: number;
  y: number;
}

export interface OrthoSegment {
  connId: string;
  domain: PortDomain;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: 'H' | 'V';
}

export interface FluidGapMask {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoutedWire {
  id: string;
  d: string;
  midX: number;
  midY: number;
  gapMasks: FluidGapMask[];
}

function sideVector(side: PortDefinition['side']): { dx: number; dy: number } {
  if (side === 'left') return { dx: -1, dy: 0 };
  if (side === 'right') return { dx: 1, dy: 0 };
  if (side === 'top') return { dx: 0, dy: -1 };
  return { dx: 0, dy: 1 };
}

function buildManhattanPoints(
  x1: number,
  y1: number,
  side1: PortDefinition['side'],
  x2: number,
  y2: number,
  side2: PortDefinition['side'],
  laneOffsetPx: number
): Point2D[] {
  const v1 = sideVector(side1);
  const v2 = sideVector(side2);
  const baseStub = 24;
  const s1 = baseStub + Math.max(-8, Math.min(18, laneOffsetPx * 0.5));
  const s2 = baseStub + Math.max(-8, Math.min(18, -laneOffsetPx * 0.5));

  const p1: Point2D = { x: x1, y: y1 };
  const e1: Point2D = { x: x1 + v1.dx * s1, y: y1 + v1.dy * s1 };
  const e2: Point2D = { x: x2 + v2.dx * s2, y: y2 + v2.dy * s2 };
  const p2: Point2D = { x: x2, y: y2 };

  const pts: Point2D[] = [p1, e1];

  const horiz1 = v1.dx !== 0;
  const horiz2 = v2.dx !== 0;

  if (horiz1 && horiz2) {
    // Typischer Fall: right -> left oder left -> right
    const goingForward =
      (v1.dx > 0 && e1.x <= e2.x) || (v1.dx < 0 && e1.x >= e2.x);

    if (goingForward && v1.dx !== v2.dx) {
      const midX = (e1.x + e2.x) / 2 + laneOffsetPx;
      pts.push({ x: midX, y: e1.y }, { x: midX, y: e2.y });
    } else if (v1.dx === v2.dx) {
      const outerX = v1.dx > 0 ? Math.max(e1.x, e2.x) + 12 : Math.min(e1.x, e2.x) - 12;
      pts.push({ x: outerX, y: e1.y }, { x: outerX, y: e2.y });
    } else {
      // Rückwärts-Schleife (Ziel liegt hinter Quelle) -> sauber außen herum
      const dy = e2.y - e1.y;
      let detourY = (e1.y + e2.y) / 2 + laneOffsetPx;
      if (Math.abs(dy) < 92) {
        detourY = Math.min(e1.y, e2.y) - 68 - Math.abs(laneOffsetPx);
      }
      pts.push(
        { x: e1.x, y: detourY },
        { x: e2.x, y: detourY }
      );
    }
  } else if (!horiz1 && !horiz2) {
    // top/bottom -> top/bottom
    const midY = (e1.y + e2.y) / 2 + laneOffsetPx;
    pts.push({ x: e1.x, y: midY }, { x: e2.x, y: midY });
  } else if (horiz1 && !horiz2) {
    // Horizontal raus -> vertikal rein (z. B. Igel oben/unten)
    if ((v1.dx > 0 && e1.x <= e2.x) || (v1.dx < 0 && e1.x >= e2.x)) {
      pts.push({ x: e2.x, y: e1.y });
    } else {
      const midY = (e1.y + e2.y) / 2 + laneOffsetPx;
      pts.push({ x: e1.x, y: midY }, { x: e2.x, y: midY });
    }
  } else {
    // Vertikal raus -> horizontal rein
    if ((v1.dy > 0 && e1.y <= e2.y) || (v1.dy < 0 && e1.y >= e2.y)) {
      pts.push({ x: e1.x, y: e2.y });
    } else {
      const midX = (e1.x + e2.x) / 2 + laneOffsetPx;
      pts.push({ x: midX, y: e1.y }, { x: midX, y: e2.y });
    }
  }

  pts.push(e2, p2);
  return simplifyPoints(pts);
}

function simplifyPoints(pts: Point2D[]): Point2D[] {
  const dedup: Point2D[] = [];
  for (const pt of pts) {
    const prev = dedup[dedup.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.5) {
      dedup.push(pt);
    }
  }
  const clean: Point2D[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const prev = clean[clean.length - 1];
    const curr = dedup[i];
    const next = dedup[i + 1];
    if (prev && next) {
      const collinearX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
      const collinearY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
      if (collinearX || collinearY) continue;
    }
    clean.push(curr);
  }
  return clean;
}

function computeLabelMidpoint(pts: Point2D[]): Point2D {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  let bestLen = -1;
  let bestMid: Point2D = {
    x: (pts[0].x + pts[pts.length - 1].x) / 2,
    y: (pts[0].y + pts[pts.length - 1].y) / 2,
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (len > bestLen) {
      bestLen = len;
      bestMid = {
        x: (pts[i].x + pts[i + 1].x) / 2,
        y: (pts[i].y + pts[i + 1].y) / 2,
      };
    }
  }
  return bestMid;
}

export function buildPreviewOrthogonalPath(
  x1: number,
  y1: number,
  side1: PortDefinition['side'],
  x2: number,
  y2: number,
  side2: PortDefinition['side']
): string {
  const pts = buildManhattanPoints(x1, y1, side1, x2, y2, side2, 0);
  if (pts.length === 0) return '';
  return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * Berechnet alle 90°-Pfade inklusive Option-C-Kreuzungen:
 * - Elektrik & Analog: Halbkreis-Brückensprung über kreuzende Leitungen/Rohre
 * - Fluidrohre: Saubere Unterbrechungslücke (Hintergrund-Maske) unter der obenliegenden Leitung
 */
export function routeAllOrthogonalWires(
  endpoints: RouteEndpoint[]
): Map<string, RoutedWire> {
  const result = new Map<string, RoutedWire>();
  if (endpoints.length === 0) return result;

  // Spur-Versatz für parallele Leitungen derselben Quell-Komponente berechnen
  const byFromComp = new Map<string, RouteEndpoint[]>();
  for (const ep of endpoints) {
    const arr = byFromComp.get(ep.fromCompId) ?? [];
    arr.push(ep);
    byFromComp.set(ep.fromCompId, arr);
  }
  const laneOffsets = new Map<string, number>();
  for (const group of byFromComp.values()) {
    const n = group.length;
    group.forEach((ep, idx) => {
      laneOffsets.set(ep.id, (idx - (n - 1) / 2) * 8);
    });
  }

  const wirePoints = new Map<string, Point2D[]>();
  const allSegments: OrthoSegment[] = [];

  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    const pts = buildManhattanPoints(
      ep.x1,
      ep.y1,
      ep.side1,
      ep.x2,
      ep.y2,
      ep.side2,
      laneOffsets.get(ep.id) ?? 0
    );
    wirePoints.set(ep.id, pts);

    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s];
      const b = pts[s + 1];
      const isH = Math.abs(a.y - b.y) < 0.5;
      const isV = Math.abs(a.x - b.x) < 0.5;
      if (!isH && !isV) continue;
      allSegments.push({
        connId: ep.id,
        domain: ep.domain,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        orientation: isH ? 'H' : 'V',
      });
    }
  }

  const wireOrder = new Map<string, number>();
  endpoints.forEach((ep, idx) => wireOrder.set(ep.id, idx));

  const MARGIN = 10;
  const HOP_R = 6.5;

  for (const ep of endpoints) {
    const pts = wirePoints.get(ep.id) ?? [];
    if (pts.length < 2) {
      result.set(ep.id, { id: ep.id, d: '', midX: ep.x1, midY: ep.y1, gapMasks: [] });
      continue;
    }

    const myOrder = wireOrder.get(ep.id) ?? 0;
    const gapMasks: FluidGapMask[] = [];
    const pathParts: string[] = [`M ${pts[0].x} ${pts[0].y}`];

    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s];
      const b = pts[s + 1];
      const isH = Math.abs(a.y - b.y) < 0.5;
      const isV = Math.abs(a.x - b.x) < 0.5;

      if (!isH && !isV) {
        pathParts.push(`L ${b.x} ${b.y}`);
        continue;
      }

      if (ep.domain === 'fluid') {
        // Fluidrohr: prüfe Kreuzungen mit anderen Fluidrohren, die UNTER diesem Rohr liegen (myOrder > otherOrder)
        for (const other of allSegments) {
          if (other.connId === ep.id || other.domain !== 'fluid') continue;
          if (other.orientation === (isH ? 'H' : 'V')) continue;

          const otherOrder = wireOrder.get(other.connId) ?? 0;
          const drawGapOverOther =
            myOrder > otherOrder || (myOrder === otherOrder && isH);
          if (!drawGapOverOther) continue;

          if (isH) {
            const minX = Math.min(a.x, b.x) + MARGIN;
            const maxX = Math.max(a.x, b.x) - MARGIN;
            const minY = Math.min(other.y1, other.y2) + MARGIN;
            const maxY = Math.max(other.y1, other.y2) - MARGIN;
            if (other.x1 > minX && other.x1 < maxX && a.y > minY && a.y < maxY) {
              gapMasks.push({
                x1: other.x1 - 11,
                y1: a.y,
                x2: other.x1 + 11,
                y2: a.y,
              });
            }
          } else {
            const minY = Math.min(a.y, b.y) + MARGIN;
            const maxY = Math.max(a.y, b.y) - MARGIN;
            const minX = Math.min(other.x1, other.x2) + MARGIN;
            const maxX = Math.max(other.x1, other.x2) - MARGIN;
            if (other.y1 > minY && other.y1 < maxY && a.x > minX && a.x < maxX) {
              gapMasks.push({
                x1: a.x,
                y1: other.y1 - 11,
                x2: a.x,
                y2: other.y1 + 11,
              });
            }
          }
        }
        pathParts.push(`L ${b.x} ${b.y}`);
      } else {
        // Elektrik / Analog: Option C Brückensprung-Bogen über kreuzende Leitungen oder Fluidrohre
        const crossPositions: number[] = [];

        for (const other of allSegments) {
          if (other.connId === ep.id) continue;
          if (other.orientation === (isH ? 'H' : 'V')) continue;

          // Regel: Bei Elektrik/Analog gegen Fluid springt immer der Draht über das dicke Rohr;
          // Bei Elektrik/Analog untereinander springt standardmäßig die horizontale Leitung über die vertikale.
          const shouldHop = other.domain === 'fluid' ? true : isH;
          if (!shouldHop) continue;

          if (isH) {
            const minX = Math.min(a.x, b.x) + MARGIN;
            const maxX = Math.max(a.x, b.x) - MARGIN;
            const minY = Math.min(other.y1, other.y2) + MARGIN;
            const maxY = Math.max(other.y1, other.y2) - MARGIN;
            if (other.x1 > minX && other.x1 < maxX && a.y > minY && a.y < maxY) {
              crossPositions.push(other.x1);
            }
          } else {
            const minY = Math.min(a.y, b.y) + MARGIN;
            const maxY = Math.max(a.y, b.y) - MARGIN;
            const minX = Math.min(other.x1, other.x2) + MARGIN;
            const maxX = Math.max(other.x1, other.x2) - MARGIN;
            if (other.y1 > minY && other.y1 < maxY && a.x > minX && a.x < maxX) {
              crossPositions.push(other.y1);
            }
          }
        }

        if (crossPositions.length === 0) {
          pathParts.push(`L ${b.x} ${b.y}`);
          continue;
        }

        const dir = isH ? (b.x >= a.x ? 1 : -1) : b.y >= a.y ? 1 : -1;
        crossPositions.sort((u, v) => (dir > 0 ? u - v : v - u));

        // Filter zu dicht beieinander liegende Kreuzungen (> 2 * HOP_R)
        const filtered: number[] = [];
        for (const pos of crossPositions) {
          const prev = filtered[filtered.length - 1];
          if (prev === undefined || Math.abs(pos - prev) > HOP_R * 2.5) {
            filtered.push(pos);
          }
        }

        for (const pos of filtered) {
          if (isH) {
            const beforeX = pos - dir * HOP_R;
            const afterX = pos + dir * HOP_R;
            pathParts.push(`L ${beforeX} ${a.y}`);
            // Halbkreis nach oben (sweep = dir > 0 ? 1 : 0)
            pathParts.push(
              `A ${HOP_R} ${HOP_R} 0 0 ${dir > 0 ? 1 : 0} ${afterX} ${a.y}`
            );
          } else {
            const beforeY = pos - dir * HOP_R;
            const afterY = pos + dir * HOP_R;
            pathParts.push(`L ${a.x} ${beforeY}`);
            pathParts.push(
              `A ${HOP_R} ${HOP_R} 0 0 ${dir > 0 ? 1 : 0} ${a.x} ${afterY}`
            );
          }
        }
        pathParts.push(`L ${b.x} ${b.y}`);
      }
    }

    const mid = computeLabelMidpoint(pts);
    result.set(ep.id, {
      id: ep.id,
      d: pathParts.join(' '),
      midX: mid.x,
      midY: mid.y,
      gapMasks,
    });
  }

  return result;
}
