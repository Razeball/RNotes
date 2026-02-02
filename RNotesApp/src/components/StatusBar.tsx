import React from 'react';

interface StatusBarProps {
  characterCount: number;
  line: number;
  column: number;
  isSaved: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({ characterCount, line, column, isSaved }) => {
  return (
    <div className="status-bar">
      <div className="status-item">
        <span className="status-label">Characters:</span>
        <span className="status-value">{characterCount}</span>
      </div>
      <div className="status-item">
        <span className="status-label">Ln</span>
        <span className="status-value">{line}</span>
        <span className="status-label">, Col</span>
        <span className="status-value">{column}</span>
      </div>
      <div className="status-item">
        <span 
          className={`status-saved ${isSaved ? 'saved' : 'unsaved'}`}
          title={isSaved ? 'All changes saved' : 'Unsaved changes'}
        >
          {isSaved ? '● Saved' : '● Unsaved'}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
