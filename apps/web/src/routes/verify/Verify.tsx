import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ME_KEY, useMe } from '../../api/account';
import { Waiting } from '../../app/guards';
import { AuthFrame, ResendLink, authStyles, buttonClass } from '../../components';

/**
 * Where the verification email's link lands (`?error=…` when it did not verify). Verifying blocks
 * nothing in the app; it is what connecting an agent asks for first (PRD J1, J5). Signed in or
 * not, the next step is one tap away.
 */
export function Verify() {
  const [params] = useSearchParams();
  const client = useQueryClient();
  const me = useMe();
  const failed = params.has('error');

  // The address may have been verified a moment ago: ask again rather than trust the cache.
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ME_KEY });
  }, [client]);

  const carryOn = (
    <div className={authStyles.actions}>
      <Link to="/" className={buttonClass('primary', true)}>
        Continue
      </Link>
    </div>
  );

  if (!failed) {
    return (
      <AuthFrame title="Your email is verified">
        <p className={authStyles.body}>Carry on where you left off.</p>
        {carryOn}
      </AuthFrame>
    );
  }

  if (me.data === undefined && me.isPending) {
    return (
      <AuthFrame title="That link didn’t work">
        <Waiting />
      </AuthFrame>
    );
  }

  if (me.data?.emailVerified) {
    return (
      <AuthFrame title="Your email is already verified">
        <p className={authStyles.body}>There’s nothing more to do.</p>
        {carryOn}
      </AuthFrame>
    );
  }

  if (me.data) {
    return (
      <AuthFrame title="That link didn’t work">
        <p className={authStyles.body}>
          It may have expired: links last a day.{' '}
          <ResendLink
            email={me.data.email}
            label="Send a new link"
            sent={`A new link is on its way to ${me.data.email}.`}
          />
        </p>
        {carryOn}
      </AuthFrame>
    );
  }

  if (me.data === null) {
    return (
      <AuthFrame title="That link didn’t work">
        <p className={authStyles.body}>
          It may have expired: links last a day. Log in, and you can ask for a new one from Account.
        </p>
        <div className={authStyles.actions}>
          <Link to="/login?next=%2Faccount" className={buttonClass('primary', true)}>
            Log in
          </Link>
        </div>
      </AuthFrame>
    );
  }

  // Who is signed in could not be asked (no network, say): the app's own screens take it from here.
  return (
    <AuthFrame title="That link didn’t work">
      <p className={authStyles.body}>It may have expired: links last a day.</p>
      {carryOn}
    </AuthFrame>
  );
}
