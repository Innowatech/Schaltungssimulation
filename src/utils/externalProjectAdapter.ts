import { SerializedCircuit, SerializedComponent } from '../engine/types';

export function parseExternalProjectJson(rawText: string): SerializedCircuit | null {
  try {
    const parsed = JSON.parse(rawText);
    // Prüfe, ob es das Standard-Format der App ist
    if (
      parsed &&
      Array.isArray(parsed.components) &&
      Array.isArray(parsed.connections) &&
      (parsed.version !== undefined || parsed.name)
    ) {
      return parsed as SerializedCircuit;
    }

    // Prüfe, ob es das externe Projektformat ist (z.B. mit "project" und "components")
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.components)) {
      const compMap = new Map<string, { internalId: string; type: string; raw: any }>();
      const serializedComps: SerializedComponent[] = [];
      const rawConns: Array<{ compA: string; portA: string; compB: string; portB: string }> = [];

      let gridX = 80;
      let gridY = 80;
      let col = 0;

      for (const item of parsed.components) {
        const extId = String(item.id || `comp_${Math.random()}`);
        let internalAppType = 'power_24v';
        let defaultParams: Record<string, unknown> = {};
        let label = extId;

        const extType = String(item.type || '').toLowerCase();
        if (extType.includes('voltage') || extType.includes('power')) {
          internalAppType = 'power_24v';
          defaultParams = { enabled: true, voltage: 24 };
          label = `Netzteil ${extId}`;
        } else if (extType.includes('tele') || extType.includes('e1zm10')) {
          internalAppType = 'timer_relay';
          const mode = String(item.mode || 'E').toUpperCase();
          const teleFn =
            mode === 'IP' || mode === 'BP'
              ? 'Bp'
              : ['E', 'R', 'WS', 'WA', 'ES', 'WU', 'BP'].includes(mode)
              ? mode
              : 'E';
          defaultParams = {
            teleFunction: teleFn,
            teleRange: '10s',
            teleScalePct: 50,
          };
          label = `Zeitrelais ${extId}`;
        } else if (extType.includes('valve_3') || extType.includes('3_2')) {
          internalAppType = 'valve_32';
          label = item.description || `3/2-Ventil ${extId}`;
        } else if (extType.includes('valve_2') || extType.includes('2_2') || extType.includes('drain')) {
          internalAppType = 'valve_22';
          label = item.description || `2/2-Ventil ${extId}`;
        } else if (extType.includes('tank')) {
          internalAppType = 'tank';
          const lit = Number(item.capacity_liters || 160);
          defaultParams = {
            capacityLiters: lit,
            currentLiters: lit / 2,
            medium: 'anolyte',
          };
          label = `Tank ${extId}`;
        }

        const internalId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        compMap.set(extId, { internalId, type: internalAppType, raw: item });

        serializedComps.push({
          id: internalId,
          type: internalAppType,
          x: gridX + (col % 3) * 260,
          y: gridY + Math.floor(col / 3) * 220,
          label,
          params: defaultParams,
          fault: 'none',
        });

        col++;
      }

      // Helper to map port string to internal app port id
      const mapPort = (metaType: string, rawPort: string): string => {
        const p = rawPort.toLowerCase();
        if (metaType === 'power_24v') return 'out_24v';
        if (metaType === 'timer_relay') {
          if (p === 'a1' || p === 'l') return 'a1';
          if (p === 'b1') return 'b1';
          if (p === '15' || p === 'l') return 'com_15';
          if (p === '16') return 'nc_16';
          if (p === '18' || p === 'coil' || p === 'l') return 'no_18';
        }
        if (metaType === 'valve_32' || metaType === 'valve_22') return 'v24_in';
        return p;
      };

      // Helper to check if port is an output
      const isOutputPort = (metaType: string, portId: string): boolean => {
        if (metaType === 'power_24v') return true;
        if (metaType === 'timer_relay') return portId === 'nc_16' || portId === 'no_18';
        return false;
      };

      // Verbindungen parsen
      for (const item of parsed.components) {
        const extId = String(item.id || '');
        const srcMeta = compMap.get(extId);
        if (!srcMeta || !item.connections || typeof item.connections !== 'object') continue;

        for (const [portKey, targetRef] of Object.entries(item.connections)) {
          if (!targetRef || typeof targetRef !== 'string') continue;

          const parts = targetRef.split('.');
          const targetExtId = parts[0];
          const targetPortKey = parts[1] || '';
          const targetMeta = compMap.get(targetExtId);
          if (!targetMeta) continue;

          const portAId = mapPort(srcMeta.type, portKey);
          const portBId = mapPort(targetMeta.type, targetPortKey);

          // Bestimme, ob A Output und B Input ist, oder umgekehrt (Stromfluss von Output -> Input)
          let fromComp = srcMeta.internalId;
          let fromPort = portAId;
          let toComp = targetMeta.internalId;
          let toPort = portBId;

          const aIsOut = isOutputPort(srcMeta.type, portAId);
          const bIsOut = isOutputPort(targetMeta.type, portBId);

          if (bIsOut && !aIsOut) {
            // Target ist Output, Source ist Input -> Richtung umdrehen
            fromComp = targetMeta.internalId;
            fromPort = portBId;
            toComp = srcMeta.internalId;
            toPort = portAId;
          }

          rawConns.push({
            compA: fromComp,
            portA: fromPort,
            compB: toComp,
            portB: toPort,
          });
        }
      }

      // Duplikate entfernen
      const serializedConns: SerializedCircuit['connections'] = [];
      const seen = new Set<string>();

      for (const rc of rawConns) {
        if (rc.compA === rc.compB) continue;
        const key1 = `${rc.compA}:${rc.portA}-${rc.compB}:${rc.portB}`;
        const key2 = `${rc.compB}:${rc.portB}-${rc.compA}:${rc.portA}`;
        if (seen.has(key1) || seen.has(key2)) continue;
        seen.add(key1);

        serializedConns.push({
          id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          domain: 'electrical',
          fromComponentId: rc.compA,
          fromPortId: rc.portA,
          toComponentId: rc.compB,
          toPortId: rc.portB,
          fault: 'none',
        });
      }

      return {
        version: 3,
        name: parsed.project || 'Importiertes Projekt',
        components: serializedComps,
        connections: serializedConns,
      };
    }

    return null;
  } catch {
    return null;
  }
}
