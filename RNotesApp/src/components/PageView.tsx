import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Editable, RenderElementProps, RenderLeafProps } from 'slate-react';
import { getPageModel, getContentHeight, type PageSize } from '../models/pageModel';
import '../styles/PageView.css';

const HEADER_HEIGHT = 32;
const FOOTER_HEIGHT = 32;
const VISUAL_GAP = 24;

interface BreakInfo {
  visualY: number;
  pageAbove: number;
  pageBelow: number;
}

interface PageViewProps {
  renderElement: (props: RenderElementProps) => React.JSX.Element;
  renderLeaf: (props: RenderLeafProps) => React.JSX.Element;
  headerEnabled: boolean;
  footerEnabled: boolean;
  headerText: string;
  footerText: string;
  onHeaderTextChange: (text: string) => void;
  onFooterTextChange: (text: string) => void;
  onPageCountChange: (count: number) => void;
  pageSize: PageSize;
}

const PageView: React.FC<PageViewProps> = ({
  renderElement,
  renderLeaf,
  headerEnabled,
  footerEnabled,
  headerText,
  footerText,
  onHeaderTextChange,
  onFooterTextChange,
  onPageCountChange,
  pageSize,
}) => {
  const model = getPageModel(pageSize);
  const headerH = headerEnabled ? HEADER_HEIGHT : 0;
  const footerH = footerEnabled ? FOOTER_HEIGHT : 0;
  const pageContentHeight = getContentHeight(model, headerH, footerH);

  
  const breakTotalHeight = footerH + model.marginBottom + VISUAL_GAP + model.marginTop + headerH;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const adjustingRef = useRef(false);
  const pageCountRef = useRef(1);
  const breakInfosRef = useRef<string>('[]');
  const minHeightRef = useRef(pageContentHeight);
  const rafRef = useRef<number>(0);

  const [pageCount, setPageCount] = useState(1);
  const [breakInfos, setBreakInfos] = useState<BreakInfo[]>([]);
  const [editableMinHeight, setEditableMinHeight] = useState(pageContentHeight);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingFooter, setEditingFooter] = useState(false);

  const reconnectObserver = useCallback(() => {
    if (surfaceRef.current && observerRef.current) {
      observerRef.current.observe(surfaceRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }, []);

  const recalculate = useCallback(() => {
    if (adjustingRef.current) return;
    adjustingRef.current = true;
    observerRef.current?.disconnect();

    const editable = surfaceRef.current?.querySelector(
      '[data-slate-editor="true"]'
    ) as HTMLElement | null;
    if (!editable) {
      adjustingRef.current = false;
      reconnectObserver();
      return;
    }

    
    const computedStyle = getComputedStyle(editable);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 28.8;
    const linesPerPage = Math.floor(pageContentHeight / lineHeight);
    const usablePageHeight = linesPerPage * lineHeight;

    const children = Array.from(editable.children) as HTMLElement[];

    
    for (const child of children) {
      if (child.dataset.pvGap) {
        child.style.marginTop = '';
        delete child.dataset.pvGap;
      }
      delete child.dataset.pageStart;
    }

    const newBreaks: BreakInfo[] = [];
    
    let pageStartY = model.marginTop;
    
    let contentOnPage = 0;

    for (const child of children) {
      const h = child.offsetHeight;
      if (h === 0) continue;

      if (contentOnPage + h > usablePageHeight && contentOnPage > 0) {
        
        const spaceLeft = usablePageHeight - contentOnPage;
        const gap = spaceLeft + breakTotalHeight;

        child.style.marginTop = gap + 'px';
        child.dataset.pvGap = '1';
        child.dataset.pageStart = 'true';

        const breakY = pageStartY + usablePageHeight;
        newBreaks.push({
          visualY: breakY,
          pageAbove: newBreaks.length + 1,
          pageBelow: newBreaks.length + 2,
        });

        pageStartY = breakY + breakTotalHeight;
        contentOnPage = 0;
      }

      contentOnPage += h;
    }

    const newPageCount = newBreaks.length + 1;
    
    const newMinHeight = (pageStartY - model.marginTop) + usablePageHeight;

    if (newPageCount !== pageCountRef.current) {
      pageCountRef.current = newPageCount;
      setPageCount(newPageCount);
      onPageCountChange(newPageCount);
    }

    const breaksStr = JSON.stringify(newBreaks);
    if (breaksStr !== breakInfosRef.current) {
      breakInfosRef.current = breaksStr;
      setBreakInfos(newBreaks);
    }

    if (newMinHeight !== minHeightRef.current) {
      minHeightRef.current = newMinHeight;
      setEditableMinHeight(newMinHeight);
    }

    adjustingRef.current = false;
    reconnectObserver();
  }, [pageContentHeight, breakTotalHeight, model.marginTop, onPageCountChange, reconnectObserver]);

  
  const scheduleRecalculate = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => recalculate());
  }, [recalculate]);

  useEffect(() => {
    recalculate();
    const observer = new MutationObserver(() => scheduleRecalculate());
    observerRef.current = observer;
    if (surfaceRef.current) {
      observer.observe(surfaceRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [recalculate, scheduleRecalculate]);

  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleRecalculate());
    if (surfaceRef.current) ro.observe(surfaceRef.current);
    return () => ro.disconnect();
  }, [scheduleRecalculate]);

  return (
    <div className="pv-scroll-area" data-view-mode="document">
      <div className="pv-page-frame" style={{ width: model.widthPx }}>
        {headerEnabled && (
          <div
            className={`pv-header ${editingHeader ? 'editing' : ''}`}
            onDoubleClick={() => setEditingHeader(true)}
          >
            {editingHeader ? (
              <input
                className="pv-header-input"
                value={headerText}
                onChange={(e) => onHeaderTextChange(e.target.value)}
                onBlur={() => setEditingHeader(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingHeader(false);
                }}
                autoFocus
                placeholder="Header text..."
              />
            ) : (
              <span className="pv-header-text">
                {headerText || 'Double-click to edit header...'}
              </span>
            )}
          </div>
        )}

        <div
          ref={surfaceRef}
          className="pv-editor-surface"
          style={{
            padding: `${model.marginTop}px ${model.marginLeft}px ${model.marginBottom}px`,
          }}
        >
          <Editable
            readOnly
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            placeholder="Start writing something..."
            style={{ minHeight: editableMinHeight }}
          />

          {breakInfos.map((info, i) => {
            return (
            <div
              key={i}
              className="pv-break-spacer"
              style={{ top: info.visualY, height: breakTotalHeight }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {footerEnabled && (
                <div className="pv-break-footer">
                  <span className="pv-break-footer-text">{footerText || ''}</span>
                </div>
              )}
              <div className="pv-break-bottom-margin" style={{ height: model.marginBottom }} />
              <div className="pv-break-gap">
                <span className="pv-break-label">
                  Page {info.pageAbove} &nbsp;&mdash;&nbsp; Page {info.pageBelow}
                </span>
              </div>
              <div className="pv-break-top-margin" style={{ height: model.marginTop }} />
              {headerEnabled && (
                <div className="pv-break-header">
                  <span className="pv-break-header-text">{headerText || ''}</span>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {footerEnabled && (
          <div
            className={`pv-footer ${editingFooter ? 'editing' : ''}`}
            onDoubleClick={() => setEditingFooter(true)}
          >
            {editingFooter ? (
              <input
                className="pv-footer-input"
                value={footerText}
                onChange={(e) => onFooterTextChange(e.target.value)}
                onBlur={() => setEditingFooter(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingFooter(false);
                }}
                autoFocus
                placeholder="Footer text..."
              />
            ) : (
              <span className="pv-footer-text">
                {footerText || 'Double-click to edit footer...'}
              </span>
            )}
          </div>
        )}

        <div className="pv-page-count-label">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </div>
      </div>
    </div>
  );
};

export default PageView;
