import { useTranslation } from 'react-i18next';
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Editable, RenderElementProps, RenderLeafProps, useSlateStatic } from 'slate-react';
import { Range as SlateRange, NodeEntry } from 'slate';
import { getPageModel, getContentHeight, type PageSize } from '../models/pageModel';
import { paginate, type PaginationResult, type PageBreak } from '../services/pagination';
import type { EditorInstance } from '../editorActions';
import '../styles/PageView.css';

const HEADER_MAX_HEIGHT = 32;
const FOOTER_MAX_HEIGHT = 32;
const VISUAL_SPACE = 24;

/**
 * Split paragraphs at the exact overflowing line than move the whole block.
 *
 * Deleting next to a spacer goes through `onDOMBeforeInput` so it can remove the void.
 */
const ALLOW_LINES_BREAKS_GAP = true;

/**
 * One object to render differente editables.
 */
export interface EditableSurfaceProps {
  renderElement: (props: RenderElementProps) => React.JSX.Element;
  renderLeaf: (props: RenderLeafProps) => React.JSX.Element;
  decorate: (entry: NodeEntry) => SlateRange[];
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste: (event: React.ClipboardEvent) => void;
  onDOMBeforeInput: (event: InputEvent) => void;
  placeholder: string;
}

interface PageViewProps {
  editableProps: EditableSurfaceProps;
  headerEnabled: boolean;
  footerEnabled: boolean;
  headerText: string;
  footerText: string;
  onHeaderTextChange: (text: string) => void;
  onFooterTextChange: (text: string) => void;
  onPageCountChange: (count: number) => void;
  onPaginationChange: (result: PaginationResult) => void;
  pageSize: PageSize;
  printing: boolean;
}

/** Move the block down to the next page */
function applyBlockBreaks(editable: HTMLElement, breaks: PageBreak[]) {
  const block_gaps = new Map<number, number>();
  for (const item of breaks) {
    if (item.kind === 'block') block_gaps.set(item.blockIndex, item.gapPx);
  }

  const children = Array.from(editable.children) as HTMLElement[];
  children.forEach((child, index) => {
    const gap = block_gaps.get(index);
    if (gap != null) {
      child.style.marginTop = `${gap}px`;
      child.dataset.pageStart = 'true';
    } else if (child.dataset.pageStart) {
      child.style.marginTop = '';
      delete child.dataset.pageStart;
    }
  });
}

/**
 * Caps the block so it can be only be smaller than the whole sheet and is purely visual.
 */
function applyOversized(editable: HTMLElement, result: PaginationResult) {
  const page_limits = new Map(result.oversized.map((i) => [i.blockIndex, i]));

  const children = Array.from(editable.children) as HTMLElement[];
  children.forEach((child, i) => {
    const plimit = page_limits.get(i);
    if (plimit != null) {
      child.style.setProperty('--pv-max-block-height', `${plimit.maxHeightPx}px`);
      child.dataset.pvOversized = child.querySelector('table') ? 'table' : 'image';
    } else if (child.dataset.pvOversized) {
      child.style.removeProperty('--pv-max-block-height');
      delete child.dataset.pvOversized;
    }
  });
}

const PageView: React.FC<PageViewProps> = ({
  editableProps,
  headerEnabled,
  footerEnabled,
  headerText,
  footerText,
  onHeaderTextChange,
  onFooterTextChange,
  onPageCountChange,
  onPaginationChange,
  pageSize,
  printing,
}) => {
  const { t } = useTranslation();
  const editor = useSlateStatic() as EditorInstance;

  const model = getPageModel(pageSize);
  const headerHeight = headerEnabled ? HEADER_MAX_HEIGHT : 0;
  const footerHeight = footerEnabled ? FOOTER_MAX_HEIGHT : 0;
  const usableHeight = getContentHeight(model, headerHeight, footerHeight);


  const chromeHeight = footerHeight + model.marginBottom + VISUAL_SPACE + model.marginTop + headerHeight;

  const surfaceRef = useRef<HTMLDivElement>(null);

  const [pageCount, setPageCount] = useState(1);
  const [flowHeight, setFlowHeight] = useState(usableHeight);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [isEditingFooter, setIsEditingFooter] = useState(false);

  const paginate_again = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const editable = surface.querySelector('[data-slate-editor="true"]') as HTMLElement | null;
    if (!editable) return;
    
    if (printing) {
      applyBlockBreaks(editable, []);
      return;
    }

    const result = paginate(editor, editable, {
      usableHeight,
      chromeHeight,
      allowLineBreaks: ALLOW_LINES_BREAKS_GAP,
    });

    applyBlockBreaks(editable, result.breaks);
    applyOversized(editable, result);

    // The index changes so it has to been put unconditionally
    setPageCount(result.pageCount);
    setFlowHeight(result.flowHeight);
    onPageCountChange(result.pageCount);
    onPaginationChange(result);
  }, [editor, usableHeight, chromeHeight, printing, onPageCountChange, onPaginationChange]);

  useLayoutEffect(() => {
    paginate_again();
  });

  // Width and zoom can change the lines so it have to be measured again
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let oldWidth = surface.getBoundingClientRect().width;
    const page_observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? oldWidth;
      if (Math.abs(width - oldWidth) < 0.5) return;
      oldWidth = width;
      paginate_again();
    });
    page_observer.observe(surface);
    return () => page_observer.disconnect();
  }, [paginate_again]);

  const sheets = Array.from({ length: pageCount }, (_, index) => index);

  return (
    <div className="pv-scroll-area" data-view-mode="document">
      <div className="pv-doc" style={{ width: model.widthPx }}>
        <div className="pv-sheets" aria-hidden="true">
          {sheets.map((index) => (
            <div
              key={index}
              className="pv-sheet"
              style={{
                top: index * (model.heightPx + VISUAL_SPACE),
                height: model.heightPx,
              }}
            >
              {headerEnabled && (
                <div className="pv-sheet-header" style={{ height: HEADER_MAX_HEIGHT, padding: `0 ${model.marginLeft}px` }}>
                  <span className="pv-chrome-text">{headerText}</span>
                </div>
              )}
              {footerEnabled && (
                <div className="pv-sheet-footer" style={{ height: FOOTER_MAX_HEIGHT, padding: `0 ${model.marginLeft}px` }}>
                  <span className="pv-chrome-text">{footerText}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          ref={surfaceRef}
          className="pv-editor-surface"
          style={{
            padding: `${headerHeight + model.marginTop}px ${model.marginLeft}px ${footerHeight + model.marginBottom}px`,
          }}
        >
          <Editable
            renderElement={editableProps.renderElement}
            renderLeaf={editableProps.renderLeaf}
            decorate={editableProps.decorate}
            onKeyDown={editableProps.onKeyDown}
            onPaste={editableProps.onPaste}
            onDOMBeforeInput={editableProps.onDOMBeforeInput}
            placeholder={editableProps.placeholder}
            style={{ minHeight: flowHeight }}
          />
        </div>

        {headerEnabled && (
          <div
            className={`pv-chrome-edit pv-chrome-edit-header ${isEditingHeader ? 'editing' : ''}`}
            style={{ height: HEADER_MAX_HEIGHT, padding: `0 ${model.marginLeft}px` }}
            onDoubleClick={() => setIsEditingHeader(true)}
          >
            {isEditingHeader ? (
              <input
                className="pv-chrome-input"
                value={headerText}
                onChange={(e) => onHeaderTextChange(e.target.value)}
                onBlur={() => setIsEditingHeader(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') setIsEditingHeader(false);
                }}
                autoFocus
                placeholder={t("Here is the header text")}
              />
            ) : (
              <span className="pv-chrome-text">{headerText || 'Double-click to edit header text...'}</span>
            )}
          </div>
        )}

        {footerEnabled && (
          <div
            className={`pv-chrome-edit pv-chrome-edit-footer ${isEditingFooter ? 'editing' : ''}`}
            style={{
              height: FOOTER_MAX_HEIGHT,
              padding: `0 ${model.marginLeft}px`,
              top: model.heightPx - FOOTER_MAX_HEIGHT,
            }}
            onDoubleClick={() => setIsEditingFooter(true)}
          >
            {isEditingFooter ? (
              <input
                className="pv-chrome-input"
                value={footerText}
                onChange={(e) => onFooterTextChange(e.target.value)}
                onBlur={() => setIsEditingFooter(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') setIsEditingFooter(false);
                }}
                autoFocus
                placeholder={t("Here is the header text")}
              />
            ) : (
              <span className="pv-chrome-text">{footerText || 'Double-click to edit footer text...'}</span>
            )}
          </div>
        )}
      </div>

      <div className="pv-page-count-label">
        {t('{{count}} page', { count: pageCount })}
      </div>
    </div>
  );
};

export default PageView;
