import { useProject, useProjectDispatch } from '../state/useProject';

export function EventNameInput() {
  const { eventName } = useProject();
  const dispatch = useProjectDispatch();
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">Event name</span>
      <input
        type="text"
        value={eventName}
        onChange={(e) =>
          dispatch({ type: 'SET_EVENT_NAME', name: e.target.value })
        }
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
        placeholder="rally-event"
      />
      <span className="text-[11px] text-slate-500">
        Used as the ZIP root folder and combined-WKT filename.
      </span>
    </label>
  );
}
