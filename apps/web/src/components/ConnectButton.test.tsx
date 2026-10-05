import type { AgentGuide } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { QueryProvider } from '../api/query';
import { GUIDES_KEY } from '../routes/agent/queries';
import {
  AgentLogo,
  AgentRoll,
  AlternativeRoute,
  ConnectButton,
  contentImageUrl,
  listNames,
} from './ConnectButton';

const CLAUDE: AgentGuide = {
  id: 'claude',
  name: 'Claude',
  logo: 'images/agents/claude.svg',
  listed: true,
  order: 1,
  platforms: { computer: { steps: [{ text: 'Open Settings.' }] } },
};

const OTHER: AgentGuide = {
  id: 'other',
  name: 'Other agent',
  listed: true,
  order: 3,
  platforms: { any: { steps: [{ text: 'Add a connector.' }] } },
};

/** Renders with the guides already known, as the app knows them after one request. */
function render(node: ReactNode, guides: AgentGuide[] = [CLAUDE, OTHER]): string {
  const client = new QueryClient();
  client.setQueryData(GUIDES_KEY, guides);
  return renderToStaticMarkup(
    <QueryProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryProvider>,
  );
}

describe('contentImageUrl', () => {
  it('serves a content image as the static file at /content/… (architecture §7.1)', () => {
    expect(contentImageUrl('images/agents/claude.svg')).toBe('/content/images/agents/claude.svg');
  });
});

describe('listNames', () => {
  it('joins none, one, two and three names as a sentence does', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Claude'])).toBe('Claude');
    expect(listNames(['ChatGPT', 'Claude'])).toBe('ChatGPT and Claude');
    expect(listNames(['ChatGPT', 'Claude', 'Grok'])).toBe('ChatGPT, Claude and Grok');
  });
});

describe('AgentLogo', () => {
  it('draws a listed guide’s logo file, hidden from screen readers', () => {
    const markup = renderToStaticMarkup(<AgentLogo guide={CLAUDE} />);
    expect(markup).toContain('src="/content/images/agents/claude.svg"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('draws the generic agent icon for a guide with no logo file', () => {
    const markup = renderToStaticMarkup(<AgentLogo guide={OTHER} />);
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('<img');
  });
});

describe('AgentRoll', () => {
  it('shows the generic icon first, then each listed logo, hidden from screen readers', () => {
    const markup = renderToStaticMarkup(<AgentRoll guides={[CLAUDE, OTHER]} />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-testid="agent-roll"');
    // The generic face is on; the logo-less guide adds no face of its own.
    expect(markup.match(/<i class="[^"]*on[^"]*">/g)).toHaveLength(1);
    expect(markup.match(/<i /g)).toHaveLength(2);
    expect(markup).toContain('/content/images/agents/claude.svg');
  });
});

describe('ConnectButton', () => {
  it('is one link to the flow, whose icon screen readers never hear', () => {
    const markup = render(<ConnectButton entry="agent" />);
    expect(markup).toContain('href="/agent/connect?entry=agent"');
    expect(markup).toContain('Connect to agent');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('starts the flow where the empty Home began', () => {
    expect(render(<ConnectButton entry="home" />)).toContain('href="/agent/connect?entry=home"');
  });
});

describe('AlternativeRoute', () => {
  it('names the listed agents below a rule, then the button', () => {
    const markup = render(<AlternativeRoute entry="home" />);
    expect(markup).toContain('Let your AI agent do this');
    expect(markup).toContain('Works with Claude, or any agent that supports MCP.');
    expect(markup).toContain('Connect to agent');
  });

  it('stays generic while the guides load', () => {
    const markup = render(<AlternativeRoute entry="agent" />, []);
    expect(markup).toContain('Works with any agent that supports MCP.');
  });
});
