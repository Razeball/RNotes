import React, { useState } from 'react';
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
  const [expandedLicense, setExpandedLicense] = useState<string | null>(null);

  const licenses = [
    {
      name: 'Arimo',
      type: 'Apache License 2.0',
      description: 'An innovative, refreshing sans serif design that is metrically compatible with Arial.',
    },
    {
      name: 'Tinos',
      type: 'Apache License 2.0',
      description: 'A serif typeface that is metrically compatible with Times New Roman.',
    },
  ];

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

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Licenses</span>
              <span className="settings-description">
                Open source licenses for fonts and libraries used in this application
              </span>
            </div>
          </div>
          {licenses.map((license) => (
            <div key={license.name} className="license-entry">
              <button
                className="license-header"
                onClick={() => setExpandedLicense(expandedLicense === license.name ? null : license.name)}
              >
                <div className="license-header-info">
                  <span className="license-name">{license.name}</span>
                  <span className="license-type">{license.type}</span>
                </div>
                <span className={`license-chevron ${expandedLicense === license.name ? 'expanded' : ''}`}>&#9654;</span>
              </button>
              {expandedLicense === license.name && (
                <div className="license-content">
                  <p className="license-description">{license.description}</p>
                  <pre className="license-text">{`Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

"Object" form shall mean any form resulting from mechanical transformation or translation of a Source form.

"Work" shall mean the work of authorship, whether in Source or Object form, made available under the License.

"Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work.

"Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to the Licensor for inclusion in the Work by the copyright owner.

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work.

4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:

(a) You must give any other recipients of the Work or Derivative Works a copy of this License; and
(b) You must cause any modified files to carry prominent notices stating that You changed the files; and
(c) You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work; and
(d) If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file.

5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License.

6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

8. Limitation of Liability. In no event and under no legal theory shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work.

9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License.

END OF TERMS AND CONDITIONS

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.`}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default Settings;
