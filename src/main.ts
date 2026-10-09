import { startApp } from "./ui/app.ts";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
void startApp(root);
