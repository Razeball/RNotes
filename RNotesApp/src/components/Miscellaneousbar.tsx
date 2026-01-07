import { useState } from "react";

export type MiscellaneousbarProps = {
    children?: React.ReactNode
}
export default function Miscellaneousbar({children} : MiscellaneousbarProps) {
    const [documentName, setDocumentName] = useState("Document");
  return (
    <div className="miscellaneousbar">
      <div className="misc-image">
        <img src="Document.svg" alt="" style={{width: "64px", height:"64px"}}/>
      </div>
      <div className="document-name">
        <input type="text" value={documentName} onChange={(e) => setDocumentName(e.target.value)}/>
      </div>
      <div style={{display: "flex", background: "#2f2f2f", padding: "4px", borderRadius: "8px", gap: "4px", marginTop: "8px"}}>
        {children}
      </div>
    </div>
  );
}
