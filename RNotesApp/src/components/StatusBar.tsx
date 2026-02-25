import React from 'react';

interface StatusBarProps {
  characterCount: number;
  line: number;
  column: number;
  isSaved: boolean;
  typeSpeed?: number | null;
  showTypeSpeed?: boolean;
  pageCount?: number;
}

const StatusBar: React.FC<StatusBarProps> = ({ characterCount, line, column, isSaved, typeSpeed, showTypeSpeed, pageCount }) => {
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
      {pageCount != null && (
        <div className="status-item">
          <span className="status-label">Pages:</span>
          <span className="status-value">{pageCount}</span>
        </div>
      )}
      {showTypeSpeed && typeSpeed != null && (
        <div className="status-item">
          <span className="status-label">Speed:</span>
          <span className="status-value">{typeSpeed} WPM</span>
        </div>
      )}
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
