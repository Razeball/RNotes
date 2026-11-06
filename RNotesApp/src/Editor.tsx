import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback, useEffect } from "react";
import { createEditor, Range as SlateRange, NodeEntry, Text } from "slate";

import {
  Slate,
  Editable,
  withReact,
  RenderElementProps,
  RenderLeafProps,
} from "slate-react";
import { withHistory } from "slate-history";
import Toolbar from "./components/Toolbar";
import Miscellaneousbar from "./components/Miscellaneousbar";
import ContextMenu from "./components/ContextMenu";
import SpellingReview from "./components/SpellingReview";
import DictionarySettings from "./components/DictionarySettings";
import StatusBar from "./components/StatusBar";
import DropOverlay from "./components/DropOverlay";
import TitleBar from "./components/TitleBar";
import Settings from "./components/Settings";
import PageView, { EditableSurfaceProps } from "./components/PageView";
import type { SearchMatch } from "./editorActions";
import FindReplacePanel from "./components/FindReplacePanel";
import "./styles/Spellcheck.css";
import { withImages, pageWithSpacers } from "./editor/plugins";
import { Element } from "./editor/Element";
import { Leaf } from "./editor/Leaf";
import { useAppSettings } from "./editor/hooks/useAppSettings";
import { useTabs } from "./editor/hooks/useTabs";
import { useStartup } from "./editor/hooks/useStartup";
import { useTypingSpeed } from "./editor/hooks/useTypingSpeed";
import { useDocumentLayout } from "./editor/hooks/useDocumentLayout";
import { useSpellcheckUi } from "./editor/hooks/useSpellcheckUi";
import { SpellHoverPopup } from "./editor/SpellHoverPopup";
import { useEditingHandlers } from "./editor/hooks/useEditingHandlers";
import { useFileCommands } from "./editor/hooks/useFileCommands";
import { useGlobalShortcuts } from "./editor/hooks/useGlobalShortcuts";
import { useContextMenu } from "./editor/hooks/useContextMenu";
import { FileMenu } from "./editor/FileMenu";

const MySlateEditor = () => {
  const { t } = useTranslation();
  const { settings, setSettings, settingsRef } = useAppSettings();
  const {
    setTabs,
    activeTabId, setActiveTabId,
    tabCounter, setTabCounter,
    isInitialMount,
    activeTab,
    updateTab,
    handleTabClose,
    handleNewTab,
    handleTabReorder,
    tabBarTabs,
  } = useTabs(settings);
  useStartup({ setSettings, setTabs, setActiveTabId, setTabCounter });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [pageCount, setPageCount] = useState(1);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [editorVersion, setEditorVersion] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);

  const editor = useMemo(() => pageWithSpacers(withImages(withHistory(withReact(createEditor())))), [activeTab?.key]);
  const { typeSpeed, trackKeystroke, resetTypingSpeed } = useTypingSpeed(settings);
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const {
    spellLanguage,
    spellRuleLabel,
    spellingReviewOpen, setSpellingReviewOpen,
    dictionaryOpen, setDictionaryOpen,
    spellTarget, setSpellTarget,
    spellHover, setSpellHover,
    hoverSuggestions,
    targetSuggestions, setTargetSuggestions,
    decorateSpelling,
    repairDomSelection,
    recheckDocument,
    readPayloadAt,
    keepSpellHover,
    releaseSpellHover,
    loadSuggestions,
    handleEditorMouseOver,
    applyWordSuggestion,
    handleSpellCorrect,
    handleSpellAddWord,
  } = useSpellcheckUi({ editor, settings, settingsRef, editorVersion, activeTabId, handleCloseContextMenu });
  const {
    cursorPosition,
    characterCount,
    notepadRef,
    spacerVoidRef,
    reconcileCapRef,
    updateCursorPosition,
    handlePaginationChange,
  } = useDocumentLayout({ editor, activeTab, activeTabId, editorVersion, zoomLevel });
  const { handlePaste, handleEditKeyDownEvent, handleDOMBeforeInput } = useEditingHandlers({
    editor,
    settingsRef,
    activeTabId,
    trackKeystroke,
    repairDomSelection,
  });
  const {
    printingOption,
    save,
    saveAs,
    print,
    open,
    newDocument,
    handleDroppedFiles,
    handleExportFormat,
    handleCommitDocumentName,
    requestSave,
  } = useFileCommands({
    editor,
    settings,
    activeTab,
    activeTabId,
    tabCounter,
    setTabs,
    setActiveTabId,
    setTabCounter,
    updateTab,
    handleNewTab,
    isInitialMount,
    spacerVoidRef,
  });
  useGlobalShortcuts({
    editor,
    activeTab,
    activeTabId,
    save,
    saveAs,
    open,
    newDocument,
    print,
    handleNewTab,
    handleTabClose,
    updateTab,
    setShowFindPanel,
  });
  const { handleContextMenu, contextMenuItems } = useContextMenu({
    editor,
    setContextMenu,
    handleCloseContextMenu,
    setShowFindPanel,
    spellTarget,
    setSpellTarget,
    targetSuggestions,
    setTargetSuggestions,
    readPayloadAt,
    loadSuggestions,
    handleSpellCorrect,
    handleSpellAddWord,
  });

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // It change the document but not the content.
    if (spacerVoidRef.current) {
      spacerVoidRef.current = false;
      return;
    }
    reconcileCapRef.current = 0;
    updateTab({ changed: true });
  }, [activeTab.value]);

  const renderElement = useCallback(
    (props: RenderElementProps) => <Element {...props} />,
    []
  );
  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    []
  );

  const handleMatchesChange = useCallback((matches: SearchMatch[], currentIndex: number) => {
    setSearchMatches(matches)
    setCurrentMatchIndex(currentIndex)
  }, [])

  const decorate = useCallback(([node, path]: NodeEntry): SlateRange[] => {
    const ranges: SlateRange[] = []
    if (!Text.isText(node) || searchMatches.length === 0) return ranges

    for (let i = 0; i < searchMatches.length; i++) {
      const match = searchMatches[i]
      if (match.path.length === path.length && match.path.every((v, idx) => v === path[idx])) {
        ranges.push({
          anchor: { path, offset: match.offset },
          focus: { path, offset: match.offset + match.length },
          searchHighlight: true,
          activeHighlight: i === currentMatchIndex,
        } as any)
      }
    }

    return ranges
  }, [searchMatches, currentMatchIndex])

  const decorateAll = useCallback((entry: NodeEntry): SlateRange[] => {
    return [...decorate(entry), ...decorateSpelling(entry)]
  }, [decorate, decorateSpelling])

  const editableProps: EditableSurfaceProps = useMemo(() => ({
    renderElement,
    renderLeaf,
    decorate: decorateAll,
    onKeyDown: handleEditKeyDownEvent,
    onPaste: handlePaste,
    onDOMBeforeInput: handleDOMBeforeInput,
    placeholder: t("Start Writing something..."),
  }), [renderElement, renderLeaf, decorateAll, handleEditKeyDownEvent, handlePaste, handleDOMBeforeInput]);

  const getDocumentName = (name: string) => {
    updateTab({ name });
  };

  const handleTabClick = (tabId: string) => {
    isInitialMount.current = true;
    resetTypingSpeed();
    setActiveTabId(tabId);
  };

  return (
    <div className="app-shell">
      <TitleBar
        tabs={tabBarTabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onNewTab={handleNewTab}
        onReorder={handleTabReorder}
      />
      <div className="miscellaneous-bar">
        <Miscellaneousbar loadDocumentName={getDocumentName} onCommitDocumentName={handleCommitDocumentName} documentName={activeTab.name} editor={editor} tabId={activeTabId} editorVersion={editorVersion} onToolSelect={(tool) => tool === 'spelling' ? setSpellingReviewOpen(true) : setDictionaryOpen(true)}>    
          <FileMenu
            newDocument={newDocument}
            open={open}
            save={save}
            saveAs={saveAs}
            print={print}
            handleExportFormat={handleExportFormat}
            setSettingsOpen={setSettingsOpen}
          />
        </Miscellaneousbar>
      </div>
      <div className="editor-wrapper" onContextMenu={handleContextMenu} onMouseOver={handleEditorMouseOver} onMouseLeave={releaseSpellHover} onWheel={(e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          setZoomLevel(prev => Math.min(200, Math.max(50, prev + (e.deltaY < 0 ? 10 : -10))));
        }
      }}>
        <div className="editor-container" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', width: `${10000 / zoomLevel}%` }}>
          <Slate
            key={activeTab.key}
            editor={editor}
            initialValue={activeTab.value}
            onChange={(v) => {
              updateTab({ value: v });
              updateCursorPosition();
              setEditorVersion(prev => prev + 1);
            }}
          >
            <div className="toolbar">
              <Toolbar editor={editor} />
            </div>
            <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <FindReplacePanel
                editor={editor}
                isOpen={showFindPanel}
                onClose={() => {
                  setShowFindPanel(false)
                  setSearchMatches([])
                  setCurrentMatchIndex(-1)
                }}
                onMatchesChange={handleMatchesChange}
              />
              {activeTab.viewMode === 'document' ? (
                <PageView
                  editableProps={editableProps}
                  headerEnabled={activeTab.headerEnabled}
                  footerEnabled={activeTab.footerEnabled}
                  headerText={activeTab.headerText}
                  footerText={activeTab.footerText}
                  onHeaderTextChange={(text) => updateTab({ headerText: text })}
                  onFooterTextChange={(text) => updateTab({ footerText: text })}
                  onPageCountChange={setPageCount}
                  onPaginationChange={handlePaginationChange}
                  pageSize={settings.pageSize}
                  printing={printingOption}
                />
              ) : (
                <div className="editor-content" ref={notepadRef}>
                  <Editable {...editableProps} spellCheck={false} />
                </div>
              )}
            </div>
          </Slate>
        </div>
      </div>
      <DropOverlay onDrop={handleDroppedFiles} />
      <StatusBar
        characterCount={characterCount}
        line={cursorPosition.line}
        column={cursorPosition.column}
        isSaved={!activeTab.changed}
        typeSpeed={typeSpeed}
        showTypeSpeed={settings.showTypeSpeed}
        pageCount={activeTab.viewMode === 'document' ? pageCount : undefined}
        zoomLevel={zoomLevel}
        onZoomReset={() => setZoomLevel(100)}
      />
      <SpellingReview
        isOpen={spellingReviewOpen}
        onClose={() => setSpellingReviewOpen(false)}
        editor={editor}
        language={spellLanguage}
        onCorrected={recheckDocument}
      />

      <DictionarySettings
        isOpen={dictionaryOpen}
        onClose={() => setDictionaryOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onDictionaryChanged={recheckDocument}
      />

      {spellHover && !contextMenu && !spellingReviewOpen && !dictionaryOpen && !settingsOpen && (
        <SpellHoverPopup
          spellHover={spellHover}
          hoverSuggestions={hoverSuggestions}
          spellRuleLabel={spellRuleLabel}
          keepSpellHover={keepSpellHover}
          releaseSpellHover={releaseSpellHover}
          applyWordSuggestion={applyWordSuggestion}
          setSpellHover={setSpellHover}
        />
      )}

      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onRequestSave={requestSave}
        viewMode={activeTab.viewMode}
        onViewModeChange={(mode) => updateTab({ viewMode: mode })}
        headerEnabled={activeTab.headerEnabled}
        footerEnabled={activeTab.footerEnabled}
        onHeaderEnabledChange={(enabled) => updateTab({ headerEnabled: enabled })}
        onFooterEnabledChange={(enabled) => updateTab({ footerEnabled: enabled })}
      />
      {contextMenu && (
        <div className="context-menu">
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onClose={handleCloseContextMenu}
          />
        </div>
      )}
    </div>
  );
};

export default MySlateEditor;
