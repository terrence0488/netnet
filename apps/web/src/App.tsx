import type { QueryClient } from '@tanstack/react-query';
import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { QueryProvider } from './api/query';
import { ToastProvider } from './components/Toast';

/** The providers every screen relies on, around the router. */
export function App({ client, router }: { client: QueryClient; router: DataRouter }) {
  return (
    <QueryProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryProvider>
  );
}
