# Agent logos

The "Connect to agent" button cycles through the agents NetNet works with, one every two
seconds, and the "Which AI agent do you use?" list shows each one's logo.

| Agent | File | Status |
|---|---|---|
| ChatGPT | `chatgpt.svg` | In place: OpenAI's mark |
| Claude | `claude.svg` | In place |
| Grok | `grok.svg` | In place |
| Muse | `muse.svg` | **Missing** — which product "Muse" is still needs confirming; shows an "M" until then |
| Other agent | none | Uses NetNet's own generic agent icon |

**Source.** The three logos come from LobeHub's open-source AI icon set
(`@lobehub/icons-static-svg` on npm, MIT licence, github.com/lobehub/lobe-icons): single-colour
vector marks, `fill="currentColor"`, 24 × 24. The marks themselves belong to OpenAI, Anthropic and
xAI. Showing them to say "works with" is ordinary practice; before launch, check each company's
brand guidelines for how the mark may be used.

**To add or replace one:** an SVG with a transparent background, roughly square, cropped tight.
Any colour is fine: every logo is drawn as a silhouette in the text colour around it, so it suits
both the dark and light themes. The order and the list live in `connectors.js` (`ROLL` and
`CLIENTS`). A missing file shows the agent's initial in a circle.

In the product, the agent list, logos and setup steps are content a human admin edits (PRD §2.3).
