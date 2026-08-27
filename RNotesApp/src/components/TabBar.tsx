import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import '../styles/TabBar.css';

export interface Tab {
  id: string;
  name: string;
  isModified: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onTabClick, onTabClose, onNewTab }) => {
  const { t } = useTranslation();
  const prevTabIdsRef = useRef<Set<string>>(new Set(tabs.map(t => t.id)));
  const [enteringTabId, setEnteringTabId] = useState<string | null>(null);

  useEffect(() => {
    const prevIds = prevTabIdsRef.current;
    const newTab = tabs.find(t => !prevIds.has(t.id));
    if (newTab) {
      setEnteringTabId(newTab.id);
      const timer = setTimeout(() => setEnteringTabId(null), 400);
      prevTabIdsRef.current = new Set(tabs.map(t => t.id));
      return () => clearTimeout(timer);
    }
    prevTabIdsRef.current = new Set(tabs.map(t => t.id));
  }, [tabs]);

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  return (
    <div className="tab-bar">
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''} ${enteringTabId === tab.id ? 'tab-entering' : ''}`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="tab-name">
              {tab.isModified && <span className="modified-indicator">●</span>}
              {tab.name}
            </span>
            <button
              className="tab-close"
              onClick={(e) => handleClose(e, tab.id)}
              title={t("Close tab")}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="new-tab-button" onClick={onNewTab} title={t("New tab")}>
        +
      </button>
    </div>
  );
};

export default TabBar;
