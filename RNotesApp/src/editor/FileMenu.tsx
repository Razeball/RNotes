import React from "react";
import { useTranslation } from "react-i18next";
import ActionDropdown, { type ActionDropdownItem } from "../components/ActionDropdown";

/** The File button in the bar above the toolbar, with the export formats as a submenu. */
export function FileMenu({
  newDocument,
  open,
  save,
  saveAs,
  print,
  handleExportFormat,
  setSettingsOpen,
}: {
  newDocument: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  print: () => void;
  handleExportFormat: (format: string) => void;
  setSettingsOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const submenuItemStyle: React.CSSProperties = {
    padding: '8px 16px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: '13px',
  };

  const makeFormatSubmenu = (handler: (format: string) => void) => (
    <div style={{ minWidth: '140px' }}>
      {[
        { id: 'rdocx', label: 'RDOCX' },
        { id: 'json', label: 'JSON' },
        { id: 'md', label: 'MD' },
        { id: 'txt', label: 'TXT' },
        { id: 'pdf', label: 'PDF' },
      ].map((f) => (
        <div
          key={f.id}
          style={submenuItemStyle}
          onMouseDown={(e) => { e.preventDefault(); handler(f.id); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--rn-bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        >
          {f.label}
        </div>
      ))}
    </div>
  );

  const fileMenuItems: ActionDropdownItem[] = [
    { id: 'new', label: t("New"), tooltip: t("Create a new document"), shortcut: 'Ctrl+N' },
    { id: 'open', label: t("Open"), tooltip: t("Open an existing document"), shortcut: 'Ctrl+O', divider: true },
    { id: 'save', label: t("Save"), tooltip: t("Save the current document"), shortcut: 'Ctrl+S' },
    { id: 'saveAs', label: t("Save As"), tooltip: t("Save the document as a new file"), shortcut: 'Ctrl+Shift+S', divider: true },
    { id: 'export', label: t("Export"), submenu: makeFormatSubmenu(handleExportFormat), divider: true },
    { id: 'print', label: t("Print"), tooltip: t("Print the document"), shortcut: 'Ctrl+P', divider: true },
    { id: 'settings', label: t("Settings"), tooltip: t("Open application settings") },
  ];

  const handleFileAction = (actionId: string) => {
    switch (actionId) {
      case 'new':
        newDocument();
        break;
      case 'open':
        open();
        break;
      case 'save':
        save();
        break;
      case 'saveAs':
        saveAs();
        break;
      case 'print':
        print();
        break;
      case 'settings':
        setSettingsOpen(true);
        break;
    }
  };

  return (
    <ActionDropdown
      items={fileMenuItems}
      onSelect={handleFileAction}
      renderButton={(_isOpen, toggle) => (
        <button onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
          {t("File")}
        </button>
      )}
    />
  );
}
