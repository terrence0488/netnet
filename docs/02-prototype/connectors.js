/* NetNet prototype — agent clients and their setup guides (PRD J5, §9.6 item 22).

   DATA, NOT CODE, like packs.js. In the product this is content a human admin edits
   in the admin portal (§9.6 item 17), because the clients' own screens change without
   notice. Until that portal exists, the screenshots are files in `connect/`, named
   <client>-<platform>-<step>.png; a missing one shows a placeholder with its name.

   Step text and screenshots must be checked against the live apps before launch.
   The text here is a draft, written to be corrected by the screenshots. */

const MCP_URL = 'https://netnet.app/mcp';

/* The first message a user sends their agent. Short on purpose: NetNet's MCP layer
   supplies the country's checklist and the fact questions, so the prompt needs to
   say only what to do, not what to ask. */
const START_PROMPT = 'Help me set up NetNet. Ask me what I have, one thing at a time — round ' +
  'numbers are fine — and add it for me.';

/* Asked from Home when holdings are out of date. Carries no data: the agent finds
   what is stale itself, through the MCP layer. */
const REFRESH_PROMPT = 'Some of my NetNet holdings are out of date. Find them and help me update them.';

/* Muse adds connectors by being asked in the chat, so its first step is a message to send. */
const MUSE_ASK = `Add a custom connector called NetNet. Its MCP server is ${MCP_URL}, and it signs in with OAuth.`;

/* The agents the "Connect to agent" button cycles through, in this order, one every two
   seconds. Each one's logo is agents/<id>.svg (see agents/README.md). At launch: ChatGPT and
   Claude, plus "Other agent" in the list (PRD J5, §9.7 row 29). */
const ROLL = ['chatgpt', 'claude'];

const CLIENTS = {
  claude: {
    name: 'Claude',
    /* Opens the client with the prompt already typed, where the client supports it.
       null: the user copies the prompt instead. */
    deepLink: 'https://claude.ai/new?q=',
    guides: {
      computer: [
        { text:'In Claude, open **Settings → Connectors**.' },
        { text:'Choose **Add custom connector**. Name it NetNet and paste this address:', url:true },
        { text:'Press **Connect**, then **Allow** on the NetNet page that opens.' }
      ],
      phone: [
        { text:'In the Claude app, open **Settings → Connectors**.' },
        { text:'Tap **Add custom connector**. Name it NetNet and paste this address:', url:true },
        { text:'Tap **Connect**, then **Allow** on the NetNet page that opens.' }
      ]
    }
  },
  chatgpt: {
    name: 'ChatGPT',
    deepLink: 'https://chatgpt.com/?q=',
    guides: {
      computer: [
        { text:'In ChatGPT, open **Settings → Connectors** and choose **Create**.' },
        { text:'Name it NetNet, paste this address, and choose **OAuth**:', url:true },
        { text:'Press **Create**, then **Allow** on the NetNet page that opens.' }
      ],
      phone: [
        { text:'In the ChatGPT app, open **Settings → Connectors** and tap **Create**.' },
        { text:'Name it NetNet, paste this address, and choose **OAuth**:', url:true },
        { text:'Tap **Create**, then **Allow** on the NetNet page that opens.' }
      ]
    }
  },

  /* PARKED until after launch (PRD §9.7 row 29; Founder, 2026-09-27): kept as content, never
     offered. `parked` keeps a client out of every list and every route; delete the flag to offer it.
     DRAFT, unverified: before offering it, confirm Grok accepts a custom remote MCP connector,
     then replace these generic steps with its own. */
  grok: {
    name: 'Grok',
    parked: true,
    deepLink: null,
    guides: {
      computer: [
        { text:'In Grok’s settings, find where you add a **custom connector**.' },
        { text:'Add one named NetNet, with this address:', url:true },
        { text:'Approve it, then press **Allow** on the NetNet page that opens.' }
      ],
      phone: [
        { text:'In the Grok app’s settings, find where you add a **custom connector**.' },
        { text:'Add one named NetNet, with this address:', url:true },
        { text:'Approve it, then tap **Allow** on the NetNet page that opens.' }
      ]
    }
  },
  /* Meta's Muse (launched 8 Sep 2026: iOS, Android, muse.ai, macOS, WhatsApp; US only so
     far, with no date for Singapore, Malaysia or the UK). The app has no connector settings
     screen: you ask Muse in the chat and it builds a custom connector from an MCP address.
     OAuth sign-in works, by early testers' accounts with some back-and-forth. Meta's connector
     directory (open to developers since 18 Sep) takes an MCP server with OAuth; a NetNet
     listing there would replace these steps with Muse's own one-tap add. Check against the
     live app before launch. */
  /* PARKED until after launch, like Grok. */
  muse: {
    name: 'Muse',
    parked: true,
    deepLink: null,
    guides: {
      computer: [
        { text:'In Muse, send this message:', ask:MUSE_ASK },
        { text:'Muse sets up the connector and tests it. When it asks you to sign in, open the link it gives you.' },
        { text:'Press **Allow** on the NetNet page that opens.' }
      ],
      phone: [
        { text:'In the Muse app, send this message:', ask:MUSE_ASK },
        { text:'Muse sets up the connector and tests it. When it asks you to sign in, tap the link it gives you.' },
        { text:'Tap **Allow** on the NetNet page that opens.' }
      ]
    }
  },

  /* Any agent that can add a remote MCP server with sign-in (OAuth). No platform split,
     no screenshots: we cannot know its screens, so the guide is the address and the idea.
     In the product, NetNet's approval page and the Agent tab show the name the agent
     registers with; the prototype calls it "Your agent". */
  other: {
    name: 'Your agent',
    label: 'Other agent',
    generic: true,
    deepLink: null,
    guides: {
      any: [
        { text:'In your agent’s settings, add a **custom connector**. It may be called an MCP server, a tool or an integration.' },
        { text:'Name it NetNet and use this address:', url:true },
        { text:'Approve it, then press **Allow** on the NetNet page that opens.' }
      ]
    }
  }
};
