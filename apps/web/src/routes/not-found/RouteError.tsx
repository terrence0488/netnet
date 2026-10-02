import { useRouteError } from 'react-router';
import { ErrorState } from '../../components/ErrorState';

/** A screen that failed to render: plain words and a way on, never the error itself (J5). */
export function RouteError() {
  const error = useRouteError();
  return <ErrorState error={error} onRetry={() => window.location.reload()} />;
}
