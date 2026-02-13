import React from 'react';
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
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="tab-name">
              {tab.isModified && <span className="modified-indicator">●</span>}
              {tab.name}
            </span>
            <button
              className="tab-close"
              onClick={(e) => handleClose(e, tab.id)}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="new-tab-button" onClick={onNewTab} title="New tab">
        +
      </button>
    </div>
  );
};

export default TabBar;
