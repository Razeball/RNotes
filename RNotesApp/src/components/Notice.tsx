import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Modal from './Modal';

/**App-wide alert replacement using a root-level modal to avoid stacking and webview freezes. */ 

type AlertFn = (msg: string, hdr?: string) => void;

const AlertCtx = createContext<AlertFn>(() => {});

export function useAlert(): AlertFn {
  return useContext(AlertCtx);
}

interface AlertItem {
  hdr: string;
  msg: string;
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertItem | null>(null);

  const alertFn = useCallback<AlertFn>((msg, hdr = 'RNotes') => {
    const txt = String(msg ?? '').trim();
    if (!txt) return;
    setAlert({ hdr, msg: txt });
  }, []);

  const close = useCallback(() => setAlert(null), []);

  const ctxVal = useMemo(() => alertFn, [alertFn]);

  return (
    <AlertCtx.Provider value={ctxVal}>
      {children}
      <Modal isOpen={alert !== null} onClose={close} title={alert?.hdr ?? ''}>
        <p className="notice-message">{alert?.msg}</p>
        <div className="notice-actions">
          <button className="notice-button" onClick={close} autoFocus>
            OK
          </button>
        </div>
      </Modal>
    </AlertCtx.Provider>
  );
}
