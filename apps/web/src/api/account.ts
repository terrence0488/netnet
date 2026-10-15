import {
  canonicalTimeZone,
  type AccountDeletion,
  type Geo,
  type ProfilePatch,
  type ProfileView,
} from '@netnet/contracts';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { browserTimeZone } from './auth';
import { api, isApiError } from './client';

/**
 * The signed-in person (architecture §7.2): `GET /api/me` is the session as the app sees it. No
 * session reads as null, not as an error, so a screen can tell "signed out" from "something
 * failed". `PATCH /api/me` answers with the profile, which replaces the cached one.
 */

export const ME_KEY = ['me'] as const;

/** The profile, or null when nobody is signed in. */
export type Me = ProfileView | null;

async function fetchMe(signal: AbortSignal): Promise<Me> {
  try {
    return await api.get<ProfileView>('/me', { signal });
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) return null;
    throw error;
  }
}

export const meQuery = queryOptions({
  queryKey: ME_KEY,
  queryFn: ({ signal }) => fetchMe(signal),
});

export function useMe() {
  return useQuery(meQuery);
}

/** Asks the server again who is signed in, as after signing in or up; resolves with the answer. */
export function refreshMe(client: QueryClient): Promise<Me> {
  return client.fetchQuery({ ...meQuery, staleTime: 0 });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => api.patch<ProfileView>('/me', patch),
    onSuccess: (me) => client.setQueryData(ME_KEY, me),
  });
}

/**
 * Deletes the account (`DELETE /api/account`, PRD J10): everything erased within
 * `erasedWithinDays`. Needs a sign-in from the last 10 minutes (`REAUTH_REQUIRED` otherwise).
 */
export function deleteAccount(): Promise<AccountDeletion> {
  return api.del<AccountDeletion>('/account');
}

/**
 * Sends the browser's time zone whenever it differs from the profile's (P1-T11), once per zone per
 * page load, so a failed attempt is not repeated in a loop. Nothing is shown either way.
 */
export function useTimeZoneSync(me: ProfileView): void {
  const { mutate } = useUpdateMe();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    const reported = browserTimeZone();
    const zone = reported ? canonicalTimeZone(reported) : null;
    if (zone === null || zone === me.timeZone || sent.current === zone) return;
    sent.current = zone;
    mutate({ timeZone: zone });
  }, [me.timeZone, mutate]);
}

/** The country the request came from, by our own CDN's lookup (PRD §2.3 rule 2), or null. */
export const geoQuery = queryOptions({
  queryKey: ['geo'] as const,
  queryFn: ({ signal }) => api.get<Geo>('/geo', { signal }),
  staleTime: Infinity,
});
