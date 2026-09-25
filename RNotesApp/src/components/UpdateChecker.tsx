import { Trans, useTranslation } from 'react-i18next';
import { useEffect, useState, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import Modal from './Modal';
import { ReleaseContentDialog } from './ReleaseNotes';
import { bundledReleaseNotes, fetchReleaseNotes, storeReleaseNotes } from '../services/updateNotes';
import '../styles/UpdateChecker.css';

type UpdateState = 'checking' | 'available' | 'downloading' | 'idle' | 'error' | 'post-update';

/** What Rust answers at startup: the notes if it has them, and whether it should go and look. */
interface ChangelogStartup {
  body: string | null;
  needs_fetch: boolean;
}

export default function UpdateChecker() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState>('checking');
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [updatedVersion, setUpdatedVersion] = useState('');
  const totalRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, []);

  async function start() {
    const current = await getVersion().catch(() => '');

    if (current) {
      const startup = await invoke<ChangelogStartup>('changelog_startup', {
        version: current,
      }).catch(() => null);

      if (startup?.body) {
        showNotes(current, startup.body);
        return;
      }

      if (startup?.needs_fetch) {
        const found = bundledReleaseNotes() ?? (await fetchReleaseNotes(current));
        if (found) {
          await storeReleaseNotes(current, found, true);
          showNotes(current, found);
          return;
        }
      }
    }

    await checkForUpdate();
  }

  function showNotes(version: string, body: string) {
    setUpdatedVersion(version);
    setReleaseNotes(body);
    setState('post-update');
  }

  async function checkForUpdate() {
    try {
      setState('checking');
      const result = await check();
      if (result) {
        setUpdate(result);
        setReleaseNotes(result.body ?? '');
        setState('available');
        void storeReleaseNotes(result.version, result.body ?? '', false);
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
      await storeReleaseNotes(update.version, update.body ?? '', false);

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
      setErrorMsg(String(e));
      setState('error');
    }
  }

  function dismiss() {
    setState('idle');
    setUpdate(null);
  }

  if (state === 'idle' || state === 'checking') return null;

  if (state === 'post-update') {
    return (
      <ReleaseContentDialog
        isOpen={true}
        onClose={dismiss}
        release_body={releaseNotes}
        version={updatedVersion}
      />
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={state === 'downloading' ? () => {} : dismiss}
      title={t('Update Available')}
    >
      <div className="update-checker">
        {state === 'available' && update && (
          <>
            <p className="update-message">
              <Trans
                i18nKey="New version <0>v{{version}}</0> is available. Would you like to update now?"
                values={{ version: update.version }}
                components={[<strong key="version" />]}
              />
            </p>
            {releaseNotes && (
              <div className="update-release-notes">
                <p className="update-release-notes-title">{t("What's New:")}</p>
                <pre className="update-release-notes-body">{releaseNotes}</pre>
              </div>
            )}
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={startDownload}>
                {t('Update')}</button>
              <button className="update-btn update-btn-secondary" onClick={dismiss}>
                {t('Later')}</button>
            </div>
          </>
        )}

        {state === 'downloading' && (
          <>
            <p className="update-message">{t('Updating...')}</p>
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
              {t('Error: {{message}}', { message: errorMsg })}
            </p>
            <div className="update-actions">
              <button className="update-btn update-btn-secondary" onClick={dismiss}>
                {t('Close')}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
