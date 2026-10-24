import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carriesToken, findInlineTokens, inlineTokensIn } from './scan';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

/** A fictional workflow: the token reaches each script the wrong way, then the right way. */
const PLANTED = `name: Planted
on: workflow_dispatch
jobs:
  probe:
    runs-on: ubuntu-latest
    outputs:
      token: \${{ steps.probe.outputs.refresh_token }}
    steps:
      - name: Probe
        id: probe
        env:
          PROBE_REFRESH_TOKEN: \${{ secrets.PROBE_REFRESH_TOKEN }}
        run: pnpm --silent probe --origin "\${{ vars.PUBLIC_ORIGIN }}"
      - name: Store the rotated token
        if: steps.probe.outputs.refresh_token != ''
        env:
          REFRESH_TOKEN: \${{ steps.probe.outputs.refresh_token }}
        run: |
          echo "::add-mask::\${{ steps.probe.outputs.refresh_token }}"

          gh secret set PROBE_REFRESH_TOKEN --body "$REFRESH_TOKEN"
      - run: psql "\${{ steps.db.outputs.database_url }}" -c 'select 1'
      - run: >-
          curl -H "Authorization: Bearer \${{
            secrets.CRON_SECRET }}" "\${{ vars.PUBLIC_ORIGIN }}"
      - uses: actions/upload-artifact@v4
        with:
          path: \${{ steps.dump.outputs.file }}
  store:
    needs: probe
    runs-on: ubuntu-latest
    steps:
      - name: Store
        run: gh secret set X --body "\${{ needs.probe.outputs.token }}"
      - run: echo "\${{ steps.deploy.outputs.url }} \${{ github.event_name }}"
`;

describe('workflows: no token inline in a run: script', () => {
  it('finds none under .github/', () => {
    expect(findInlineTokens(REPO_ROOT)).toStrictEqual([]);
  });

  describe('the scan itself', () => {
    const found = inlineTokensIn('planted.yml', PLANTED);

    it('catches every token in a script, block or single-line, and none in env:, with:, outputs: or if:', () => {
      expect(found).toStrictEqual([
        {
          file: 'planted.yml',
          line: 19,
          expression: '${{ steps.probe.outputs.refresh_token }}',
        },
        {
          file: 'planted.yml',
          line: 22,
          expression: '${{ steps.db.outputs.database_url }}',
        },
        {
          file: 'planted.yml',
          line: 24,
          expression: '${{\n            secrets.CRON_SECRET }}',
        },
        { file: 'planted.yml', line: 34, expression: '${{ needs.probe.outputs.token }}' },
      ]);
    });

    it('knows which expressions carry a token', () => {
      expect(carriesToken('${{ steps.smoke.outputs.refresh_token }}')).toBe(true);
      expect(carriesToken('${{ steps.app.outputs.token }}')).toBe(true);
      expect(carriesToken('${{ steps.neon.outputs.db_password }}')).toBe(true);
      expect(carriesToken("${{ secrets['VERCEL_TOKEN'] }}")).toBe(true);
      expect(carriesToken('${{ github.token }}')).toBe(true);
      expect(carriesToken('${{ steps.deploy.outputs.url }}')).toBe(false);
      expect(carriesToken('${{ steps.previous.outputs.uid }}')).toBe(false);
      expect(carriesToken('${{ github.event.before }}')).toBe(false);
    });
  });
});
