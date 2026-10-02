# Connector setup screenshots

The agent setup guides (PRD J5) show one screenshot per step, per client, per platform. Each step
in `content/agents/<client>.json` names its file here. Only Claude and ChatGPT have screenshots;
"Other agent" has none.

| Client | Computer | Phone |
|---|---|---|
| Claude | `claude-computer-1.png` · `-2` · `-3` | `claude-phone-1.png` · `-2` · `-3` |
| ChatGPT | `chatgpt-computer-1.png` · `-2` · `-3` | `chatgpt-phone-1.png` · `-2` · `-3` |

Step *n* is the *n*th step of that platform in the guide. PNG, cropped to the part of the screen
the step talks about.

**This folder is committed to the repo.** Before adding a screenshot, crop or blur anything
personal: your name, email, avatar, and any chat titles in the sidebar.

`pnpm content:check` passes while a screenshot is missing (the app shows a neutral placeholder);
`pnpm content:check --strict`, which a production publish runs, fails on one.
