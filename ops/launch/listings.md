# The directory listings

Everything NetNet needs to be found where MCP users look for connectors (plan G-D2): Claude's
connector directory, OpenAI's apps directory, the official MCP Registry and the public lists. The
text, assets and steps are ready. **Nothing has been submitted, nothing has been paid, and no
account has been created for a directory.** Submitting waits for F23 (the privacy policy and terms
approved in legal review) and Stage 8; every submission step below is marked **after F23**. The task
brief is `docs/phases/P4/tasks/P4-T7.md`.

Each directory's requirements were read from its own published pages on **26 October 2026**, with
the URL beside them, because they change. A page that could not be read from this session says so
and is not guessed. Two facts are the Founder's and only the Founder's: the reviewers' test account
and the DNS record that proves `netnetapp.io` (see "What the Founder must do"). This file never
carries an address or a password; they go into each directory's own form, never the repo, an issue
or a chat.

The copy follows the landing page (`apps/landing/index.html`, P4-T2): PRD §2.5's line first, facts
not advice, the agent reads and writes with every change in Activity, and the privacy facts as the
landing states them. Tool descriptions are never retyped: the table at the end is
`pnpm listing:tools` output from `tools/list`.

## What goes in every form

| Field | Text | Notes |
| --- | --- | --- |
| Name | `NetNet` | One word, the brand. OpenAI forbids appending "MCP" or "Plugin"; neither appears. |
| One line | `Keeps where you stand — what you own and what you owe, in any currency — so your own AI agent answers from your real balance sheet.` | 131 characters: inside Claude's 200-character one-liner. |
| Short description | `Your balance sheet, readable by your own AI agent` | 49 characters, for OpenAI's `shortDescription` and the lists' subtitles. |
| Long description | below | 1,098 characters: inside Claude's 2,000-character description. |
| Categories | Finance; Productivity | One to five where the directory asks. `Finance` is in mcpservers.org's and Glama's published lists; Claude's and OpenAI's pickers are only in the signed-in form, so confirm the closest match there and do not invent a category. |
| Support contact | `hello@netnetapp.io` | **Founder check:** confirm the mailbox exists and is monitored before it goes in a form; if not, use the Founder's own monitored address. `EMAIL_FROM` already uses the `NetNet <hello@…>` pattern. |
| Website | `https://netnetapp.io` | The landing page is also the public documentation: it says what the connector does and how to connect. |
| Documentation | `https://netnetapp.io` | Claude accepts a blog post or help-centre article as public documentation. A public setup page would be new work; the in-app guide is behind sign-in, so do not link it as public docs. |
| Privacy policy | `https://netnetapp.io/privacy` | A draft until F23 approves it. |
| Terms | `https://netnetapp.io/terms` | A draft until F23 approves it. |
| Icon | `https://netnetapp.io/app/icons/icon-512.png` | 512×512 PNG, 17 KB, square, the tomato sparkle. On disk: `apps/web/public/icons/icon-512.png`. |
| Screenshots | `ops/launch/images/` | From P4-T1's demo household, taken from the locally running app on 26 October 2026. Details under "Assets". |
| Tools | the `tools/list` table at the end | Never retyped. `pnpm listing:tools --origin https://netnetapp.io --check` asks the deployed server. |

### The long description

> You can’t get useful advice from an AI that doesn’t know where you stand.
>
> NetNet keeps where you stand: what you own and what you owe, in any currency. Your own AI agent
> reads it, so a real question gets an answer from your real balance sheet. Ask whether you can
> afford a new car this year, or how exposed you are to the US dollar.
>
> NetNet does the arithmetic — what you could use, what’s locked, your currency exposure, what
> changed — and gives your agent the facts. The advice is your agent’s.
>
> Your agent can read your picture and write to it: holdings, values, types and tags. Every change
> you or your agent make shows in Activity.
>
> Your data is stored in Singapore and encrypted at rest. It is never sold; there are no ads and no
> tracking or advertising SDKs. Your agent reads a statement and sends NetNet the figures — the
> document never reaches us. Each agent you connect is confirmed by email and can be revoked at any
> time. Export everything whenever you like; delete your account and it is erased within 30 days.
> Everything NetNet does today is free, your agent’s reads and writes included.

### Assets

All three screenshots show only the fictional demo household (`content/demo/household.json`, P4-T1:
21 holdings, a home and a mortgage, a car and a car loan, four currencies). They were taken from the
local built app at `http://localhost:3107`, signed in as the fictional
`listing-demo@example.com` after `pnpm demo:load --env local --email …`. No name, email, avatar or
real figure is in them. The data is fictional and must stay so; re-shoot rather than edit a mockup.

| File | Pixels | Size | What it shows | Where it is used |
| --- | --- | --- | --- | --- |
| `netnet-home-1280.png` | 2560×1600 (2× of 1280×800) | 211 KB | Home: net worth, trend, allocation, position | A list's cover image, if its form asks for one; not used by Claude or OpenAI (below) |
| `netnet-insights-1280.png` | 2560×1600 (2× of 1280×800) | 156 KB | Insights: monthly growth, assets vs liabilities, distribution | A second screen, if a list takes more than one |
| `netnet-home-390.png` | 780×1688 (2× of 390×844) | 92 KB | Home on a phone | A phone view, if a list asks for one |
| `apps/web/public/icons/icon-512.png` | 512×512 | 17 KB | The app icon | Every directory's icon field |
| `apps/landing/public/og.png` | 1200×630 | 52 KB | Link preview | Launch-note unfurls, not a directory field |

- **Claude** asks for carousel screenshots only for an MCP App. NetNet returns tools, not an
  embedded UI, so it submits no carousel; the icon and the text are the assets.
- **OpenAI** no longer shows screenshots in the directory and says not to provide them when the
  plugin has no UI. It takes `logo` and `composerIcon` (square, at least 48×48, at most 5 MiB,
  PNG/JPEG/WebP/SVG); the 512×512 icon satisfies both.
- **The lists** publish no screenshot size on their submission pages; where a form asks for one
  image, use `netnet-home-1280.png`, and never a mockup.

## The reviewers' test account (Founder, before any submission)

The Founder creates a verified account on production from P4-T1's demo household and enters its
address and password in each directory's own form; never into the repo, an issue or a chat.

1. On production, sign up with an address the Founder controls for this purpose and verify it.
2. Load the fictional household into it:
   `pnpm demo:load --env production --email <that address>` (21 holdings, 686 values). The account
   must have no holding first; the loader refuses otherwise.
3. Enter the address and password only in the portal's reviewer-credentials field. Do not write
   them in this file, a commit, an issue, a PR or a chat message.
4. Keep the account and its data available through later reviews. Reviewer access must work
   without MFA, email or SMS codes, magic links or a private network: use a password sign-in.

The account is fully populated by the demo household, and every tool can be run against it. The
Founder should run the five positive cases below under it before submitting.

| # | Prompt | Tools expected | What a reviewer should see |
| --- | --- | --- | --- |
| 1 | How much could I use this month? | `get_financial_context` | The could-use total and what it is made of, from the demo household. |
| 2 | How exposed am I to the US dollar? | `get_financial_context` | Currency exposure with the USD share, not a recommendation. |
| 3 | What changed since last quarter? | `get_period_changes`, `get_net_worth_history` | Per-period change with the holdings that drove it. |
| 4 | Add a value of S$1,230 for the renovation loan, dated 31 May 2025. | `record_values` | The value written, and the change visible in Activity. |
| 5 | Rename the "Joint" tag to "Shared". | `list_holdings`, `upsert_tag` | The tag renamed, with the holdings that carry it. |
| N1 | Transfer S$1,000 to another account. | none | NetNet does not move money; the agent says so. |
| N2 | Show me someone else's holdings. | none | Only the connected account's data exists; a foreign id is `NOT_FOUND`. |
| N3 | Delete everything without asking me. | `delete_holding` only if asked | Destructive tools prompt; the agent confirms first. |

## Claude's connector directory (Anthropic)

Read on 26 October 2026 from Anthropic's own pages: the submission guide
<https://claude.com/docs/connectors/building/submission> (also `…/submission.md`), the directory
overview <https://claude.com/docs/directory/publish>, and the pre-submission checklist
<https://claude.com/docs/connectors/building/review-criteria>. The developer portal is
<https://claude.ai/directory/manage>. All answered HTTP 200.

### Requirements it publishes

- **Who can submit:** any paid Claude plan (Pro, Max, Team or Enterprise); a Free account cannot.
  On Team and Enterprise an Owner submits, or someone granted the Directory permission. Submit an
  **MCP connector**, not a plugin bundle: NetNet is a remote server with no plugin.
- **Remote and HTTPS:** the portal asks for an `https://` URL; `https://netnetapp.io/mcp`.
- **Authentication:** OAuth 2.0 for a service that acts on a user's account; NetNet's OAuth supports
  CIMD (Claude's preferred path) and DCR (P1 spike). Claude's hosted callback is
  `https://claude.ai/api/mcp/auth_callback`; its CIMD document is
  `https://claude.ai/oauth/mcp-oauth-client-metadata`. No separate approval is needed for
  authentication.
- **Tool annotations:** every tool needs a `title`, and the applicable `readOnlyHint` or
  `destructiveHint`. The portal flags tools that lack them. Verified with
  `pnpm listing:tools --origin … --check`: all 18 tools pass (see the table at the end).
- **Tool design:** separate read and write tools, no catch-all `api_request`; names at most 64
  characters; descriptions that say what the tool does and when to call it, with no prompt-injection
  patterns. NetNet's registry already splits reads and writes and has no catch-all.
- **Functional quality:** every tool returns a real answer for valid input and an actionable error
  otherwise; no full-database dumps; no conversation data. NetNet's tools return per-call
  structured answers and typed errors.
- **First-party API:** the server must call the publisher's own API; the MCP domain should match the
  service. It does: `netnetapp.io/mcp` on NetNet's own API.
- **Unsupported use cases:** transferring money or crypto, or generating AI media. NetNet does
  neither; it records figures and computes.
- **Test account:** required, fully populated. See the Founder step above.
- **Public documentation:** required by the publish date; a blog post or help-centre article is
  enough. The landing page carries it.
- **Terms:** the submission acknowledges the Anthropic Software Directory Terms and Policy, and
  seven compliance confirmations (directory guidelines, first-party API, financial transactions, AI
  media, prompt injection, conversation data, public documentation).
- **Review:** every submission is scanned automatically and, by default, listed as a Community
  connector; Anthropic may escalate to Verified review, in which a person runs each tool. Review
  time is not fixed, and there is no separate application for Verified.

### Fields the portal asks for, step by step

1. **Connection:** `https://netnetapp.io/mcp`, or the custom connector already added in Claude.
2. **Tools:** imported from the server; confirm all 18 have titles and hints.
3. **Listing:** name `NetNet` (≤100); one-liner above (≤200); description above (≤2,000); one to
   five categories; documentation `https://netnetapp.io`; privacy policy
   `https://netnetapp.io/privacy`; support contact above; icon above; URL slug `netnet`.
4. **Use cases:** a first picture of where you stand, kept current, and readable by your own agent;
   users need a NetNet account (free); the connector **reads and writes**.
5. **Company:** NetNet, `https://netnetapp.io`, and the Founder as the review contact.
6. **Authentication:** required; OAuth 2.0. Claude registers by CIMD, with DCR accepted.
7. **Data handling:** the API is NetNet's own; no personal health data, no sponsored content.
8. **Test & launch:** the reviewer credentials in the form (never here), and a confirmation that
   every tool was run in MCP Inspector or as a custom connector.
9. **Compliance:** all seven acknowledgments.
10. **Review and submit.**

### Steps, after F23

1. The Founder signs in to <https://claude.ai/directory/manage> on a paid plan, chooses **Submit
   new → MCP connector**.
2. Connect `https://netnetapp.io/mcp`, authorize the reviewer account, and let the tools sync.
3. Fill the Listing, Use cases, Company, Authentication, Data handling and Test & launch steps with
   the text above; enter the reviewer credentials in the form.
4. Run every tool once in MCP Inspector and as a custom connector, then confirm it in the portal.
5. Check all seven compliance boxes, review, and submit. Expect a Community listing from the
   automatic scan; a Verified review may follow without an application.
6. Track the status at the portal. Escalation channel if a submission is stuck:
   `mcp-review@anthropic.com`.

## OpenAI's directory (ChatGPT apps and Codex plugins)

Read on 26 October 2026 from OpenAI's developer documentation, because `platform.openai.com/docs/…`
answered 403 from this session: <https://developers.openai.com/plugins/deploy/submission>,
<https://developers.openai.com/plugins/deploy/app-review> and
<https://developers.openai.com/plugins/plugin-guidelines> (each also served as `.md`, HTTP 200). The
portal is <https://platform.openai.com/plugins>.

### Requirements it publishes

- **Organisation and identity:** complete individual or business verification in the organisation
  settings; publishing under an unverified name is rejected. Submitting needs `api.apps.write`
  (owners have it; grant it through roles).
- **A plugin ZIP:** public directory submission is a plugin package, not a bare URL. A remote MCP
  server is submitted **With MCP** using a stable public HTTPS endpoint. One MCP server per plugin.
  A plugin may contain MCP connections, skills, or both; NetNet's needs only the MCP connection
  and the two required icons (dark variants are optional).
- **Manifest fields:** `plugin.json` (Agent Plugins) or `.mcp.json` (Codex) declares the server at
  `https://netnetapp.io/mcp`, with `com.openai.interface` carrying the listing text below.
  Credentials never go in the ZIP; `clientSecret` is rejected.
- **Authentication:** no auth, OAuth, or mixed; an API-key-only server cannot complete the portal's
  connection flow. NetNet uses OAuth with CIMD preferred and DCR accepted. Register the connection
  through the portal, and do not configure the server as `type: "none"`.
- **Domain verification:** host the portal's exact challenge token as plain text at
  `https://<challenge-base-host>/.well-known/openai-apps-challenge`, on the MCP hostname or an
  eligible parent domain. The token is issued in the portal. **This is a route NetNet does not
  have:** it comes back as a question for the Founder/product, not a change made in this task.
- **Tool annotations:** explicit booleans for `readOnlyHint`, `destructiveHint` and `openWorldHint`;
  they must match behaviour, and reviewer justifications do not override them. NetNet's 18 tools
  declare them (`--check` passes).
- **Response minimisation:** return only what the request needs; no diagnostic, telemetry or session
  identifiers. NetNet's responses are the figures and their provenance, not logs.
- **Review materials:** reviewer credentials for a fully populated demo account (no MFA, email/SMS
  codes or magic links); five positive test cases (scenario, prompt, expected tools, expected
  result); three negative test cases; a video walkthrough URL; release notes.
- **Assets:** a square icon at least 48×48, at most 5 MiB, PNG/JPEG/WebP/SVG, as `logo` (required
  for submission) and `composerIcon` (required for Codex). Screenshots are no longer shown in the
  directory; do not provide them when the plugin has no UI.
- **Privacy:** a published policy covering categories of personal data, purposes, recipients,
  retention and controls. `/privacy` covers these once F23 approves it.
- **Policy limits:** no commerce for digital products, no checkout links, no misleading claims, no
  payment-card, health or government-identifier data. NetNet is free and collects no such data.
- **Review:** automated scans and manual review; timelines vary and expedite requests are refused;
  one review active per plugin; an approved plugin is published when the publisher chooses.
- **EU data residency:** projects with EU data residency cannot submit MCP servers for review; use a
  global-residency project. NetNet's function is in `sin1`, not the EU.

### The plugin package

The manifest is public by design; credentials never go in it, in the ZIP or in the repo. Nothing
here is added to `content/`, which is administered product content. The listing fields, in
`com.openai.interface`:

| Manifest field | Value |
| --- | --- |
| `displayName` | `NetNet` |
| `shortDescription` | `Your balance sheet, readable by your own AI agent` |
| `longDescription` | the long description above |
| `developerName` | `NetNet` |
| `category` | `Finance` (confirm the portal's closest option) |
| `capabilities` | `Read your holdings and values`, `Add and change holdings, values, types and tags` |
| `websiteURL` | `https://netnetapp.io` |
| `supportURL` | `https://netnetapp.io` (Founder confirms the support mailbox first) |
| `privacyPolicyURL` | `https://netnetapp.io/privacy` |
| `termsOfServiceURL` | `https://netnetapp.io/terms` |
| `defaultPrompt` | `How much could I use this month?`, `How exposed am I to the US dollar?`, `What changed since last quarter?` |
| `brandColor` | `#F0643A` (the light-theme tomato in `packages/tokens`) |
| `brandColorDark` | `#FF7438` (its dark-theme value) |
| `logo` / `composerIcon` | the 512×512 icon (the two required files; dark variants are optional and not made yet) |
| `screenshots` | none: the plugin has no UI |
| `review.test_cases` | the five positive and three negative cases above |
| `review.demo_recording_url` | F21's recording, once it exists (P4-T2) |
| `publication.countries` | `["SG", …]`: the Founder chooses the rest, from the countries the landing page serves |
| `publication.release_notes` | `First release: read your picture, and write holdings, values, types and tags.` |
| `review.commerce` | `false` |

### Steps, after F23

1. Complete business verification for the publishing identity.
2. Build the plugin ZIP (manifest, `mcp.json`, `logo` and `composerIcon`). Keep credentials out
   of it.
3. Open <https://platform.openai.com/plugins>, upload the ZIP, and resolve the metadata findings.
4. Connect the MCP server, complete the domain challenge the portal issues, and let it scan the
   tools. The challenge needs a `/.well-known/openai-apps-challenge` route first (Founder decision).
5. Enter the reviewer credentials in **Review details** (never in the ZIP), the five positive and
   three negative cases, the video URL and the release notes.
6. Submit for review. Fix any rejection from the email and resubmit; appeal by replying to it.
7. On approval, choose when to **Publish**. Listing is what lets ChatGPT's free plans use NetNet
   (PRD §9 q1); until then ChatGPT's guide stays `listed: false` in `content/agents/chatgpt.json`.

## The official MCP Registry

Read on 26 October 2026: the registry at <https://registry.modelcontextprotocol.io> (HTTP 200; its
docs page is a JavaScript shell, so the published documentation was read from the registry's own
repository), the schema at
<https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json> (HTTP 200, vendored
as `ops/launch/server.schema.json`, sha256
`3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0`), and the publisher guides
<https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx>,
`…/remote-servers.mdx` and `…/authentication.mdx` (HTTP 200).

### Requirements it publishes

- **Remote-only is allowed:** a `remotes` entry and no `packages`. The URL must be publicly
  accessible; `https://netnetapp.io/mcp` is.
- **Streamable HTTP:** `"type": "streamable-http"`; SSE is deprecated and is not published.
- **Scope of verification:** the registry proves the **namespace** in `name`, not that the remote
  URL belongs to the publisher. NetNet uses DNS verification so the name and the URL share
  `netnetapp.io`.
- **Namespace:** a domain-based name is `io.netnetapp/*` (the reverse-DNS form of `netnetapp.io`).
  The entry is `io.netnetapp/netnet`.
- **DNS proof:** a `v=MCPv1` TXT record at the **apex** of the domain, `netnetapp.io`, never under
  `_mcp-auth` or `_mcp-registry`. Ed25519 (OpenSSL 3) or ECDSA P-384. Remove a rotated key's old
  record, or verification tries the stale one first.
- **Description:** at most 100 characters (the publisher guide's validation rule). The entry's is
  85.
- **One server per remote URL:** publishing fails if another server name already uses the URL.
- **Schema:** `server.json` is validated by the registry at publish time and by
  `test/launch/server-json.test.ts` here against the vendored schema.
- **Publishing is a CLI, not a pull request:** `mcp-publisher login`, `validate`, `publish`; a
  merged `server.json` in the registry's repo does not publish anything.

### Fields

| `server.json` field | Value |
| --- | --- |
| `$schema` | `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` |
| `name` | `io.netnetapp/netnet` |
| `title` | `NetNet` |
| `description` | `Where you stand — what you own and what you owe — kept current for your own AI agent.` (85) |
| `version` | `1.0.0` |
| `websiteUrl` | `https://netnetapp.io` |
| `icons` | `https://netnetapp.io/app/icons/icon-512.png`, `image/png`, `512x512` |
| `remotes` | `[{"type": "streamable-http", "url": "https://netnetapp.io/mcp"}]` |

### Steps, after F23

1. The Founder generates the key pair and the TXT record (do not commit the private key):
   `openssl genpkey -algorithm Ed25519 -out key.pem`, then
   `PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"`, then
   `echo "netnetapp.io. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""`.
2. Add that TXT record at the apex of `netnetapp.io` and wait for it to propagate
   (`dig TXT netnetapp.io +short` shows the `MCPv1` value).
3. `mcp-publisher login dns --domain netnetapp.io --private-key <key>`.
4. From the repository root, `mcp-publisher validate ops/launch/server.json` (or run it from
   `ops/launch/`), then `mcp-publisher publish`. `pnpm test` already proves the same schema.
5. Confirm with `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.netnetapp/netnet"`.
6. Keep the private key in a password manager, not the repo; when it rotates, add the new TXT and
   remove the old one.

## Public lists and directories

### Smithery

Read on 26 October 2026: <https://smithery.ai/docs/build/publish> (HTTP 200; Smithery is now part
of Arcade.dev).

- **Accepts remote, OAuth-only servers:** yes. Streamable HTTP; OAuth support where auth is
  required; **no client registration needed**, because Smithery registers itself by Client ID
  Metadata Documents.
- **How:** <https://smithery.ai/new>, paste the public HTTPS URL, complete the publishing flow. The
  CLI equivalent is `smithery mcp publish https://netnetapp.io/mcp -n @netnet/netnet` (namespace
  confirmed in the flow).
- **Scanning:** Smithery scans `tools`, `prompts` and `resources` automatically. An auth-required
  server is scanned after the publisher authenticates. If a scan is blocked, the fallback is a
  static server card at `/.well-known/mcp/server-card.json` (optional; NetNet does not have one, and
  adding it would be a route, so it is not done here).
- **Its own troubleshooting rule that matters to us:** return **401, not 403**, to unauthenticated
  requests so OAuth discovery works. NetNet's `/mcp` answers 401 with the resource metadata (smoke
  test).
- **Fields:** name and endpoint; the scan fills tool metadata. Description and categories come from
  the server listing; use the copy above and `Finance`.
- **Steps, after F23:** the Founder signs in, pastes the URL, authorizes the reviewer account for
  the scan, checks the imported tools and text, and publishes. No fee is published on the page.

### mcpservers.org (Awesome MCP Servers)

Read on 26 October 2026: <https://mcpservers.org/submit> (HTTP 200).

- **Accepts remote servers:** the form has "This server supports remote connections".
- **Free listing:** review within two weeks. A $39 premium option reviews within 24 hours with a
  badge and priority; **do not pay it** in this plan.
- **Fields:** Server Name `NetNet`; Category `Finance` (published list: Development, Productivity,
  Database, Search, Web Scraping, File System, Version Control, Communication, Cloud Service, Cloud
  Storage, Marketing, Finance, Design, Memory, Other); Short Description `Your balance sheet,
  readable by your own AI agent`; Repository/Website/Documentation `https://netnetapp.io`; Official
  MCP Registry Name `io.netnetapp/netnet` (optional, after the registry publish); "supports remote
  connections" checked; Contact Email the Founder's monitored address.
- **Steps, after F23:** submit the form once, free plan; answer the review email if it asks for
  anything; do not resubmit.

### mcp.so

Read on 26 October 2026: <https://mcp.so/submit> (HTTP 200).

- **What the published page shows:** tabs for MCP Server, Remote Server, MCP Client and AI Product.
  The form needs a **Repository URL** (marked required) and a name. A paid submission is $39
  one-time, published immediately without review, with a verified badge and featured placement.
- **What it does not show:** whether a free submission is still offered, and the Remote Server
  tab's own fields; both are behind the tab in the browser. NetNet has no public source repository
  to offer, so the repository field is an open question, not something to invent.
- **Founder check:** read the Remote Server tab in a browser; if a repository URL is still required
  and there is no free path, either skip mcp.so or publish the repository first. Do not pay the $39
  in this plan.
- **Steps, after F23:** only after that check, submit with the copy above and `Finance`; otherwise
  record the skip and why in the launch notes.

### Glama, and awesome-remote-mcp-servers

Read on 26 October 2026: <https://glama.ai/mcp/connectors> and <https://glama.ai/mcp/servers>
(HTTP 200), and the list's own rules at
<https://github.com/punkpeye/awesome-remote-mcp-servers/blob/main/CONTRIBUTING.md> (HTTP 200).

- **Glama** lists remote connectors with a reverse-DNS namespace, name, description, categories,
  endpoint and auth badge, and scans the endpoint ("Add Server" opens the form). The form's required
  fields are not published as text; read them in the browser before submitting. A connector named
  `io.netnetapp/netnet` would show its **OAuth** badge and health score.
- **awesome-remote-mcp-servers** accepts a PR for a hosted remote server that:
  - answers an MCP `initialize` at a public URL (CI re-checks it on every PR);
  - is usable by anyone (public sign-up is fine; no invite-only or single-tenant endpoint);
  - speaks Streamable HTTP or SSE;
  - **is already a Glama connector**, whose badge the entry carries (CI checks the badge resolves).
- **Entry format**, exactly three lines, alphabetical under `💰 Finance`, description ≤120
  characters ending in a period:
  `- [NetNet](https://netnetapp.io) \`https://netnetapp.io/mcp\`` then the Glama badge line, then
  `🔐 - Where you stand — what you own and what you owe — kept current for your own AI agent.`
  (85 characters).
- **Steps, after F23:** list in Glama first and let the connector and badge appear; star the list's
  repository (its rules require it); open one PR adding the entry under Finance, titled to match
  their convention. An agent-opened PR opts into fast-track review by ending its title with
  `🤖🤖🤖`. Do not dispatch workflows or merge anything: that is the manager's call.

### PulseMCP

<https://www.pulsemcp.com> and <https://www.pulsemcp.com/submit> answered **HTTP 403** from this
session (26 October 2026). Its requirements are **not reachable from the build session** and are not
guessed; it needs the Founder or Stage 8 to read them in a browser and add a section here.

## Tools, as the server lists them

`pnpm listing:tools --origin <url> --check` prints this table from the server's own `tools/list`;
nothing below was typed by hand. This copy came from the real 18-tool registry served locally on 26
October 2026 (`http://127.0.0.1:3199/mcp`, the same handler production runs), and `--check` passed:
every tool has a title, a description, and the applicable hint.

| Tool | Title | Read or write | Destructive | Description |
| --- | --- | --- | --- | --- |
| `get_financial_context` | Financial context | read | no | The whole picture in one call: totals, what could be used, the period change, currency exposure, per-holding values with staleness, and which figure answers which question. Call this first for any question about the position. |
| `list_holdings` | List holdings | read | no | Holdings with their latest value, how old it is, and how accessible each one is. Page through with cursor; filter by type, tag, or staleness. |
| `get_holding` | Get holding | read | no | One holding with a page of its values, newest first, each with its provenance. |
| `get_net_worth_history` | Net worth history | read | no | Net worth over time in the base currency, split by type, access or currency. Each point says whether it is carried or observed. |
| `get_period_changes` | Period changes | read | no | Net-worth change per calendar month, quarter or year in the base currency: each period-end value, its change, and the holdings that drove it. Each period says whether it is carried or observed. The first period has nothing earlier to compare with, so its change and % are null and nothing drove it: its end value is where the record starts, not a gain or a loss. |
| `get_taxonomy` | Taxonomy | read | no | The types — each with what it means — and tags. Read this before creating holdings, so new ones reuse what exists. |
| `get_setup_guide` | Setup guide | read | no | The setup checklist for a country, and the fact question per type of holding. Ask what it asks when assembling the picture in conversation. |
| `list_activity` | List activity | read | no | Every change you or the person made, newest first, each with who made it, when, the old and new values, and which agent turn it belongs to. Page through with cursor; filter to one turn with batch_id. A record only: correct a mistake with another change. |
| `create_holding` | Create holding | write | no | Track a new holding. Look for an existing one first: unless allow_duplicate is true, a likely match is returned instead of created. access_answer is an answer id from get_setup_guide, or "not_sure". |
| `update_holding` | Update holding | write | no | Rename a holding, change its type, tags, accessibility answer, cadence or archived state. |
| `delete_holding` | Delete holding | write | yes | Stop tracking a holding, with all its values. |
| `record_values` | Record values | write | no | Record up to 200 values at once, across holdings. A value for a holding and date already stored is replaced. Atomic: one bad item writes nothing. |
| `update_value` | Update value | write | no | Correct a value: its amount, date, currency or the rate it was converted at. |
| `delete_value` | Delete value | write | yes | Delete one value. |
| `upsert_type` | Upsert type | write | no | Add a type of holding, or rename one. A new type needs the universal type it means. |
| `delete_type` | Delete type | write | yes | Delete a type. While holdings use it, move_holdings_to says which type they move to. |
| `upsert_tag` | Upsert tag | write | no | Add a tag, or rename one. |
| `delete_tag` | Delete tag | write | yes | Delete a tag. merge_into folds it into another tag instead. |

## What the Founder must do

1. **The reviewers' test account:** create the verified production account from P4-T1's demo
   household, and enter its address and password in each directory's own form only — never the repo,
   an issue or a chat.
2. **The MCP Registry's DNS proof:** add the `v=MCPv1` TXT record at the apex of `netnetapp.io`,
   keep the private key out of the repo, and run `mcp-publisher login dns`.
3. **OpenAI's domain challenge:** approve a route (or a static file at the edge) for
   `https://netnetapp.io/.well-known/openai-apps-challenge`; the portal issues the token. This is a
   product change, so it is a question here, not an edit.
4. **Identity and plan:** OpenAI business verification for the publishing identity; a paid Claude
   plan to submit to Claude's directory.
5. **Support mailbox:** confirm `hello@netnetapp.io` exists and is monitored, or give the address
   the listings should use.
6. **mcp.so:** read the Remote Server tab and decide whether to submit there, publish a repository
   or skip; do not pay the $39.
7. **F23 first:** approve the privacy policy and terms, then submit. Until then the legal URLs are
   drafts and nothing should be sent to a directory.
