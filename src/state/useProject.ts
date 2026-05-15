import { useContext, type Dispatch } from 'react';
import { ProjectContext } from './ProjectContext';
import type { ProjectAction } from './projectReducer';
import type { ProjectState } from '../types';

export function useProject(): ProjectState {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider');
  return ctx.state;
}

export function useProjectDispatch(): Dispatch<ProjectAction> {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjectDispatch must be used inside ProjectProvider');
  }
  return ctx.dispatch;
}
