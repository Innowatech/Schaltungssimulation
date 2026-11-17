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
      const rawConns: Array<{ fromComp: string; fromPort: string; toTarget: string }> = [];

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

      // Verbindungen parsen
      for (const item of parsed.components) {
        const extId = String(item.id || '');
        const srcMeta = compMap.get(extId);
        if (!srcMeta || !item.connections || typeof item.connections !== 'object') continue;

        for (const [portKey, targetRef] of Object.entries(item.connections)) {
          if (!targetRef || typeof targetRef !== 'string') continue;

          // Mappe Port-Key auf App-Port-ID
          let srcPortId = portKey.toLowerCase();
          if (srcMeta.type === 'timer_relay') {
            if (srcPortId === 'a1') srcPortId = 'a1';
            else if (srcPortId === 'b1') srcPortId = 'b1';
            else if (srcPortId === '15') srcPortId = 'com_15';
            else if (srcPortId === '16') srcPortId = 'nc_16';
            else if (srcPortId === '18') srcPortId = 'no_18';
          } else if (srcMeta.type === 'power_24v') {
            srcPortId = 'out_24v';
          } else if (srcMeta.type === 'valve_32' || srcMeta.type === 'valve_22') {
            srcPortId = 'v24_in';
          }

          // Ziel parsen (z.B. "power_supply.L" oder "K3.B1" oder "valve_3_2.coil")
          const parts = targetRef.split('.');
          const targetExtId = parts[0];
          const targetPortKey = (parts[1] || '').toLowerCase();

          const targetMeta = compMap.get(targetExtId);
          if (!targetMeta) continue;

          let dstPortId = targetPortKey;
          if (targetMeta.type === 'power_24v') {
            dstPortId = 'out_24v';
          } else if (targetMeta.type === 'timer_relay') {
            if (dstPortId === 'a1' || targetPortKey === 'l') dstPortId = 'a1';
            else if (dstPortId === 'b1') dstPortId = 'b1';
            else if (dstPortId === '15' || targetPortKey === 'l') dstPortId = 'com_15';
            else if (dstPortId === '16') dstPortId = 'nc_16';
            else if (dstPortId === '18' || targetPortKey === 'coil' || targetPortKey === 'l') dstPortId = 'no_18';
          } else if (targetMeta.type === 'valve_32' || targetMeta.type === 'valve_22') {
            dstPortId = 'v24_in';
          }

          rawConns.push({
            fromComp: srcMeta.internalId,
            fromPort: srcPortId,
            toTarget: `${targetMeta.internalId}:${dstPortId}`,
          });
        }
      }

      // Duplikate entfernen
      const serializedConns: SerializedCircuit['connections'] = [];
      const seen = new Set<string>();

      for (const rc of rawConns) {
        const [toComp, toPort] = rc.toTarget.split(':');
        const key1 = `${rc.fromComp}:${rc.fromPort}-${toComp}:${toPort}`;
        const key2 = `${toComp}:${toPort}-${rc.fromComp}:${rc.fromPort}`;
        if (seen.has(key1) || seen.has(key2) || rc.fromComp === toComp) continue;
        seen.add(key1);

        serializedConns.push({
          id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          domain: 'electrical',
          fromComponentId: rc.fromComp,
          fromPortId: rc.fromPort,
          toComponentId: toComp,
          toPortId: toPort,
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
