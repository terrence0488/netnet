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

/* The agents the "Connect to agent" button cycles through, in this order, one every two
   seconds. Each one's logo is agents/<id>.svg (see agents/README.md). */
const ROLL = ['chatgpt', 'claude', 'grok', 'muse'];

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

  /* DRAFT, unverified: listed at the Founder's request. Before launch, confirm each app
     accepts a custom remote MCP connector, then replace these generic steps with its own. */
  grok: {
    name: 'Grok',
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
  muse: {
    name: 'Muse',
    deepLink: null,
    guides: {
      computer: [
        { text:'In Muse’s settings, find where you add a **custom connector**.' },
        { text:'Add one named NetNet, with this address:', url:true },
        { text:'Approve it, then press **Allow** on the NetNet page that opens.' }
      ],
      phone: [
        { text:'In the Muse app’s settings, find where you add a **custom connector**.' },
        { text:'Add one named NetNet, with this address:', url:true },
        { text:'Approve it, then tap **Allow** on the NetNet page that opens.' }
      ]
    }
  }
};
