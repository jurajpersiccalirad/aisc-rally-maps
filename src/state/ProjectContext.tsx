import { createContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { ProjectState } from '../types';
import {
  initialProjectState,
  projectReducer,
  type ProjectAction,
} from './projectReducer';

export interface ProjectContextValue {
  state: ProjectState;
  dispatch: Dispatch<ProjectAction>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ProjectContext = createContext<ProjectContextValue | undefined>(
  undefined,
);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, initialProjectState);
  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}
