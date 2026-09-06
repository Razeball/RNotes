import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Popup from './Popup';
import '../styles/TitleBar.css';

export interface Tab {
  id: string;
  name: string;
  isModified: boolean;
}

interface TitleBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const DRAG_THRESHOLD_PX = 5;
const POP_MS = 420;
const SPIN_MS = 450;

function CloseGlyph() {
  return (
    <svg className="tb-x" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="4" y1="20" x2="20" y2="4" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </svg>
  );
}

export default function TitleBar({ tabs, activeTabId, onTabClick, onTabClose, onNewTab, onReorder }: TitleBarProps) {
  const { t } = useTranslation();
  const tabIdMap = useRef<Set<string>>(new Set(tabs.map((tab) => tab.id)));
  const [currentPopState, setCurrentPopState] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ index: number; offset: number; width: number } | null>(null);
  const dragStartRef = useRef<{ x: number; index: number; width: number } | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const addedTab = tabs.find((tab) => !tabIdMap.current.has(tab.id));
    tabIdMap.current = new Set(tabs.map((tab) => tab.id));
    if (!addedTab) return;
    setCurrentPopState(addedTab.id);
    const timer = window.setTimeout(() => { setCurrentPopState(null); }, POP_MS);
    return () => window.clearTimeout(timer);
  }, [tabs]);

  useEffect(() => {
    let appWindowHandle;
    try {
      appWindowHandle = getCurrentWindow();
    } catch (error) {
      return;
    }
    void appWindowHandle.isMaximized().then((result) => setIsWindowMaximized(result)).catch(() => {});
    const unlisten = appWindowHandle.onResized(() => {
      void appWindowHandle.isMaximized().then((result) => setIsWindowMaximized(result)).catch(() => {});
    });
    return () => { void unlisten.then((off) => off()).catch(() => {}); };
  }, []);

  const handlePointerDown = (event: React.PointerEvent, index: number) => {
    if (event.button !== 0) return;
    const element = event.currentTarget as HTMLElement;
    dragStartRef.current = { x: event.clientX, index, width: element.offsetWidth };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const offset = event.clientX - start.x;
    if (!activeDrag && Math.abs(offset) < DRAG_THRESHOLD_PX) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setActiveDrag({ index: start.index, offset, width: start.width });
  };

  const calculateTargetIndex = () => {
    if (!activeDrag) return -1;
    const slots = Math.round(activeDrag.offset / activeDrag.width);
    return Math.max(0, Math.min(tabs.length - 1, activeDrag.index + slots));
  };

  const endDrag = () => {
    if (activeDrag) {
      const targetIndexValue = calculateTargetIndex();
      if (targetIndexValue !== activeDrag.index) onReorder(activeDrag.index, targetIndexValue);
    }
    dragStartRef.current = null;
    setActiveDrag(null);
  };

  const shiftForDrag = (index: number): number => {
    if (!activeDrag || index === activeDrag.index) return 0;
    const targetIndexValue = calculateTargetIndex();
    if (activeDrag.index < index && index <= targetIndexValue) return -activeDrag.width;
    if (targetIndexValue <= index && index < activeDrag.index) return activeDrag.width;
    return 0;
  };

  const handleNewTab = () => {
    setIsSpinning(true);
    window.setTimeout(() => { setIsSpinning(false); }, SPIN_MS);
    onNewTab();
  };

  const getAppWindow = () => {
    try {
      return getCurrentWindow();
    } catch (error) {
      return null;
    }
  };

  return (
    <div className="tb-bar">
      <div className="tb-tabs" ref={tabsContainerRef} onPointerMove={handlePointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.id;
          const isDragged = activeDrag?.index === index;
          const shift = isDragged ? activeDrag.offset : shiftForDrag(index);

          return (
            <Popup key={tab.id} content={tab.name} position="bottom" delay={450}>
              <div
                className={[
                  'tb-tab',
                  isActive ? 'is-active' : '',
                  tab.isModified ? 'is-unsaved' : '',
                  currentPopState === tab.id ? 'is-popping' : '',
                  isDragged ? 'is-dragging' : '',
                ].join(' ')}
                style={{ transform: shift ? `translateX(${shift}px)` : undefined }}
                onPointerDown={(e) => handlePointerDown(e, index)}
                onClick={() => { if (!activeDrag) onTabClick(tab.id); }}
              >
                <span className="tb-tab-name">{tab.name}</span>
                <button
                  className="tb-tab-close"
                  aria-label={t("Close tab")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                >
                  <CloseGlyph />
                </button>
              </div>
            </Popup>
          );
        })}

        <Popup content={t("New tab")} position="bottom" delay={450}>
          <button className={`tb-new ${isSpinning ? 'is-spinning' : ''}`} onClick={handleNewTab} aria-label={t("New tab")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
          </button>
        </Popup>
      </div>

      <div className="tb-drag" data-tauri-drag-region onDoubleClick={() => void getAppWindow()?.toggleMaximize()} />

      <div className="tb-window-buttons">
        <Popup content={t("Minimize")} position="bottom" delay={450}>
          <button className="tb-win" onClick={() => void getAppWindow()?.minimize()} aria-label={t("Minimize")}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
          </button>
        </Popup>

        <Popup content={isWindowMaximized ? t("Restore") : t("Maximize")} position="bottom" delay={450}>
          <button className="tb-win" onClick={() => void getAppWindow()?.toggleMaximize()} aria-label={isWindowMaximized ? t("Restore") : t("Maximize")}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.5" y="1.5" width="9" height="9" fill="none" />
            </svg>
          </button>
        </Popup>

        <Popup content={t("Close")} position="bottom" delay={450}>
          <button className="tb-win tb-win-close" onClick={() => void getAppWindow()?.close()} aria-label={t("Close")}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <line x1="2" y1="10" x2="10" y2="2" />
              <line x1="2" y1="2" x2="10" y2="10" />
            </svg>
          </button>
        </Popup>
      </div>
    </div>
  );
}