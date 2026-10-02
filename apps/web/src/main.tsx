import '@netnet/tokens/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createQueryClient } from './api/query';
import { createRouter } from './app/routes';

// The shell decides where a screen starts (the top, design-system §7), so the browser's own
// restoring of an old position on Back never lands a reader halfway down a new screen.
window.history.scrollRestoration = 'manual';

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <App client={createQueryClient()} router={createRouter()} />
  </StrictMode>,
);
