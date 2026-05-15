import { uploadData } from 'aws-amplify/storage';
import { useState } from 'react';
import { buildExportZip } from '../export/buildZip';
import {
  projectJsonFilename,
  serializeProject,
} from '../export/projectJson';
import { isBackendConfigured } from '../lib/amplify-config';
import { getClient } from '../lib/amplify-client';
import { useAuth } from '../state/authStore';
import { useProject } from '../state/useProject';
import { useStageGeometry } from '../state/useStageGeometry';

export function PublishButton() {
  const state = useProject();
  const geometry = useStageGeometry();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isBackendConfigured) return null;
  if (!user) return null;
  // Only USERs see the publish button. ADMINs work via the admin queue.
  if (user.role !== 'USER') return null;

  const disabled =
    state.sourceFiles.length === 0 || state.stages.length === 0 || busy;

  const handleClick = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { blob, filename } = await buildExportZip(state, geometry);
      const projectJson = serializeProject(state);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const slug = filename.replace(/\.zip$/, '');
      const zipKey = `users/${user.userId}/${stamp}-${slug}.zip`;
      const projectKey = `users/${user.userId}/${stamp}-${projectJsonFilename(state.eventName)}`;

      await uploadData({ path: zipKey, data: blob }).result;
      await uploadData({ path: projectKey, data: projectJson }).result;

      const client = getClient();
      const stageCount = state.stages.length;
      const trackCount = state.tracks.length;
      const submittedAt = new Date().toISOString();

      await client.models.Event.create({
        ownerId: user.userId,
        ownerEmail: user.email,
        eventName: state.eventName || slug,
        status: 'SUBMITTED',
        exportZipKey: zipKey,
        projectJsonKey: projectKey,
        stageCount,
        trackCount,
        submittedAt,
      });

      setMessage('Submitted for review. An admin will be notified.');
    } catch (e) {
      setMessage(
        `Submit failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled}
        className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        title={
          state.stages.length === 0
            ? 'Add at least one stage first'
            : 'Submit this event to admin for publishing'
        }
      >
        {busy ? 'Submitting…' : 'Send for publishing'}
      </button>
      {message && (
        <span className="text-[11px] text-slate-600 max-w-[240px] truncate">
          {message}
        </span>
      )}
    </div>
  );
}
