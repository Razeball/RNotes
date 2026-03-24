import { useEffect, useState, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import Modal from './Modal';
import '../styles/UpdateChecker.css';

type UpdateState = 'checking' | 'available' | 'downloading' | 'idle' | 'error' | 'post-update';

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>('checking');
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [updatedVersion, setUpdatedVersion] = useState('');
  const totalRef = useRef(0);

  useEffect(() => {
    const pending = localStorage.getItem('rnotes_pending_changelog');
    if (pending) {
      try {
        const data = JSON.parse(pending);
        setUpdatedVersion(data.version || '');
        setReleaseNotes(data.body || '');
        setState('post-update');
        localStorage.removeItem('rnotes_pending_changelog');
        return;
      } catch { }
    }

    checkForUpdate();
  }, []);

  async function checkForUpdate() {
    try {
      setState('checking');
      const result = await check();
      if (result) {
        setUpdate(result);
        setReleaseNotes(result.body ?? '');
        setState('available');
      } else {
        setState('idle');
      }
    } catch (e) {
      console.error('Update check failed:', e);
      setState('idle');
    }
  }

  async function startDownload() {
    if (!update) return;
    try {
      setState('downloading');
      let downloaded = 0;
      localStorage.setItem('rnotes_pending_changelog', JSON.stringify({
        version: update.version,
        body: update.body ?? '',
      }));

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalRef.current = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalRef.current > 0) {
              setProgress(Math.round((downloaded / totalRef.current) * 100));
            }
            break;
          case 'Finished':
            setProgress(100);
            break;
        }
      });

      await relaunch();
    } catch (e) {
      console.error('Update failed:', e);
      localStorage.removeItem('rnotes_pending_changelog');
      setErrorMsg(String(e));
      setState('error');
    }
  }

  function dismiss() {
    setState('idle');
    setUpdate(null);
  }

  if (state === 'idle' || state === 'checking') return null;

  return (
    <Modal
      isOpen={true}
      onClose={state === 'downloading' ? () => {} : dismiss}
      title={
        state === 'post-update'
          ? `Updated to v${updatedVersion}`
          : 'Update Available'
      }
    >
      <div className="update-checker">
        {state === 'post-update' && (
          <>
            {releaseNotes && (
              <div className="update-release-notes">
                <p className="update-release-notes-title">What's New:</p>
                <pre className="update-release-notes-body">{releaseNotes}</pre>
              </div>
            )}
            {!releaseNotes && (
              <p className="update-message">The app updated successfully.</p>
            )}
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={dismiss}>
                Accept
              </button>
            </div>
          </>
        )}

        {state === 'available' && update && (
          <>
            <p className="update-message">
              New version <strong>v{update.version}</strong> is available.
              Would you like to update now?
            </p>
            {releaseNotes && (
              <div className="update-release-notes">
                <p className="update-release-notes-title">What's New:</p>
                <pre className="update-release-notes-body">{releaseNotes}</pre>
              </div>
            )}
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={startDownload}>
                Update
              </button>
              <button className="update-btn update-btn-secondary" onClick={dismiss}>
                Later
              </button>
            </div>
          </>
        )}

        {state === 'downloading' && (
          <>
            <p className="update-message">Updating...</p>
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="update-progress-text">{progress}%</p>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="update-message update-error">
              Error: {errorMsg}
            </p>
            <div className="update-actions">
              <button className="update-btn update-btn-secondary" onClick={dismiss}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
