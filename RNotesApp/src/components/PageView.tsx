import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Editable, RenderElementProps, RenderLeafProps } from 'slate-react';
import '../styles/PageView.css';

const PAGE_WIDTH = 816;
const PAGE_PADDING_X = 96;
const PAGE_PADDING_TOP = 60;
const PAGE_PADDING_BOTTOM = 60;
const HEADER_HEIGHT = 32;
const FOOTER_HEIGHT = 32;
const BREAK_GAP = 40;
const BASE_PAGE_CONTENT_HEIGHT = 1056 - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM; 

interface BreakInfo {
  visualY: number;
  pageAbove: number;
  pageBelow: number;
}

interface PageViewProps {
  renderElement: (props: RenderElementProps) => React.JSX.Element;
  renderLeaf: (props: RenderLeafProps) => React.JSX.Element;
  onPaste: (event: React.ClipboardEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  headerEnabled: boolean;
  footerEnabled: boolean;
  headerText: string;
  footerText: string;
  onHeaderTextChange: (text: string) => void;
  onFooterTextChange: (text: string) => void;
  onPageCountChange: (count: number) => void;
}

const PageView: React.FC<PageViewProps> = ({
  renderElement,
  renderLeaf,
  onPaste,
  onKeyDown,
  headerEnabled,
  footerEnabled,
  headerText,
  footerText,
  onHeaderTextChange,
  onFooterTextChange,
  onPageCountChange,
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const adjustingRef = useRef(false);
  const pageCountRef = useRef(1);
  const breakInfosRef = useRef<string>('[]');
  const minHeightRef = useRef(BASE_PAGE_CONTENT_HEIGHT);

  const [pageCount, setPageCount] = useState(1);
  const [breakInfos, setBreakInfos] = useState<BreakInfo[]>([]);
  const [editableMinHeight, setEditableMinHeight] = useState(BASE_PAGE_CONTENT_HEIGHT);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingFooter, setEditingFooter] = useState(false);

  const pageContentHeight = BASE_PAGE_CONTENT_HEIGHT
    - (headerEnabled ? HEADER_HEIGHT : 0)
    - (footerEnabled ? FOOTER_HEIGHT : 0);

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

    const children = Array.from(editable.children) as HTMLElement[];

    for (const child of children) {
      if (child.dataset.pvGap) {
        child.style.marginTop = '';
        delete child.dataset.pvGap;
      }
      if (child.dataset.pageStart) {
        delete child.dataset.pageStart;
      }
    }

    let totalContentHeight = 0;
    for (const child of children) {
      totalContentHeight += child.offsetHeight;
    }

    const newPageCount = Math.max(
      1,
      Math.ceil(totalContentHeight / pageContentHeight)
    );


    const newBreaks: BreakInfo[] = [];
    let cumulativeMargin = 0;

    if (newPageCount > 1) {
      let contentY = 0;

      for (const child of children) {
        const h = child.offsetHeight;
        if (h === 0) continue;

        const currentPage = Math.floor(contentY / pageContentHeight);
        const pageBoundary = (currentPage + 1) * pageContentHeight;

        if (contentY + h > pageBoundary && currentPage < newPageCount - 1) {
          if (h <= pageContentHeight) {

            const spaceLeft = pageBoundary - contentY;
            const gap = spaceLeft + BREAK_GAP;

            child.style.marginTop = gap + 'px';
            child.dataset.pvGap = '1';
            child.dataset.pageStart = 'true';

            newBreaks.push({
              visualY: PAGE_PADDING_TOP + pageBoundary + cumulativeMargin,
              pageAbove: currentPage + 1,
              pageBelow: currentPage + 2,
            });

            cumulativeMargin += gap;
            contentY = pageBoundary + h;
          } else {
            newBreaks.push({
              visualY: PAGE_PADDING_TOP + pageBoundary + cumulativeMargin,
              pageAbove: currentPage + 1,
              pageBelow: currentPage + 2,
            });
            contentY += h;
          }
        } else {
          contentY += h;
        }
      }
    }


    const newMinHeight = newPageCount * pageContentHeight + cumulativeMargin;

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
  }, [pageContentHeight, onPageCountChange, reconnectObserver]);


  useEffect(() => {
    recalculate();
    const observer = new MutationObserver(() => recalculate());
    observerRef.current = observer;
    if (surfaceRef.current) {
      observer.observe(surfaceRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => observer.disconnect();
  }, [recalculate]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recalculate());
    if (surfaceRef.current) ro.observe(surfaceRef.current);
    return () => ro.disconnect();
  }, [recalculate]);

  return (
    <div className="pv-scroll-area" data-view-mode="document">
      <div className="pv-page-frame" style={{ width: PAGE_WIDTH }}>
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
            padding: `${PAGE_PADDING_TOP}px ${PAGE_PADDING_X}px ${PAGE_PADDING_BOTTOM}px`,
          }}
        >
          <Editable
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            placeholder="Start writing something..."
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            style={{ minHeight: editableMinHeight }}
          />

          {breakInfos.map((info, i) => (
            <div
              key={i}
              className="pv-break-spacer"
              style={{ top: info.visualY, height: BREAK_GAP }}
            >
              <div className="pv-break-bottom-margin" />
              <div className="pv-break-gap">
                <span className="pv-break-label">
                  Page {info.pageAbove} &nbsp;&mdash;&nbsp; Page {info.pageBelow}
                </span>
              </div>
              <div className="pv-break-top-margin" />
            </div>
          ))}
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
