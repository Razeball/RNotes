

export type MiscellaneousbarProps = {
    children?: React.ReactNode
    loadDocumentName: (name: string) => void
    documentName: string
}
export default function Miscellaneousbar({children, loadDocumentName, documentName} : MiscellaneousbarProps) {
  return (
    <div className="miscellaneousbar">
      <div className="misc-image">
        <img src="Document.svg" alt="" style={{width: "64px", height:"64px"}}/>
      </div>
      <div className="document-name">
        <input type="text" value={documentName} onChange={(e) => {
            loadDocumentName(e.target.value)
        }}/>
      </div>
      <div style={{display: "flex", background: "#2f2f2f", padding: "4px", borderRadius: "8px", gap: "4px", marginTop: "8px"}}>
        {children}
      </div>
    </div>
  );
}
