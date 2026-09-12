import { Trans, useTranslation } from 'react-i18next';
import { useEffect, useState, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import Modal from './Modal';
import WaveText from './WaveText';
import { parseReleaseNotes, type ChangeKind, type Changelog } from '../services/changelog';
import '../styles/UpdateChecker.css';

type UpdateState = 'checking' | 'available' | 'downloading' | 'idle' | 'error' | 'post-update';

interface PendingChangelog {
  version: string;
  body: string;
}
const LETTER_STAGGER = 26;
const LINE_STAGGER = 180;

export default function UpdateChecker() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState>('checking');
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [updatedVersion, setUpdatedVersion] = useState('');
  const totalRef = useRef(0);

  useEffect(() => {
    void start();
  }, []);

  async function start() {
    const current = await getVersion().catch(() => '');

    if (current) {
      const pending = await invoke<PendingChangelog | null>('take_changelog_for', {
        version: current,
      }).catch(() => null);

      if (pending) {
        setUpdatedVersion(pending.version);
        setReleaseNotes(pending.body ?? '');
        setState('post-update');
        return;
      }
    }

    await checkForUpdate();
  }

  async function checkForUpdate() {
    try {
      setState('checking');
      const result = await check();
      if (result) {
        setUpdate(result);
        setReleaseNotes(result.body ?? '');
        setState('available');
        void invoke('store_pending_changelog', {
          version: result.version,
          body: result.body ?? '',
        }).catch(() => {});
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
      await invoke('store_pending_changelog', {
        version: update.version,
        body: update.body ?? '',
      }).catch(() => {});

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

  const isPostUpdate = state === 'post-update';
  const changelog = isPostUpdate ? parseReleaseNotes(releaseNotes, updatedVersion) : null;

  return (
    <Modal
      isOpen={true}
      onClose={state === 'downloading' ? () => {} : dismiss}
      className={isPostUpdate ? 'update-modal update-modal-glow' : ''}
      title={
        isPostUpdate && changelog ? (
          <WaveText
            className="update-version-title"
            text={`v${changelog.version}`}
            stagger={LETTER_STAGGER}
          />
        ) : (
          t('Update Available')
        )
      }
    >
      <div className="update-checker">
        {isPostUpdate && changelog && (
          <>
            <ReleaseNotes changelog={changelog} />
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={dismiss}>
                {t('Accept')}</button>
            </div>
          </>
        )}

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

function ReleaseNotes({ changelog }: { changelog: Changelog }) {
  const { t } = useTranslation();

  if (!changelog.sections.length) {
    return changelog.plain.length ? (
      <ul className="update-plain">
        {changelog.plain.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    ) : (
      <p className="update-message">{t('The app updated successfully.')}</p>
    );
  }

  return (
    <>
      {changelog.sections.map((section, index) => (
        <div key={index} className={`update-section update-section-${section.kind}`}>
          <p className="update-section-title">
            <WaveText
              text={sectionLabel(section.kind, t)}
              stagger={LETTER_STAGGER}
              delay={(index + 1) * LINE_STAGGER}
            />
          </p>
          <ul className="update-section-items">
            {section.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function sectionLabel(kind: ChangeKind, t: (key: string) => string): string {
  switch (kind) {
    case 'added':
      return t('Added');
    case 'fixed':
      return t('Fixed');
    case 'changed':
      return t('Changed');
    case 'deleted':
      return t('Deleted');
  }
}
