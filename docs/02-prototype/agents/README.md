# Agent logos

The "Connect to agent" button cycles through the agents NetNet works with, one every two
seconds, and the "Which AI agent do you use?" list shows each one's logo. Drop the logos here:

| Agent | File |
|---|---|
| ChatGPT | `chatgpt.svg` |
| Claude | `claude.svg` |
| Grok | `grok.svg` |
| Muse | `muse.svg` |

The order and the list live in `connectors.js` (`ROLL` and `CLIENTS`). A missing file shows the
agent's initial in a circle.

- **Use each company's official logo file**, from its brand or press page, and follow its brand
  guidelines. Do not redraw a logo.
- **Any colour is fine.** The prototype draws every logo as a silhouette in the text colour around
  it, so a coloured or a black logo both work in the dark and light themes. It needs a
  transparent background.
- **SVG, roughly square, cropped tight.** It is shown at 18px.

In the product the agent list, logos and setup steps are content a human admin edits (PRD §2.3).
