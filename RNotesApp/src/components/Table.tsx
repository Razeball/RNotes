import { RenderElementProps, ReactEditor, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import Popup from "./Popup";
import { CustomElement, CustomText } from "../Editor";

export const TableElement = ({ attributes, children, element }: RenderElementProps) => {
  const editor = useSlateStatic();
  
  const deleteTable = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.removeNodes(editor, { at: path });
  };
  
  const addRow = (position: 'top' | 'bottom') => {
    const path = ReactEditor.findPath(editor, element);
    const tableChildren = element.children as CustomElement[];
    

    if (tableChildren.length >= 10) {
      return;
    }
    
    const columnCount = tableChildren[0]?.children?.length || 2;
    
    const newRow: CustomElement = {
      type: 'table-row',
      children: Array(columnCount).fill(null).map(() => ({
        type: 'table-cell',
        children: [{ text: '' }],
      })) as unknown as CustomText[],
    };
    
    const insertPath = position === 'top' 
      ? [...path, 0] 
      : [...path, tableChildren.length];
    
    Transforms.insertNodes(editor, newRow, { at: insertPath });
  };

  const removeRow = (position: 'top' | 'bottom') => {
    const path = ReactEditor.findPath(editor, element);
    const tableChildren = element.children as CustomElement[];
    

    
    const removePath = position === 'top' 
      ? [...path, 0] 
      : [...path, tableChildren.length - 1];
    
    Transforms.removeNodes(editor, { at: removePath });
  };

  const addColumn = (position: 'left' | 'right') => {
    const path = ReactEditor.findPath(editor, element);
    const tableChildren = element.children as CustomElement[];
    
    const currentColumnCount = (tableChildren[0]?.children as CustomElement[])?.length || 0;
    

    if (currentColumnCount >= 10) {
      return;
    }
    
    tableChildren.forEach((row, rowIndex) => {
      const newCell: CustomElement = {
        type: 'table-cell',
        children: [{ text: '' }] as unknown as CustomText[],
      };
      
      const columnCount = (row.children as CustomElement[]).length;
      const insertPath = position === 'left'
        ? [...path, rowIndex, 0]
        : [...path, rowIndex, columnCount];
      
      Transforms.insertNodes(editor, newCell, { at: insertPath });
    });
  };

  const removeColumn = (position: 'left' | 'right') => {
    const path = ReactEditor.findPath(editor, element);
    const tableChildren = element.children as CustomElement[];
    
    
    tableChildren.forEach((row, rowIndex) => {
      const columnCount = (row.children as CustomElement[]).length;
      const removePath = position === 'left'
        ? [...path, rowIndex, 0]
        : [...path, rowIndex, columnCount - 1];
      
      Transforms.removeNodes(editor, { at: removePath });
    });
  };

  const addRowButton = (position: 'top' | 'bottom') => (
    <div 
      contentEditable={false}
      style={{ 
        display: 'flex', 
        justifyContent: 'center',
        padding: '2px',
        gap: '4px',
      }}
    >
      <button
        onClick={() => addRow(position)}
        style={{
          background: '#444',
          border: 'none',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#666'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#444'}
      >
        + Row
      </button>
      <button
        onClick={() => removeRow(position)}
        style={{
          background: '#c42b1c',
          border: 'none',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#d13438'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#c42b1c'}
      >
        ✕ Row
      </button>
      {position === 'top' && (
        <button
          onClick={deleteTable}
          style={{
            background: '#8b0000',
            border: 'none',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#a00000'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#8b0000'}
        >
          ✕ All Table
        </button>
      )}
    </div>
  );

  const addColumnButton = (position: 'left' | 'right') => (
    <div 
      contentEditable={false}
      style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '2px',
        gap: '4px',
      }}
    >
      <button
        onClick={() => addColumn(position)}
        style={{
          background: '#444',
          border: 'none',
          color: 'white',
          padding: '8px 2px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          writingMode: 'vertical-rl',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#666'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#444'}
      >
        + Col
      </button>
      <button
        onClick={() => removeColumn(position)}
        style={{
          background: '#c42b1c',
          border: 'none',
          color: 'white',
          padding: '8px 2px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          writingMode: 'vertical-rl',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#d13438'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#c42b1c'}
      >
        ✕ Col
      </button>
    </div>
  );

  return (
    <div {...attributes} style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}>
      <Popup
        content={addRowButton('top')}
        position="top"
        delay={100}
        interactive={true}
      >
        <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
          <Popup
            content={addColumnButton('left')}
            position="left"
            delay={100}
            interactive={true}
          >
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <Popup
                content={addColumnButton('right')}
                position="right"
                delay={100}
                interactive={true}
              >
                <div>
                  <Popup
                    content={addRowButton('bottom')}
                    position="bottom"
                    delay={100}
                    interactive={true}
                  >
                    <table style={{ borderCollapse: 'collapse', width: '80%', minWidth: '400px', maxWidth: '900px', tableLayout: 'fixed'}}>
                      <tbody>
                        {children}
                      </tbody>
                    </table>
                  </Popup>
                </div>
              </Popup>
            </div>
          </Popup>
        </div>
      </Popup>
    </div>
  );
};

export const insertTable = (editor: ReactEditor, rows: number = 2, cols: number = 2) => {
  const tableRows: CustomElement[] = [];
  
  for (let i = 0; i < rows; i++) {
    const cells: CustomElement[] = [];
    for (let j = 0; j < cols; j++) {
      cells.push({
        type: 'table-cell',
        children: [{ text: '' }],
      } as CustomElement);
    }
    tableRows.push({
      type: 'table-row',
      children: cells as unknown as CustomText[],
    } as CustomElement);
  }
  
  const table: CustomElement = {
    type: 'table',
    children: tableRows as unknown as CustomText[],
  };
  
  editor.insertNode(table);
};
