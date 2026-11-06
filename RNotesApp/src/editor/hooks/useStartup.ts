import { useEffect, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { applyTheme, type AppSettings } from "../../components/Settings";
import { activatePreferredUserLanguage } from "../../i18n";
import type { LoadedDocument, TabData } from "../model";

/**
 * Runs once at launch: loads the settings from Rust, applies the theme and language, then reopens
 * the previous session's files (when restore is on) and the file the app was started with, if any.
 */
export function useStartup({
  setSettings,
  setTabs,
  setActiveTabId,
  setTabCounter,
}: {
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setTabs: Dispatch<SetStateAction<TabData[]>>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setTabCounter: Dispatch<SetStateAction<number>>;
}) {
  useEffect(() => {
    (async () => {
      try {
        const loaded = await invoke<any>("get_settings");
        setSettings({
          autoSaveEnabled: loaded.auto_save_enabled,
          autoSaveInterval: loaded.auto_save_interval,
          showUnsavedWarning: loaded.show_unsaved_warning,
          showTypeSpeed: loaded.show_type_speed,
          pageSize: loaded.page_size || 'letter',
          restoreSession: loaded.restore_session ?? false,
          markdownEnabled: loaded.markdown_enabled ?? false,
          language: loaded.language ?? '',
          spellcheckEnabled: loaded.spellcheck_enabled ?? true,
          spellcheckLanguage: loaded.spellcheck_language ?? '',
          keySoundEnabled: loaded.typing_sound_enable ?? true,
          theme: loaded.theme ?? 'dark',
          runInBackground: loaded.run_in_background ?? false,
        });
        applyTheme(loaded.theme ?? 'dark');
        	activatePreferredUserLanguage(loaded.language);

        let counter = 1;
        const allTabs: TabData[] = [];
        let activeRestoredId = '';

        if (loaded.restore_session) {
          try {
            const session = await invoke<{ paths: string[]; active_path: string }>("get_session");
            if (session.paths && session.paths.length > 0) {
              for (const filePath of session.paths) {
                const tabId = `tab-${counter}`;
                counter++;
                try {
                  await invoke("create_tab", { tabId });
                  const [loadedDocument, loadedName, meta] = await invoke<LoadedDocument>("open_file_by_path", { tabId, filePath });
                  const newTab: TabData = {
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
                  allTabs.push(newTab);
                  if (filePath === session.active_path) activeRestoredId = tabId;
                } catch {
                  await invoke("remove_tab", { tabId }).catch(() => {});
                }
              }
            }
          } catch {}
        }

        try {
          const startupFile = await invoke<string | null>("get_startup_file");
          if (startupFile) {
            const tabId = `tab-${counter}`;
            counter++;
            try {
              await invoke("create_tab", { tabId });
              const [loadedDocument, loadedName, meta] = await invoke<LoadedDocument>("open_file_by_path", { tabId, filePath: startupFile });
              const newTab: TabData = {
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
              allTabs.push(newTab);
              activeRestoredId = tabId;
            } catch {
              await invoke("remove_tab", { tabId }).catch(() => {});
            }
          }
        } catch {}

        if (allTabs.length > 0) {
          setTabCounter(counter - 1);
          setTabs(allTabs);
          setActiveTabId(activeRestoredId || allTabs[allTabs.length - 1].id);
        }
      } catch {}
    })();
  }, []);
}
