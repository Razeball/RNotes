import React from 'react';
import Modal from './Modal';
import '../styles/Settings.css';
import { invoke } from '@tauri-apps/api/core';

export type ViewMode = 'notepad' | 'document';

export interface AppSettings {
  autoSaveEnabled: boolean;
  autoSaveInterval: 5 | 10 | 30;
  showUnsavedWarning: boolean;
  showTypeSpeed: boolean;
}

export const defaultSettings: AppSettings = {
  autoSaveEnabled: false,
  autoSaveInterval: 5,
  showUnsavedWarning: true,
  showTypeSpeed: false,
};

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onRequestSave: () => Promise<boolean>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  headerEnabled: boolean;
  footerEnabled: boolean;
  onHeaderEnabledChange: (enabled: boolean) => void;
  onFooterEnabledChange: (enabled: boolean) => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, settings, onSettingsChange, onRequestSave, viewMode, onViewModeChange, headerEnabled, footerEnabled, onHeaderEnabledChange, onFooterEnabledChange }) => {
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    onSettingsChange(newSettings);
    invoke("update_settings", { settings: {
      auto_save_enabled: newSettings.autoSaveEnabled,
      auto_save_interval: newSettings.autoSaveInterval,
      show_unsaved_warning: newSettings.showUnsavedWarning,
      show_type_speed: newSettings.showTypeSpeed,
    }}).catch((err) => console.error("Failed to save settings:", err));
  };

  const handleAutoSaveToggle = async (checked: boolean) => {
    if (checked) {
      const saved = await onRequestSave();
      if (!saved) return;
    }
    updateSetting('autoSaveEnabled', checked);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="settings-panel">
        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Auto Save</span>
              <span className="settings-description">
                Automatically save the document at a regular interval. The file must be saved first to set a location.
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.autoSaveEnabled}
                onChange={(e) => handleAutoSaveToggle(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          {settings.autoSaveEnabled && (
            <div className="settings-row sub-setting">
              <span className="settings-label">Save interval</span>
              <div className="interval-options">
                {([5, 10, 30] as const).map((interval) => (
                  <button
                    key={interval}
                    className={`interval-button ${settings.autoSaveInterval === interval ? 'active' : ''}`}
                    onClick={() => updateSetting('autoSaveInterval', interval)}
                  >
                    {interval} min
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Unsaved Changes Warning</span>
              <span className="settings-description">
                Show a confirmation dialog when closing a tab or the app with unsaved changes
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.showUnsavedWarning}
                onChange={(e) => updateSetting('showUnsavedWarning', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Show Type Speed</span>
              <span className="settings-description">
                Display average typing speed (WPM) in the status bar
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.showTypeSpeed}
                onChange={(e) => updateSetting('showTypeSpeed', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Document View Mode</span>
              <span className="settings-description">
                Switch between a continuous notepad view and a paginated document view with fixed-size pages
              </span>
            </div>
            <div className="view-mode-options">
              <button
                className={`interval-button ${viewMode === 'notepad' ? 'active' : ''}`}
                onClick={() => onViewModeChange('notepad')}
              >
                Notepad
              </button>
              <button
                className={`interval-button ${viewMode === 'document' ? 'active' : ''}`}
                onClick={() => onViewModeChange('document')}
              >
                Document
              </button>
            </div>
          </div>
          {viewMode === 'document' && (
            <>
              <div className="settings-row sub-setting">
                <div className="settings-info">
                  <span className="settings-label">Header</span>
                  <span className="settings-description">
                    Show a header at the top of each page. Double-click in the header area to edit.
                  </span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={headerEnabled}
                    onChange={(e) => onHeaderEnabledChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <div className="settings-row sub-setting">
                <div className="settings-info">
                  <span className="settings-label">Footer</span>
                  <span className="settings-description">
                    Show a footer at the bottom of each page. Double-click in the footer area to edit.
                  </span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={footerEnabled}
                    onChange={(e) => onFooterEnabledChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default Settings;
