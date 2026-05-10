import { useState, useCallback } from "react";
import "./App.css";
import Editor from "./Editor"
import UpdateChecker from "./components/UpdateChecker"
import SplashScreen from "./components/SplashScreen"


function App() {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <main className="container">
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      <UpdateChecker />
      <Editor/>
    </main>
  );
}

export default App;
