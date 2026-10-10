import './styles/app.css';
import { App } from './app';

const root = document.getElementById('app')!;
const app = new App(root);
(window as any).bncApp = app; // handy for debugging in DevTools

app.init().catch((e) => {
  console.error(e);
  root.textContent = `BNC Docs failed to start: ${e?.message ?? e}`;
});
