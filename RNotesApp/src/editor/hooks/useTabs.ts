import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../../components/Settings";
import type { Tab } from "../../components/TitleBar";
import { initialValue, type TabData } from "../model";

/**
 * The open tabs and which one is active.
 *
 * Each tab's content lives here; its save path and dirty flag are mirrored in Rust (`Config` in
 * config.rs), which needs them for the native "unsaved changes" dialogs. That is why every
 * lifecycle change below also tells Rust: `create_tab`, `remove_tab`, and `editor_changed`.
 *
 * `isInitialMount` is raised whenever a tab is (re)mounted — switched to, opened into, created — so
 * the first `onChange` Slate fires for the new content is not mistaken for an edit.
 */
export function useTabs(settings: AppSettings) {
  const [tabs, setTabs] = useState<TabData[]>([
    { id: 'tab-1', name: 'Document', value: initialValue, changed: false, key: 0, viewMode: 'notepad', headerEnabled: false, footerEnabled: false, headerText: '', footerText: '' }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [tabCounter, setTabCounter] = useState(1);
  const isInitialMount = useRef(true);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    if (!settings.restoreSession) return;
    const tabIds = tabs.map(t => t.id);
    invoke("save_session", { tabIds, activeTabId }).catch(() => {});
  }, [tabs, activeTabId, settings.restoreSession]);

  useEffect(() => {
    invoke("editor_changed", { hasChanged: activeTab.changed, tabId: activeTabId });
  }, [activeTab.changed, activeTabId]);

  const updateTab = (updates: Partial<TabData>) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, ...updates } : tab
    ));
  };

  const handleTabClose = async (tabId: string) => {
    const tabToClose = tabs.find(t => t.id === tabId);
    if (!tabToClose) return;

    if (tabToClose.changed && settings.showUnsavedWarning) {
      const confirmed = await invoke<boolean>("confirm_close_tab", { tabId });
      if (!confirmed) return;
    }

    await invoke("remove_tab", { tabId });

    if (tabs.length === 1) {
      const newTabId = `tab-${tabCounter + 1}`;
      setTabCounter(prev => prev + 1);
      await invoke("create_tab", { tabId: newTabId });
      setTabs([{ id: newTabId, name: 'Document', value: initialValue, changed: false, key: 0, viewMode: 'notepad', headerEnabled: false, footerEnabled: false, headerText: '', footerText: '' }]);
      setActiveTabId(newTabId);
      isInitialMount.current = true;
    } else {
      const newTabs = tabs.filter(t => t.id !== tabId);
      setTabs(newTabs);
      if (activeTabId === tabId) {
        isInitialMount.current = true;
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
    }
  };

  const handleNewTab = async () => {
    const newTabId = `tab-${tabCounter + 1}`;
    setTabCounter(prev => prev + 1);
    await invoke("create_tab", { tabId: newTabId });
    const newTab: TabData = {
      id: newTabId,
      name: 'Document',
      value: initialValue,
      changed: true,
      key: Date.now(),
      viewMode: 'notepad',
      headerEnabled: false,
      footerEnabled: false,
      headerText: '',
      footerText: '',
    };
    setTabs(prev => [...prev, newTab]);
    isInitialMount.current = true;
    setActiveTabId(newTabId);

    await invoke("editor_changed", { hasChanged: true, tabId: newTabId });
  };

  const handleTabReorder = (fromIndex: number, toIndex: number) => {
    setTabs(previous => {
      const reordered = [...previous];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      return reordered;
    });
  };

  const tabBarTabs: Tab[] = tabs.map(t => ({
    id: t.id,
    name: t.name,
    isModified: t.changed
  }));

  return {
    tabs, setTabs,
    activeTabId, setActiveTabId,
    tabCounter, setTabCounter,
    isInitialMount,
    activeTab,
    updateTab,
    handleTabClose,
    handleNewTab,
    handleTabReorder,
    tabBarTabs,
  };
}
