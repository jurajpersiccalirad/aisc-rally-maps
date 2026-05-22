import type { ProjectState } from '../types';

export interface SerializedProject {
  version: 1;
  state: ProjectState;
}

const CURRENT_VERSION = 1;

export function serializeProject(state: ProjectState): string {
  const payload: SerializedProject = { version: CURRENT_VERSION, state };
  return JSON.stringify(payload, null, 2);
}

export function deserializeProject(text: string): ProjectState {
  const parsed = JSON.parse(text) as Partial<SerializedProject>;
  if (parsed.version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported project file version: ${String(parsed.version)} (expected ${CURRENT_VERSION})`,
    );
  }
  if (!parsed.state) {
    throw new Error('Project file is missing the `state` field.');
  }
  const state = parsed.state;
  // Migrate removed 'sss' category → 'start' (C26)
  return {
    ...state,
    points: state.points.map((p) => ({
      ...p,
      category: (p.category as string) === 'sss' ? 'start' : p.category,
      categoryOverride:
        (p.categoryOverride as string) === 'sss' ? 'start' : p.categoryOverride,
    })),
  };
}

export function projectJsonFilename(eventName: string): string {
  const slug =
    eventName
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9\-_.]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  return `${slug}.aiscproj.json`;
}
