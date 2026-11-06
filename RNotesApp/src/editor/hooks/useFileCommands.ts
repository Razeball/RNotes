import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Element as SlateElement, Node as SlateNode } from "slate";
import type { AppSettings } from "../../components/Settings";
import type { DroppedFile } from "../../components/DropOverlay";
import { useAlert } from "../../components/Notice";
import { insertImage, type EditorInstance } from "../../editorActions";
import { getCssPageSize, getPageModel } from "../../models/pageModel";
import { describeOpenError, describeSaveError, type SaveOutcome } from "../../services/openErrors";
import { clearPageSpacers, stripPageSpacers } from "../../services/pageSpacers";
import type { DocumentMeta, LoadedDocument, TabData } from "../model";

/**
 * Everything that moves a document between the editor and the disk: save, save as, open, export,
 * print, dropped files, and the autosave timer.
 *
 * Every path strips page spacers before serialising (Rust has no node for them) and reports a
 * failure through `notify` rather than letting it become an unhandled rejection. A cancelled dialog
 * comes back as a `SaveOutcome` or `null`, never as an error.
 *
 * `printingOption` is raised while print or PDF export owns the layout: it stands the pagination
 * pass down so the browser's own fragmentation can place the breaks.
 */
export function useFileCommands({
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
}: {
  editor: EditorInstance;
  settings: AppSettings;
  activeTab: TabData;
  activeTabId: string;
  tabCounter: number;
  setTabs: Dispatch<SetStateAction<TabData[]>>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setTabCounter: Dispatch<SetStateAction<number>>;
  updateTab: (updates: Partial<TabData>) => void;
  handleNewTab: () => Promise<void>;
  isInitialMount: { current: boolean };
  spacerVoidRef: { current: boolean };
}) {
  const { t } = useTranslation();
  const notify = useAlert();
  const [printingOption, setPrintingOption] = useState(false);

  useEffect(() => {
    if (!settings.autoSaveEnabled) return;
    const intervalMs = settings.autoSaveInterval * 60 * 1000;
    const timer = setInterval(async () => {
      if (!activeTab.changed) return;
      try {
        const isSaved = await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId });
        if (isSaved) {
          await invoke("save_tab", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
          updateTab({ changed: false });
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [settings.autoSaveEnabled, settings.autoSaveInterval, activeTab.changed, activeTab.value, activeTab.name, activeTabId]);

  const handleCommitDocumentName = async (name: string) => {
    const savedToDisk = await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId }).catch(() => false);
    if (savedToDisk && name.trim()) {
      invoke("rename_tab_file", { tabId: activeTabId, newName: name.trim() }).catch(() => {});
    }
  };

  const buildMeta = (): DocumentMeta => ({
    view_mode: activeTab.viewMode,
    header_enabled: activeTab.headerEnabled,
    footer_enabled: activeTab.footerEnabled,
    header_text: activeTab.headerText,
    footer_text: activeTab.footerText,
  });

  /**
   * Both report a failure instead of swallowing it. Neither had a `catch`, so a write that failed in
   * Rust became an unhandled rejection: nothing was saved and nothing was said.
   */
  async function save() {
    try {
      const outcome = await invoke<SaveOutcome>("save_tab", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
      handleSaveOutcome(outcome);
    } catch (error) {
      notify(describeSaveError(error, t), t("Could not save"));
    }
  }

  async function saveAs() {
    try {
      const outcome = await invoke<SaveOutcome>("save_tab_as", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
      if (outcome.status === 'pdf') {
        await exportPdf();
        return;
      }
      handleSaveOutcome(outcome);
    } catch (error) {
      notify(describeSaveError(error, t), t("Could not save"));
    }
  }

  function handleSaveOutcome(outcome: SaveOutcome) {
    if (outcome.status !== 'saved') return;
    notify(t("Saved to {{path}}", { path: outcome.path }), t("Saved"));
    updateTab({ changed: false });
  }

  async function preparePrintCSS(): Promise<{
    cleanup: () => void;
    restoreView: () => void;
    pdfParams: {
      pageWidth: number; pageHeight: number;
      marginTop: number; marginBottom: number;
      marginLeft: number; marginRight: number;
    };
  }> {
    const wasNotepad = activeTab.viewMode !== 'document';
    if (wasNotepad) {
      updateTab({ viewMode: 'document' });
    }

    setPrintingOption(true);
    if (clearPageSpacers(editor)) spacerVoidRef.current = true;

    await new Promise<void>(r =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => r())
        )
      )
    );

    const pm = getPageModel(settings.pageSize);
    const toPt = (px: number) => Math.round(px * 72 / 96);

    document.getElementById('rnotes-print-page-size')?.remove();
    const styleEl = document.createElement('style');
    styleEl.id = 'rnotes-print-page-size';
    styleEl.textContent =
      `@page { size: ${getCssPageSize(settings.pageSize)}; ` +
      `margin: ${toPt(pm.marginTop)}pt ${toPt(pm.marginRight)}pt ${toPt(pm.marginBottom)}pt ${toPt(pm.marginLeft)}pt; }\n` +
      `@media print { .pv-editor-surface [data-slate-editor="true"] { orphans: 2; widows: 2; } }\n`;
    document.head.appendChild(styleEl);

    const toInches = (px: number) => px / 96;

    return {
      cleanup: () => document.getElementById('rnotes-print-page-size')?.remove(),
      restoreView: () => {
        setPrintingOption(false);
        if (wasNotepad) updateTab({ viewMode: 'notepad' });
      },
      pdfParams: {
        pageWidth: toInches(pm.widthPx),
        pageHeight: toInches(pm.heightPx),
        marginTop: toInches(pm.marginTop),
        marginBottom: toInches(pm.marginBottom),
        marginLeft: toInches(pm.marginLeft),
        marginRight: toInches(pm.marginRight),
      },
    };
  }

  async function print() {
    try {
      
      const outcome = await invoke<SaveOutcome>("save_tab", {
        document: stripPageSpacers(activeTab.value),
        documentName: activeTab.name,
        tabId: activeTabId,
        meta: buildMeta(),
      });
      if (outcome.status !== 'saved') return;
      updateTab({ changed: false });

      
      const { cleanup, restoreView, pdfParams } = await preparePrintCSS();

      try {
        
        await invoke("print_pdf", pdfParams);
      } finally {
        cleanup();
        restoreView();
      }
    } catch (error) {
      console.error("Error printing:", error);
      notify(describeSaveError(error, t), t("Could not print"));
    }
  }

  async function exportPdf() {
    try {
      const { cleanup, restoreView, pdfParams } = await preparePrintCSS();

      try {
        const outcome = await invoke<SaveOutcome>("export_to_pdf", { ...pdfParams, documentName: activeTab.name });
        if (outcome.status === 'saved') notify(t("Exported to {{path}}", { path: outcome.path }), t("Exported"));
      } finally {
        cleanup();
        restoreView();
      }
    } catch (error) {
      console.error("Error exporting PDF:", error);
      notify(describeSaveError(error, t), t("Could not export"));
    }
  }

  async function exportToFile(format: string) {
    try {
      const outcome = await invoke<SaveOutcome>("export_to_file", {
        document: stripPageSpacers(activeTab.value),
        documentName: activeTab.name,
        format,
        meta: buildMeta(),
      });
      if (outcome.status === 'saved') notify(t("Exported to {{path}}", { path: outcome.path }), t("Exported"));
    } catch (error) {
      console.error("Error exporting:", error);
      notify(describeSaveError(error, t), t("Could not export"));
    }
  }

  async function open() {
    try {
      const opened = await invoke<LoadedDocument | null>("open_in_tab", {
        tabId: activeTabId,
        allLabel: t("All supported files"),
      });
      if (!opened) return;
      const [loadedDocument, loadedName, meta] = opened;
      isInitialMount.current = true;
      updateTab({ 
        value: loadedDocument, 
        name: loadedName, 
        changed: false,
        key: Date.now(),
        viewMode: meta.view_mode === 'document' ? 'document' : 'notepad',
        headerEnabled: meta.header_enabled,
        footerEnabled: meta.footer_enabled,
        headerText: meta.header_text,
        footerText: meta.footer_text,
      });
    } catch (error) {
      notify(describeOpenError(error, t), t("Could not open file"));
    }
  }


  const handleDroppedFiles = async (files: DroppedFile[]) => {
    const failures: string[] = [];
    const refused = t("This file isn't a document RNotes can open.");

    for (const file of files.filter(f => f.kind === 'unsupported')) {
      failures.push(`${file.name}: ${refused}`);
    }

    for (const file of files.filter(f => f.kind === 'image')) {
      try {
        const path = await invoke<string>("insert_image_from_path", { tabId: activeTabId, sourcePath: file.path });
        insertImage(editor, path);
      } catch (error) {
        failures.push(`${file.name}: ${describeOpenError(error, t)}`);
      }
    }

    const documents = files.filter(f => f.kind === 'document');
    if (documents.length) {
      const currentIsEmpty =
        editor.children.length === 1 &&
        SlateElement.isElement(editor.children[0]) &&
        editor.children[0].type === 'paragraph' &&
        SlateNode.string(editor.children[0]) === '';
      const currentIsUnsaved = currentIsEmpty
        ? !(await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId }).catch(() => true))
        : false;
      let mayReplaceCurrent = currentIsEmpty && currentIsUnsaved;

      let counter = tabCounter;
      const opened: TabData[] = [];
      let replacement: TabData | null = null;

      for (const file of documents) {
        const useCurrent = mayReplaceCurrent;
        const tabId = useCurrent ? activeTabId : `tab-${++counter}`;
        try {
          if (!useCurrent) await invoke("create_tab", { tabId });
          const [loadedDocument, loadedName, meta] = await invoke<LoadedDocument>("open_file_by_path", { tabId, filePath: file.path });
          const tab: TabData = {
            id: tabId,
            name: loadedName,
            value: loadedDocument,
            changed: false,
            key: Date.now() + counter,
            viewMode: meta.view_mode === 'document' ? 'document' : 'notepad',
            headerEnabled: meta.header_enabled,
            footerEnabled: meta.footer_enabled,
            headerText: meta.header_text,
            footerText: meta.footer_text,
          };
          if (useCurrent) {
            replacement = tab;
            mayReplaceCurrent = false;
          } else {
            opened.push(tab);
          }
        } catch (error) {
          if (!useCurrent) await invoke("remove_tab", { tabId }).catch(() => {});
          failures.push(`${file.name}: ${describeOpenError(error, t)}`);
        }
      }

      setTabCounter(counter);
      const replaced = replacement;
      if (replaced || opened.length) {
        setTabs(previous => [
          ...previous.map(tab => (replaced && tab.id === replaced.id ? replaced : tab)),
          ...opened,
        ]);
        isInitialMount.current = true;
        setActiveTabId(opened.length ? opened[opened.length - 1].id : replaced!.id);
      }
    }

    if (failures.length) {
      notify(failures.join("\n"), t("Some files could not be opened"));
    }
  };

  async function newDocument() {
    await handleNewTab();
  }

  const handleExportFormat = (format: string) => {
    if (format === 'pdf') {
      exportPdf();
    } else {
      exportToFile(format);
    }
  };

  /** For Settings: turning autosave on needs the tab on disk first, so it asks for a save here. */
  const requestSave = async () => {
    try {
      const isSaved = await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId });
      if (isSaved) return true;
      const outcome = await invoke<SaveOutcome>("save_tab", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
      if (outcome.status !== 'saved') return false;
      updateTab({ changed: false });
      return true;
    } catch (error) {
      notify(describeSaveError(error, t), t("Could not save"));
      return false;
    }
  };

  return {
    printingOption,
    buildMeta,
    save,
    saveAs,
    print,
    exportPdf,
    exportToFile,
    open,
    newDocument,
    handleDroppedFiles,
    handleExportFormat,
    handleCommitDocumentName,
    requestSave,
  };
}
