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

export interface ComponentObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

interface Box {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function sideVector(side: PortDefinition['side']): { dx: number; dy: number } {
  if (side === 'left') return { dx: -1, dy: 0 };
  if (side === 'right') return { dx: 1, dy: 0 };
  if (side === 'top') return { dx: 0, dy: -1 };
  return { dx: 0, dy: 1 };
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

function fallbackManhattanPoints(
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
  const stub = 20;
  const p1: Point2D = { x: x1, y: y1 };
  const e1: Point2D = { x: x1 + v1.dx * stub, y: y1 + v1.dy * stub };
  const e2: Point2D = { x: x2 + v2.dx * stub, y: y2 + v2.dy * stub };
  const p2: Point2D = { x: x2, y: y2 };

  const pts: Point2D[] = [p1, e1];
  const horiz1 = v1.dx !== 0;
  const horiz2 = v2.dx !== 0;

  if (horiz1 && horiz2) {
    if (v1.dx === v2.dx) {
      const outerX =
        v1.dx > 0
          ? Math.max(e1.x, e2.x) + 12 + Math.abs(laneOffsetPx)
          : Math.min(e1.x, e2.x) - 12 - Math.abs(laneOffsetPx);
      pts.push({ x: outerX, y: e1.y }, { x: outerX, y: e2.y });
    } else if ((v1.dx > 0 && e1.x <= e2.x) || (v1.dx < 0 && e1.x >= e2.x)) {
      const midX = (e1.x + e2.x) / 2 + laneOffsetPx;
      pts.push({ x: midX, y: e1.y }, { x: midX, y: e2.y });
    } else {
      const detourY = Math.min(e1.y, e2.y) - 68 - Math.abs(laneOffsetPx);
      pts.push({ x: e1.x, y: detourY }, { x: e2.x, y: detourY });
    }
  } else if (!horiz1 && !horiz2) {
    if (v1.dy === v2.dy) {
      const outerY =
        v1.dy > 0
          ? Math.max(e1.y, e2.y) + 12 + Math.abs(laneOffsetPx)
          : Math.min(e1.y, e2.y) - 12 - Math.abs(laneOffsetPx);
      pts.push({ x: e1.x, y: outerY }, { x: e2.x, y: outerY });
    } else {
      const midY = (e1.y + e2.y) / 2 + laneOffsetPx;
      pts.push({ x: e1.x, y: midY }, { x: e2.x, y: midY });
    }
  } else if (horiz1 && !horiz2) {
    if ((v1.dx > 0 && e1.x <= e2.x) || (v1.dx < 0 && e1.x >= e2.x)) {
      pts.push({ x: e2.x, y: e1.y });
    } else {
      const midY = (e1.y + e2.y) / 2 + laneOffsetPx;
      pts.push({ x: e1.x, y: midY }, { x: e2.x, y: midY });
    }
  } else {
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

function dedupeSorted(vals: number[], minDelta = 3): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const rounded = Math.round(v * 10) / 10;
    if (out.length === 0 || Math.abs(rounded - out[out.length - 1]) >= minDelta) {
      out.push(rounded);
    }
  }
  return out;
}

function insertCoordinateSorted(arr: number[], value: number): number {
  let idx = arr.findIndex((v) => Math.abs(v - value) < 1.5);
  if (idx !== -1) return idx;
  arr.push(value);
  arr.sort((a, b) => a - b);
  idx = arr.findIndex((v) => Math.abs(v - value) < 1.5);
  return idx;
}

function segmentHitsBoxes(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  boxes: Box[]
): boolean {
  if (Math.abs(y1 - y2) < 0.5) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (y1 > b.top && y1 < b.bottom && maxX > b.left && minX < b.right) {
        return true;
      }
    }
  } else {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x1 > b.left && x1 < b.right && maxY > b.top && minY < b.bottom) {
        return true;
      }
    }
  }
  return false;
}

function segmentCongestionPenalty(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  existingSegments: OrthoSegment[],
  ignoreConnId: string
): number {
  let penalty = 0;
  const isH = Math.abs(y1 - y2) < 0.5;
  for (let i = 0; i < existingSegments.length; i++) {
    const seg = existingSegments[i];
    if (seg.connId === ignoreConnId) continue;
    if (isH && seg.orientation === 'H' && Math.abs(seg.y1 - y1) < 3.5) {
      const oMin = Math.min(seg.x1, seg.x2);
      const oMax = Math.max(seg.x1, seg.x2);
      const sMin = Math.min(x1, x2);
      const sMax = Math.max(x1, x2);
      if (Math.min(oMax, sMax) > Math.max(oMin, sMin)) {
        penalty += 32;
      }
    } else if (!isH && seg.orientation === 'V' && Math.abs(seg.x1 - x1) < 3.5) {
      const oMin = Math.min(seg.y1, seg.y2);
      const oMax = Math.max(seg.y1, seg.y2);
      const sMin = Math.min(y1, y2);
      const sMax = Math.max(y1, y2);
      if (Math.min(oMax, sMax) > Math.max(oMin, sMin)) {
        penalty += 32;
      }
    }
  }
  return penalty;
}

function routeSingleAStar(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  baseXs: number[],
  baseYs: number[],
  boxes: Box[],
  existingSegments: OrthoSegment[],
  connId: string
): Point2D[] | null {
  const xs = [...baseXs];
  const ys = [...baseYs];
  const startIx = insertCoordinateSorted(xs, sx);
  const targetIx = insertCoordinateSorted(xs, tx);
  const startIy = insertCoordinateSorted(ys, sy);
  const targetIy = insertCoordinateSorted(ys, ty);

  const W = xs.length;
  const H = ys.length;
  // Zustand-Schlüssel: (iy * W + ix) * 3 + dirState (0=start, 1=H, 2=V)
  const totalStates = W * H * 3;
  const gScore = new Float64Array(totalStates);
  gScore.fill(Infinity);
  const parent = new Int32Array(totalStates);
  parent.fill(-1);
  const closed = new Uint8Array(totalStates);

  const startState = (startIy * W + startIx) * 3 + 0;
  gScore[startState] = 0;

  // Kleiner binärer Min-Heap für maximale Geschwindigkeit
  const heapIdx: number[] = [startState];
  const heapF: number[] = [Math.abs(tx - sx) + Math.abs(ty - sy)];

  const pushHeap = (state: number, f: number) => {
    heapIdx.push(state);
    heapF.push(f);
    let pos = heapIdx.length - 1;
    while (pos > 0) {
      const p = (pos - 1) >> 1;
      if (heapF[p] <= heapF[pos]) break;
      const ti = heapIdx[p];
      const tf = heapF[p];
      heapIdx[p] = heapIdx[pos];
      heapF[p] = heapF[pos];
      heapIdx[pos] = ti;
      heapF[pos] = tf;
      pos = p;
    }
  };

  const popHeap = (): number => {
    const top = heapIdx[0];
    const lastIdx = heapIdx.pop()!;
    const lastF = heapF.pop()!;
    if (heapIdx.length > 0) {
      heapIdx[0] = lastIdx;
      heapF[0] = lastF;
      let pos = 0;
      const len = heapIdx.length;
      while (true) {
        let best = pos;
        const l = pos * 2 + 1;
        const r = pos * 2 + 2;
        if (l < len && heapF[l] < heapF[best]) best = l;
        if (r < len && heapF[r] < heapF[best]) best = r;
        if (best === pos) break;
        const ti = heapIdx[pos];
        const tf = heapF[pos];
        heapIdx[pos] = heapIdx[best];
        heapF[pos] = heapF[best];
        heapIdx[best] = ti;
        heapF[best] = tf;
        pos = best;
      }
    }
    return top;
  };

  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 2],
    [0, -1, 2],
  ] as const;

  let goalState = -1;

  while (heapIdx.length > 0) {
    const state = popHeap();
    if (closed[state]) continue;
    closed[state] = 1;

    const dirState = state % 3;
    const cell = (state - dirState) / 3;
    const ix = cell % W;
    const iy = (cell - ix) / W;

    if (ix === targetIx && iy === targetIy) {
      goalState = state;
      break;
    }

    const cx = xs[ix];
    const cy = ys[iy];
    const curG = gScore[state];

    for (let d = 0; d < 4; d++) {
      const [dx, dy, nextDir] = DIRS[d];
      const nx = ix + dx;
      const ny = iy + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

      const x2 = xs[nx];
      const y2 = ys[ny];
      if (segmentHitsBoxes(cx, cy, x2, y2, boxes)) continue;

      const dist = Math.abs(x2 - cx) + Math.abs(y2 - cy);
      const bendCost = dirState !== 0 && dirState !== nextDir ? 38 : 0;
      const congCost = segmentCongestionPenalty(cx, cy, x2, y2, existingSegments, connId);
      const nextG = curG + dist + bendCost + congCost;

      const nextState = (ny * W + nx) * 3 + nextDir;
      if (nextG < gScore[nextState]) {
        gScore[nextState] = nextG;
        parent[nextState] = state;
        const h = Math.abs(tx - x2) + Math.abs(ty - y2);
        pushHeap(nextState, nextG + h);
      }
    }
  }

  if (goalState === -1) return null;

  const rev: Point2D[] = [];
  let cur = goalState;
  while (cur !== -1) {
    const dirState = cur % 3;
    const cell = (cur - dirState) / 3;
    const ix = cell % W;
    const iy = (cell - ix) / W;
    rev.push({ x: xs[ix], y: ys[iy] });
    cur = parent[cur];
  }
  rev.reverse();
  return rev;
}

function computeAvoidantManhattanPoints(
  ep: RouteEndpoint,
  obstacles: ComponentObstacle[],
  baseXsStrict: number[],
  baseYsStrict: number[],
  boxesStrict: Box[],
  boxesRelaxed: Box[],
  existingSegments: OrthoSegment[],
  stubOffset: number
): Point2D[] {
  const v1 = sideVector(ep.side1);
  const v2 = sideVector(ep.side2);

  // Start- und End-Austrittspunkt sauber außerhalb der eigenen Bauteil-Kante (min. 16px)
  const stub1 = 16 + stubOffset;
  const stub2 = 16 + stubOffset;

  const p1: Point2D = { x: ep.x1, y: ep.y1 };
  const e1: Point2D = { x: ep.x1 + v1.dx * stub1, y: ep.y1 + v1.dy * stub1 };
  const e2: Point2D = { x: ep.x2 + v2.dx * stub2, y: ep.y2 + v2.dy * stub2 };
  const p2: Point2D = { x: ep.x2, y: ep.y2 };

  if (obstacles.length === 0) {
    return fallbackManhattanPoints(ep.x1, ep.y1, ep.side1, ep.x2, ep.y2, ep.side2, stubOffset);
  }

  // Pass 1: Strikter Abstand (12px rund um jedes Bauteil)
  let path = routeSingleAStar(
    e1.x,
    e1.y,
    e2.x,
    e2.y,
    baseXsStrict,
    baseYsStrict,
    boxesStrict,
    existingSegments,
    ep.id
  );

  // Pass 2: Falls Bestandsschaltplan sehr eng steht, engerer Korridor (4px Abstand)
  if (!path) {
    const tightStub1 = 10 + (stubOffset % 6);
    const tightStub2 = 10 + (stubOffset % 6);
    const te1 = { x: ep.x1 + v1.dx * tightStub1, y: ep.y1 + v1.dy * tightStub1 };
    const te2 = { x: ep.x2 + v2.dx * tightStub2, y: ep.y2 + v2.dy * tightStub2 };
    const tightXs = dedupeSorted([
      ...obstacles.flatMap((c) => [c.x - 6, c.x + c.width + 6]),
      te1.x,
      te2.x,
    ]);
    const tightYs = dedupeSorted([
      ...obstacles.flatMap((c) => [c.y - 6, c.y + c.height + 6]),
      te1.y,
      te2.y,
    ]);
    path = routeSingleAStar(
      te1.x,
      te1.y,
      te2.x,
      te2.y,
      tightXs,
      tightYs,
      boxesRelaxed,
      existingSegments,
      ep.id
    );
    if (path) {
      return simplifyPoints([p1, ...path, p2]);
    }
  }

  if (path) {
    return simplifyPoints([p1, ...path, p2]);
  }

  return fallbackManhattanPoints(ep.x1, ep.y1, ep.side1, ep.x2, ep.y2, ep.side2, stubOffset);
}

function buildHananGrid(obstacles: ComponentObstacle[], pad: number) {
  const xsRaw: number[] = [];
  const ysRaw: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of obstacles) {
    const l = c.x - pad;
    const r = c.x + c.width + pad;
    const t = c.y - pad;
    const b = c.y + c.height + pad;
    xsRaw.push(l, l - 10, r, r + 10);
    ysRaw.push(t, t - 10, b, b + 10);
    if (l < minX) minX = l;
    if (r > maxX) maxX = r;
    if (t < minY) minY = t;
    if (b > maxY) maxY = b;
  }

  if (obstacles.length > 0) {
    xsRaw.push(minX - 36, maxX + 36);
    ysRaw.push(minY - 36, maxY + 36);
  }

  return {
    xs: dedupeSorted(xsRaw, 4),
    ys: dedupeSorted(ysRaw, 4),
  };
}

export function buildPreviewOrthogonalPath(
  x1: number,
  y1: number,
  side1: PortDefinition['side'],
  x2: number,
  y2: number,
  side2: PortDefinition['side'],
  obstacles: ComponentObstacle[] = []
): string {
  const boxesStrict: Box[] = obstacles.map((c) => ({
    id: c.id,
    left: c.x - 12,
    top: c.y - 12,
    right: c.x + c.width + 12,
    bottom: c.y + c.height + 12,
  }));
  const boxesRelaxed: Box[] = obstacles.map((c) => ({
    id: c.id,
    left: c.x - 3,
    top: c.y - 3,
    right: c.x + c.width + 3,
    bottom: c.y + c.height + 3,
  }));
  const { xs, ys } = buildHananGrid(obstacles, 16);
  const ep: RouteEndpoint = {
    id: '__preview__',
    domain: 'electrical',
    fromCompId: '__p1__',
    toCompId: '__p2__',
    x1,
    y1,
    side1,
    x2,
    y2,
    side2,
  };
  const pts = computeAvoidantManhattanPoints(
    ep,
    obstacles,
    xs,
    ys,
    boxesStrict,
    boxesRelaxed,
    [],
    0
  );
  if (pts.length === 0) return '';
  return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * Stellt beim Ablegen/Verschieben eines Bauteils sicher, dass immer genügend Abstand (Standard 36 px)
 * zu allen anderen Bauteilen bleibt, damit Leitungen sauber außen herum verlaufen können.
 */
export function resolveComponentPlacement(
  movedId: string,
  desiredX: number,
  desiredY: number,
  width: number,
  height: number,
  allComponents: ComponentObstacle[],
  minGap = 36
): { x: number; y: number } {
  let x = Math.round(desiredX / 4) * 4;
  let y = Math.round(desiredY / 4) * 4;

  const others = allComponents.filter((c) => c.id !== movedId);
  if (others.length === 0) return { x, y };

  for (let pass = 0; pass < 10; pass++) {
    let pushed = false;
    for (const other of others) {
      const leftA = x;
      const rightA = x + width;
      const topA = y;
      const bottomA = y + height;

      const leftB = other.x - minGap;
      const rightB = other.x + other.width + minGap;
      const topB = other.y - minGap;
      const bottomB = other.y + other.height + minGap;

      if (rightA > leftB && leftA < rightB && bottomA > topB && topA < bottomB) {
        const pushLeft = leftB - rightA; // negativ
        const pushRight = rightB - leftA; // positiv
        const pushUp = topB - bottomA; // negativ
        const pushDown = bottomB - topA; // positiv

        const candidates = [
          { dx: pushLeft, dy: 0, dist: Math.abs(pushLeft) },
          { dx: pushRight, dy: 0, dist: Math.abs(pushRight) },
          { dx: 0, dy: pushUp, dist: Math.abs(pushUp) },
          { dx: 0, dy: pushDown, dist: Math.abs(pushDown) },
        ];
        candidates.sort((a, b) => a.dist - b.dist);

        const best = candidates[0];
        x = Math.round((x + best.dx) / 4) * 4;
        y = Math.round((y + best.dy) / 4) * 4;
        pushed = true;
      }
    }
    if (!pushed) break;
  }

  return { x, y };
}

/**
 * Berechnet alle hindernis-freien 90°-Pfade inklusive Option-C-Kreuzungen:
 * - Leitungen laufen garantiert außen um alle Bauteile herum (keine Führung unter Bauteilen hindurch)
 * - Elektrik & Analog: Halbkreis-Brückensprung über kreuzende Leitungen/Rohre
 * - Fluidrohre: Saubere Unterbrechungslücke unter der obenliegenden Leitung
 */
export function routeAllOrthogonalWires(
  endpoints: RouteEndpoint[],
  obstacles: ComponentObstacle[] = []
): Map<string, RoutedWire> {
  const result = new Map<string, RoutedWire>();
  if (endpoints.length === 0) return result;

  const boxesStrict: Box[] = obstacles.map((c) => ({
    id: c.id,
    left: c.x - 12,
    top: c.y - 12,
    right: c.x + c.width + 12,
    bottom: c.y + c.height + 12,
  }));
  const boxesRelaxed: Box[] = obstacles.map((c) => ({
    id: c.id,
    left: c.x - 3,
    top: c.y - 3,
    right: c.x + c.width + 3,
    bottom: c.y + c.height + 3,
  }));
  const { xs: baseXs, ys: baseYs } = buildHananGrid(obstacles, 16);

  // Gestaffelter Austritts-Versatz je Anschluss-Seite derselben Quelle für parallele Bahnen
  const byFromSide = new Map<string, number>();
  const wireStubOffsets = new Map<string, number>();
  for (const ep of endpoints) {
    const key = `${ep.fromCompId}:${ep.side1}`;
    const count = byFromSide.get(key) ?? 0;
    byFromSide.set(key, count + 1);
    wireStubOffsets.set(ep.id, (count % 4) * 6);
  }

  const wirePoints = new Map<string, Point2D[]>();
  const allSegments: OrthoSegment[] = [];

  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    const pts = computeAvoidantManhattanPoints(
      ep,
      obstacles,
      baseXs,
      baseYs,
      boxesStrict,
      boxesRelaxed,
      allSegments,
      wireStubOffsets.get(ep.id) ?? 0
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
        const crossPositions: number[] = [];

        for (const other of allSegments) {
          if (other.connId === ep.id) continue;
          if (other.orientation === (isH ? 'H' : 'V')) continue;

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
