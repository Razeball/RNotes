import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import Editor from "./Editor"
import UpdateChecker from "./components/UpdateChecker"
import { AlertProvider } from "./components/Notice"


function App() {
  // Tell the splash window when the app is ready
  useEffect(() => {
    invoke("main_window_ready").catch(() => {});
  }, []);

  return (
    <AlertProvider>
      <main className="container">
        <UpdateChecker />
        <Editor/>
      </main>
    </AlertProvider>
  );
}

export default App;
