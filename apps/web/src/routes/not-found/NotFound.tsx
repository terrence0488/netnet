import { Link } from 'react-router';
import { buttonClass } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';

/** An address inside /app that is no screen: say so, and offer the way back. */
export function NotFound() {
  return (
    <ErrorState
      title="This page isn’t here."
      detail="Check the address, or go back to Home."
      action={
        <Link to="/" className={buttonClass('primary')}>
          Go to Home
        </Link>
      }
    />
  );
}
