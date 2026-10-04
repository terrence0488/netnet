import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';

/**
 * A local stand-in for the web servers agents host their Client ID Metadata Documents on: an
 * in-process server answering the CIMD fetch, so no test reaches the network. It refuses what the
 * real transport refuses before it would connect (a non-HTTPS URL), records what was fetched, and
 * serves whatever a test puts at a URL, too large or of the wrong type included.
 */
export interface ServedDocument {
  body: string;
  status?: number;
  contentType?: string;
}

export class FakeMetadataServer {
  readonly documents = new Map<string, ServedDocument>();
  readonly fetched: string[] = [];

  /** Serves `document` as JSON at `url`. */
  serve(url: string, document: unknown): void {
    this.documents.set(url, { body: JSON.stringify(document) });
  }

  readonly fetch: ClientMetadataResourceFetch = (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('https://')) throw new TypeError('CIMD transport requires an HTTPS URL');
    this.fetched.push(url);
    const served = this.documents.get(url);
    if (!served) return new Response('Not found', { status: 404 });
    return new Response(served.body, {
      status: served.status ?? 200,
      headers: { 'Content-Type': served.contentType ?? 'application/json' },
    });
  };
}

/** A CIMD document as a client publishes it, for `clientId` (its own URL). Fictional. */
export function metadataDocument(
  clientId: string,
  name: string,
  redirectUris: string[],
): Record<string, unknown> {
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}
