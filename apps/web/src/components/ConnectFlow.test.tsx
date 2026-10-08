import type { AgentGuide, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { ME_KEY } from '../api/account';
import { BASENAME, routes } from '../app/routes';
import { GUIDES_KEY } from '../routes/agent/queries';
import {
  connectorUrl,
  detectPlatform,
  entryPath,
  failureCopy,
  findAddressStep,
  parseEntry,
  parseGuideClient,
  stepText,
} from './ConnectFlow';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
};

const CLAUDE: AgentGuide = {
  id: 'claude',
  name: 'Claude',
  logo: 'images/agents/claude.svg',
  listed: true,
  order: 1,
  platforms: {
    phone: {
      steps: [
        { text: 'In the Claude app, open **Settings → Connectors**.' },
        {
          text: 'Tap **Add custom connector**. Name it NetNet and paste NetNet’s connector address.',
        },
        { text: 'Tap **Connect**, then **Allow** on the NetNet page that opens.' },
      ],
    },
    computer: {
      steps: [
        { text: 'In Claude, open **Settings → Connectors**.' },
        {
          text: 'Choose **Add custom connector**. Name it NetNet and paste NetNet’s connector address.',
        },
        { text: 'Press **Connect**, then **Allow** on the NetNet page that opens.' },
      ],
    },
  },
};

const OTHER: AgentGuide = {
  id: 'other',
  name: 'Other agent',
  listed: true,
  order: 3,
  platforms: {
    any: {
      steps: [
        { text: 'In your agent’s settings, add a **custom connector**.' },
        { text: 'Name it NetNet and use NetNet’s connector address.' },
        { text: 'Approve it, then press **Allow** on the NetNet page that opens.' },
      ],
    },
  },
};

/** Renders a path with the person and the guides already known. */
function render(
  path: string,
  me: ProfileView | null = PERSON,
  guides: AgentGuide[] = [CLAUDE, OTHER],
): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, me);
  client.setQueryData(GUIDES_KEY, guides);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: [path],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('parseEntry and entryPath', () => {
  it('reads the flow’s entry, defaulting to the Agent tab’s', () => {
    expect(parseEntry('home')).toBe('home');
    expect(parseEntry('agent')).toBe('agent');
    expect(parseEntry('onboarding')).toBe('onboarding');
    expect(parseEntry(null)).toBe('agent');
    expect(parseEntry('holding')).toBe('agent');
  });

  it('returns Back to where the flow began', () => {
    expect(entryPath('home')).toBe('/');
    expect(entryPath('agent')).toBe('/agent');
    expect(entryPath('onboarding')).toBe('/onboarding/start');
  });
});

describe('detectPlatform', () => {
  it('shows the computer steps with no window (the server)', () => {
    expect(detectPlatform()).toBe('computer');
  });
});

describe('connectorUrl', () => {
  it('is the origin plus /mcp (architecture §7.1)', () => {
    expect(connectorUrl('https://netnet.example')).toBe('https://netnet.example/mcp');
  });
});

describe('parseGuideClient', () => {
  it('accepts the clients the API takes, and nothing else', () => {
    expect(parseGuideClient('claude')).toBe('claude');
    expect(parseGuideClient('chatgpt')).toBe('chatgpt');
    expect(parseGuideClient('other')).toBe('other');
    expect(parseGuideClient('grok')).toBeNull();
  });
});

describe('stepText', () => {
  it('renders the guides’ **bold** runs, escaping the rest', () => {
    const markup = renderToStaticMarkup(<p>{stepText('Open **Settings → Connectors** <now>.')}</p>);
    expect(markup).toContain('<b>Settings → Connectors</b>');
    expect(markup).toContain('&lt;now&gt;');
  });

  it('leaves plain text alone', () => {
    expect(stepText('Add a connector.')).toBe('Add a connector.');
  });
});

describe('findAddressStep', () => {
  it('finds the step that names the connector address, or -1', () => {
    const steps = CLAUDE.platforms.computer?.steps ?? [];
    expect(findAddressStep(steps)).toBe(1);
    expect(findAddressStep([{ text: 'Open Settings.' }])).toBe(-1);
  });
});

describe('failureCopy', () => {
  it('says each cause in plain language, with a next step and never a code', () => {
    const causes = [
      'cancelled',
      'invalid_request',
      'token_rejected',
      'timed_out',
      undefined,
    ] as const;
    for (const cause of causes) {
      const copy = failureCopy(cause);
      expect(copy.title).toBeTruthy();
      expect(copy.detail).toMatch(/try again|whenever you’re ready/i);
      expect(`${copy.title} ${copy.detail}`).not.toMatch(/\w_\w/);
    }
    expect(failureCopy('cancelled').detail).toContain('pressed Cancel');
    expect(failureCopy('timed_out').detail).toContain('15 minutes');
  });
});

describe('the choice', () => {
  it('lists every offered guide with its logo, Back to where the flow began', () => {
    const markup = render('/app/agent/connect?entry=agent');
    expect(markup).toContain('Which AI agent do you use?');
    expect(markup).toContain('/agent/connect/claude?entry=agent');
    expect(markup).toContain('/agent/connect/other?entry=agent');
    expect(markup).toContain('/content/images/agents/claude.svg');
    expect(markup).toContain('href="/app/agent"');
  });

  it('an agent that is not offered, even by its address: the list instead', () => {
    const markup = render('/app/agent/connect/chatgpt?entry=agent');
    expect(markup).toContain('Which AI agent do you use?');
    expect(markup).toContain('/agent/connect/claude?entry=agent');
  });

  it('returns the onboarding entry to the start screen', () => {
    const markup = render('/app/agent/connect?entry=onboarding');
    expect(markup).toContain('Which AI agent do you use?');
    expect(markup).toContain('/agent/connect/claude?entry=onboarding');
    expect(markup).toContain('href="/app/onboarding/start"');
  });
});

describe('the steps', () => {
  it('show the computer steps on a computer, with the address box and Copy', () => {
    const markup = render('/app/agent/connect/claude?entry=agent');
    expect(markup).toContain('Connect Claude');
    expect(markup).toContain('In Claude, open');
    expect(markup).toContain('<b>Connect</b>');
    expect(markup).toContain('/mcp');
    expect(markup).toContain('>Copy<');
    expect(markup).toContain('On a phone');
    expect(markup).toContain('On a computer');
  });

  it('“Other agent” has one set of steps, no platform switch and no screenshots', () => {
    const markup = render('/app/agent/connect/other?entry=home');
    expect(markup).toContain('Connect your agent');
    expect(markup).toContain('use NetNet’s connector address');
    expect(markup).not.toContain('On a phone');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('Screenshot coming soon');
    expect(markup).toContain('href="/app/agent/connect?entry=home"');
  });

  it('asks an unverified email to verify first, with resend', () => {
    const markup = render('/app/agent/connect/claude?entry=agent', {
      ...PERSON,
      emailVerified: false,
    });
    expect(markup).toContain('Verify your email first');
    expect(markup).toContain('avery@example.com');
    expect(markup).toContain('Resend the link');
    expect(markup).not.toContain('On a computer');
  });
});
