import { useState, useCallback } from "react";
import "./App.css";
import Editor from "./Editor"
import UpdateChecker from "./components/UpdateChecker"
import SplashScreen from "./components/SplashScreen"
import { AlertProvider } from "./components/Notice"


function App() {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <AlertProvider>
      <main className="container">
        {showSplash && <SplashScreen onDone={handleSplashDone} />}
        <UpdateChecker />
        <Editor/>
      </main>
    </AlertProvider>
  );
}

export default App;
