import type { AgentGuide } from '@netnet/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentGuidesQuery, guideFor } from './queries';

const CLAUDE: AgentGuide = {
  id: 'claude',
  name: 'Claude',
  logo: 'images/agents/claude.svg',
  listed: true,
  order: 1,
  platforms: { computer: { steps: [{ text: 'Open Settings.' }] } },
};

const CHATGPT: AgentGuide = {
  id: 'chatgpt',
  name: 'ChatGPT',
  logo: 'images/agents/chatgpt.svg',
  listed: false,
  order: 2,
  platforms: { computer: { steps: [{ text: 'Open Settings.' }] } },
};

const OTHER: AgentGuide = {
  id: 'other',
  name: 'Other agent',
  listed: true,
  order: 3,
  platforms: { any: { steps: [{ text: 'Add a connector.' }] } },
};

const DOCS: Readonly<Record<string, AgentGuide>> = {
  claude: CLAUDE,
  chatgpt: CHATGPT,
  other: OTHER,
};

describe('agentGuidesQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads every agent document at its live version: listed only, in order', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        seen.push(url);
        const body = url.endsWith('/content/current')
          ? { agent: { other: 1, claude: 4, chatgpt: 2 } }
          : (DOCS[url.split('/content/agent/')[1]?.split('@')[0] ?? ''] ?? null);
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: body === null ? 404 : 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );
    const queryFn = agentGuidesQuery.queryFn;
    if (!queryFn) throw new Error('The guides query has no queryFn.');
    const guides = await queryFn({ signal: undefined } as never);
    // ChatGPT stays unlisted until NetNet is in OpenAI's directory (PRD J5).
    expect(guides.map((guide) => guide.id)).toStrictEqual(['claude', 'other']);
    expect(seen).toContain('/api/content/agent/claude@4');
  });
});

describe('guideFor', () => {
  it('finds the guide a classification names, or nothing', () => {
    expect(guideFor([CLAUDE, OTHER], 'claude')).toBe(CLAUDE);
    expect(guideFor([CLAUDE, OTHER], 'chatgpt')).toBeNull();
  });
});
