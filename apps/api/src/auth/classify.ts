import type { AgentGuide } from '@netnet/contracts';
import type { ContentStore } from '../content/store';
import { log } from '../lib/log';

/**
 * Which client a connection is (architecture §3): `claude`, `chatgpt` or `other`, never the name
 * an agent registered with, which is free text the agent chose. A CIMD client is classified by its
 * client id URL's host, a DCR client by the host of the redirect URI it used, against the
 * `matchHosts` of the named guides, unlisted ones included. Anything unmatched is `other`.
 */
export type Client = 'claude' | 'chatgpt' | 'other';
export type Registration = 'cimd' | 'dcr';

/** A named guide's hosts. A host also matches its subdomains. */
export interface GuideHosts {
  client: Exclude<Client, 'other'>;
  hosts: readonly string[];
}

/** Reads the guides' hosts; a failure classifies everything `other` rather than refusing. */
export type LoadGuideHosts = () => Promise<readonly GuideHosts[]>;

const NAMED = new Set<string>(['claude', 'chatgpt']);

/** The host of `url`, lowercase, or null when it is not an absolute URL. */
export function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '' ? null : host;
  } catch {
    return null;
  }
}

/** The host a connection is classified by: the CIMD URL's, or the DCR redirect URI's. */
export function classifyingHost(
  registration: Registration,
  clientId: string,
  redirectUri: string,
): string | null {
  return hostOf(registration === 'cimd' ? clientId : redirectUri);
}

export function classify(host: string | null, guides: readonly GuideHosts[]): Client {
  if (host === null) return 'other';
  const name = host.replace(/\.$/, '');
  for (const guide of guides) {
    for (const match of guide.hosts) {
      const h = match.toLowerCase();
      if (name === h || name.endsWith(`.${h}`)) return guide.client;
    }
  }
  return 'other';
}

/** The live agent guides' hosts, from published content (§6.5). */
export function guideHostsFrom(store: () => ContentStore): LoadGuideHosts {
  return async () => {
    try {
      const keys = Object.keys((await store().currentVersions()).agent ?? {});
      const guides = await Promise.all(
        keys.map(async (key) => (await store().getCurrent('agent', key)).body as AgentGuide),
      );
      return guides.flatMap((guide) =>
        NAMED.has(guide.id) && guide.matchHosts !== undefined
          ? [{ client: guide.id as GuideHosts['client'], hosts: guide.matchHosts }]
          : [],
      );
    } catch {
      log('agent_guides_unavailable', { errorCode: 'INTERNAL' });
      return [];
    }
  };
}
