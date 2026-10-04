import { describe, expect, it } from 'vitest';
import { ANSWER_GUIDE, NOTES, OMITTED_HINT, pictureNotes } from './wording';

/** Wording that tells someone what to do (PRD §2.4: facts and structure, never judgement). */
const ADVICE =
  /\b(should|ought|recommend\w*|consider\w*|avoid\w*|advis\w*|suggest\w*|must|don['’]t|do not)\b/i;

/** Every sentence the templates can produce: singular and plural, with any name. */
const everyNote = [
  NOTES.empty(),
  NOTES.partial(),
  ...[1, 3].flatMap((n) => [
    NOTES.undecided(n, 'Gold coins'),
    NOTES.withoutValue(n, 'Watch'),
    NOTES.stale(n, 'Family car', 410),
    NOTES.converted(n),
  ]),
];

describe('the context’s fixed wording', () => {
  it('states facts, never advice', () => {
    const guide = ANSWER_GUIDE.flatMap((entry) => Object.values(entry));
    for (const text of [...guide, ...everyNote, OMITTED_HINT]) {
      expect(text, text).not.toMatch(ADVICE);
    }
    // The scan itself finds advice.
    for (const advice of ['You should sell', 'Consider paying it off', 'Don’t buy the car']) {
      expect(advice).toMatch(ADVICE);
    }
  });

  it('agrees in number', () => {
    expect(NOTES.undecided(1, 'Gold coins')).toBe(
      'Accessibility of “Gold coins” is undecided: it counts in net_worth, not in could_use',
    );
    expect(NOTES.undecided(3, 'Gold coins')).toBe(
      'Accessibility of 3 holdings is undecided, the largest “Gold coins”: they count in net_worth, not in could_use',
    );
    expect(NOTES.stale(1, 'Family car', 410)).toBe(
      'The value of “Family car” is 410 days old, past its usual update interval',
    );
    expect(NOTES.converted(1)).toMatch(/^Values in 1 other currency are/);
    expect(NOTES.converted(2)).toMatch(/^Values in 2 other currencies are/);
  });
});

describe('pictureNotes', () => {
  const none = { holdings: 4, undecided: [], withoutValue: [], stale: [], otherCurrencies: 0 };

  it('says only that the picture is what has been added, when nothing else applies', () => {
    expect(pictureNotes(none)).toStrictEqual(['NetNet only knows what has been added']);
    expect(pictureNotes({ ...none, holdings: 0 })).toStrictEqual([
      'No holdings have been added yet',
    ]);
  });

  it('gives at most five, undecided first', () => {
    const notes = pictureNotes({
      holdings: 9,
      undecided: ['Gold coins', 'Art'],
      withoutValue: ['Watch'],
      stale: [{ name: 'Family car', days: 410 }],
      otherCurrencies: 2,
    });
    expect(notes).toHaveLength(5);
    expect(notes[0]).toMatch(/^Accessibility of 2 holdings is undecided/);
    expect(notes.at(-1)).toBe('NetNet only knows what has been added');
  });
});
