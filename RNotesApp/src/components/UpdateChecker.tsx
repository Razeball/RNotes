import { useEffect, useState } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import Modal from './Modal';
import '../styles/UpdateChecker.css';

type UpdateState = 'checking' | 'available' | 'downloading' | 'idle' | 'error';

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>('checking');
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    checkForUpdate();
  }, []);

  async function checkForUpdate() {
    try {
      setState('checking');
      const result = await check();
      if (result) {
        setUpdate(result);
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

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setTotalSize(event.data.contentLength ?? 0);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalSize > 0) {
              setProgress(Math.round((downloaded / totalSize) * 100));
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

  if (state === 'idle') return null;
  if (state === 'checking') return null;

  return (
    <Modal
      isOpen={state === 'available' || state === 'downloading' || state === 'error'}
      onClose={state === 'downloading' ? () => {} : dismiss}
      title="Actualización disponible"
    >
      <div className="update-checker">
        {state === 'available' && update && (
          <>
            <p className="update-message">
              Una nueva versión <strong>v{update.version}</strong> está disponible. 
              ¿Deseas actualizar ahora?
            </p>
            <div className="update-actions">
              <button className="update-btn update-btn-primary" onClick={startDownload}>
                Actualizar
              </button>
              <button className="update-btn update-btn-secondary" onClick={dismiss}>
                Más tarde
              </button>
            </div>
          </>
        )}

        {state === 'downloading' && (
          <>
            <p className="update-message">Descargando actualización...</p>
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
              Error al actualizar: {errorMsg}
            </p>
            <div className="update-actions">
              <button className="update-btn update-btn-secondary" onClick={dismiss}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
