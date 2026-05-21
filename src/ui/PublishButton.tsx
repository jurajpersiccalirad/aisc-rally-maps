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

  const isAdmin = user.role === 'ADMIN';

  const disabled =
    state.sourceFiles.length === 0 || state.stages.length === 0 || busy;

  const handleClick = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { blob, filename } = await buildExportZip(state, geometry, {
        stageStartingId: 1, eventId: 0,
        eventStartDt: '', eventEndDt: '', unitSystem: 'metric',
        deviceStartingId: 1, selectedDevices: [],
        credStartingId: 1, credEventId: null, appUrl: '', credRows: [],
      });
      const projectJson = serializeProject(state);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const slug = filename.replace(/\.zip$/, '');
      // ADMIN has write on published/* but not on users/*; USER uploads to their own identity folder.
      const zipKey = isAdmin
        ? `published/${user.userId}/${stamp}-${slug}.zip`
        : `users/${user.identityId}/${stamp}-${slug}.zip`;
      const projectKey = isAdmin
        ? `published/${user.userId}/${stamp}-${projectJsonFilename(state.eventName)}`
        : `users/${user.identityId}/${stamp}-${projectJsonFilename(state.eventName)}`;

      await uploadData({ path: zipKey, data: blob }).result;
      await uploadData({ path: projectKey, data: projectJson }).result;

      const client = getClient();
      const stageCount = state.stages.length;
      const trackCount = state.tracks.length;
      const now = new Date().toISOString();

      if (isAdmin) {
        await client.models.Event.create({
          ownerId: user.userId,
          ownerEmail: user.email,
          eventName: state.eventName || slug,
          version: state.version || undefined,
          status: 'PUBLISHED',
          exportZipKey: zipKey,
          projectJsonKey: projectKey,
          stageCount,
          trackCount,
          submittedAt: now,
          publishedAt: now,
          reviewedBy: user.email,
        });
        setMessage('Published.');
      } else {
        await client.models.Event.create({
          ownerId: user.userId,
          ownerEmail: user.email,
          eventName: state.eventName || slug,
          version: state.version || undefined,
          status: 'SUBMITTED',
          exportZipKey: zipKey,
          projectJsonKey: projectKey,
          stageCount,
          trackCount,
          submittedAt: now,
        });
        setMessage('Submitted for review. An admin will be notified.');
      }
    } catch (e) {
      setMessage(
        `${isAdmin ? 'Publish' : 'Submit'} failed: ${e instanceof Error ? e.message : String(e)}`,
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
        className={[
          'text-xs px-3 py-1.5 rounded text-white disabled:bg-slate-300 disabled:cursor-not-allowed',
          isAdmin
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-emerald-600 hover:bg-emerald-700',
        ].join(' ')}
        title={
          state.stages.length === 0
            ? 'Add at least one stage first'
            : isAdmin
              ? 'Publish this event directly to the database'
              : 'Submit this event to admin for publishing'
        }
      >
        {busy
          ? isAdmin ? 'Publishing…' : 'Submitting…'
          : isAdmin ? 'Publish event' : 'Send for publishing'}
      </button>
      {message && (
        <span className="text-[11px] text-slate-600 max-w-[240px] truncate">
          {message}
        </span>
      )}
    </div>
  );
}
