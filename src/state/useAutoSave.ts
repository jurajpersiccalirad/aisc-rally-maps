import { useEffect, useRef } from 'react';
import type { ProjectState } from '../types';

const KEY = 'aisc_autosave';
const DEBOUNCE_MS = 3000;

export interface AutoSaveSnapshot {
  state: ProjectState;
  savedAt: string;
}

export function loadAutoSave(): AutoSaveSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as AutoSaveSnapshot;
    if (!snap.state?.sourceFiles?.length) return null;
    return snap;
  } catch {
    return null;
  }
}

export function clearAutoSave(): void {
  localStorage.removeItem(KEY);
}

export function useAutoSave(state: ProjectState): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.sourceFiles.length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const snap: AutoSaveSnapshot = { state, savedAt: new Date().toISOString() };
        localStorage.setItem(KEY, JSON.stringify(snap));
      } catch {
        // storage quota exceeded — silently ignore
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);
}
