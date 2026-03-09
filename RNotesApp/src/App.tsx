import "./App.css";
import Editor from "./Editor"
import UpdateChecker from "./components/UpdateChecker"


function App() {


  return (
    <main className="container">
      <UpdateChecker />
      <Editor/>
    </main>
  );
}

export default App;
