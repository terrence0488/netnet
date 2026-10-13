import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Unsubscribe } from './Unsubscribe';

function render(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Unsubscribe />
    </MemoryRouter>,
  );
}

describe('Unsubscribe', () => {
  it('posts the token on load: it starts mid-post', () => {
    // Effects do not run in a static render; the post itself is api/reminders.test.ts, and the
    // outcomes are e2e/reminders.spec.ts. What the server renders must already say what is next.
    const markup = render('/reminders/unsubscribe?token=r1.test-payload.test-signature');
    expect(markup).toContain('Turning email reminders off');
  });
});
