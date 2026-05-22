import type { PointCategory, ProjectState } from '../types';

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
  // Migrate removed categories on load:
  //   'sss'          → 'start'  (C26: SSS merged into Start)
  //   'flying_finish'→ 'finish' (C26 ext: flying finish merged into Finish)
  function migrateCategory(c: string | undefined): PointCategory | undefined {
    if (c === 'sss') return 'start';
    if (c === 'flying_finish') return 'finish';
    return c as PointCategory | undefined;
  }
  return {
    ...state,
    points: state.points.map((p) => ({
      ...p,
      category: migrateCategory(p.category as string) ?? 'other',
      categoryOverride: migrateCategory(p.categoryOverride as string | undefined),
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
