import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { playMechanicalClick } from "./hooks/use-mechanical-click";

document.addEventListener("mousedown", playMechanicalClick);

createRoot(document.getElementById("root")!).render(<App />);
