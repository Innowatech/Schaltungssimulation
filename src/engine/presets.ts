import { SavedSimulationEntry, SerializedCircuit } from './types';

export const EMPTY_CIRCUIT: SerializedCircuit = {
  version: 3,
  name: 'Leere Arbeitsfläche',
  components: [],
  connections: [],
};

const STORAGE_KEY = 'mechatronik_saved_simulations_v1';

export function loadSavedSimulations(): SavedSimulationEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedSimulationEntry =>
        Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && item.circuit)
    );
  } catch {
    return [];
  }
}

export function persistSavedSimulations(entries: SavedSimulationEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignoriere Speicherfehler (z. B. Private Mode / Quota)
  }
}
