import { describe, expect, it } from 'vitest';
import { signedQuery } from './approval';
import { classify, classifyingHost, guideHostsFrom, hostOf, type GuideHosts } from './classify';
import type { ContentStore } from '../content/store';

/** The guides' hosts as content/agents has them (the integration tests read the files). */
const GUIDES: GuideHosts[] = [
  { client: 'claude', hosts: ['claude.ai', 'claude.com', 'anthropic.com'] },
  { client: 'chatgpt', hosts: ['chatgpt.com', 'openai.com'] },
];

describe('classify()', () => {
  it.each([
    // The P1 spike's clients: Claude's CIMD URL, and OpenAI's Codex (unlisted ChatGPT guide).
    ['cimd', 'https://claude.ai/oauth/mcp-oauth-client-metadata', '', 'claude'],
    [
      'cimd',
      'https://claude.ai/oauth/claude-code-client-metadata',
      'http://127.0.0.1/cb',
      'claude',
    ],
    ['cimd', 'https://chatgpt.com/oauth/codex/client.json', 'http://localhost:1455/cb', 'chatgpt'],
    [
      'cimd',
      'https://agent.example/client.json',
      'https://claude.ai/api/mcp/auth_callback',
      'other',
    ],
    ['dcr', 'ab12', 'https://claude.ai/api/mcp/auth_callback', 'claude'],
    ['dcr', 'ab12', 'https://chatgpt.com/connector_platform_oauth_redirect', 'chatgpt'],
    ['dcr', 'ab12', 'https://platform.openai.com/cb', 'chatgpt'],
    ['dcr', 'ab12', 'http://127.0.0.1:43123/callback', 'other'],
    ['dcr', 'ab12', 'https://notclaude.ai/cb', 'other'],
    ['dcr', 'ab12', 'https://claude.ai.agent.example/cb', 'other'],
    ['dcr', 'ab12', 'not a url', 'other'],
  ] as const)('%s %s returning to %s is %s', (registration, clientId, redirectUri, expected) => {
    expect(classify(classifyingHost(registration, clientId, redirectUri), GUIDES)).toBe(expected);
  });

  it('is other when no guide is published', () => {
    expect(classify('claude.ai', [])).toBe('other');
  });

  it('reads hosts case-insensitively, with a trailing dot', () => {
    expect(hostOf('https://Claude.AI/x')).toBe('claude.ai');
    expect(classify('claude.ai.', GUIDES)).toBe('claude');
  });
});

describe('guideHostsFrom()', () => {
  const store = (agents: Record<string, unknown>, fail = false) =>
    ({
      currentVersions: () =>
        fail
          ? Promise.reject(new Error('down'))
          : Promise.resolve({ agent: Object.fromEntries(Object.keys(agents).map((k) => [k, 1])) }),
      getCurrent: (_kind: string, key: string) =>
        Promise.resolve({ version: 1, body: agents[key] }),
    }) as unknown as ContentStore;

  it('takes the named guides’ hosts, unlisted ones included, and ignores the rest', async () => {
    const load = guideHostsFrom(() =>
      store({
        claude: { id: 'claude', listed: true, matchHosts: ['claude.ai'] },
        chatgpt: { id: 'chatgpt', listed: false, matchHosts: ['chatgpt.com'] },
        other: { id: 'other', listed: true },
        grok: { id: 'grok', listed: false, matchHosts: ['x.ai'] },
      }),
    );
    expect(await load()).toEqual([
      { client: 'claude', hosts: ['claude.ai'] },
      { client: 'chatgpt', hosts: ['chatgpt.com'] },
    ]);
  });

  it('gives no hosts, so everything is other, when content cannot be read', async () => {
    expect(await guideHostsFrom(() => store({}, true))()).toEqual([]);
  });
});

describe('signedQuery()', () => {
  it('keeps the signature, the list of signed names and those parameters only', () => {
    const query =
      '?client_id=abc&scope=ledger.read&extra=1&exp=9&sig=s1&ba_param=client_id&ba_param=exp&ba_param=scope&ba_param=ba_param';
    expect(signedQuery(query)).toBe(
      'client_id=abc&scope=ledger.read&exp=9&sig=s1&ba_param=client_id&ba_param=exp&ba_param=scope&ba_param=ba_param',
    );
  });

  it('is null without a signature or the list of signed names', () => {
    expect(signedQuery('client_id=abc&ba_param=client_id')).toBeNull();
    expect(signedQuery('client_id=abc&sig=s1')).toBeNull();
  });
});
