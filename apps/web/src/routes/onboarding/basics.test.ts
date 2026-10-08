import type { Holding, Snapshot, UserType } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import {
  checklistOf,
  firstUnanswered,
  followupsOf,
  holdingInput,
  isAnswered,
  isVisible,
  nextUnanswered,
  omitAnswers,
  previousItem,
  seedAnswers,
  visibleItems,
  type BasicsAnswers,
  type ChecklistItem,
} from './basics';

/** A fictional checklist in a pack's shape: a follow-up behind a yes, and a pack type. */
function item(over: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return {
    u: 'cash',
    name: over.id,
    ask: `Do you have ${over.id}?`,
    amount: `How much ${over.id}?`,
    ...over,
  };
}

const CHECKLIST: readonly ChecklistItem[] = [
  item({ id: 'bank', u: 'cash' }),
  item({ id: 'home', u: 'property', answer: 'yes' }),
  item({ id: 'home_loan', u: 'mortgage', onlyIf: 'home' }),
  item({ id: 'car', u: 'vehicle' }),
  item({ id: 'car_loan', u: 'loan', type: 'car_loan', onlyIf: 'car' }),
  item({ id: 'owed', u: 'loan' }),
];

const NOTHING: BasicsAnswers = {};

describe('visibleItems', () => {
  it('asks everything without an onlyIf, and a follow-up only after its yes', () => {
    expect(visibleItems(CHECKLIST, NOTHING).map((i) => i.id)).toStrictEqual([
      'bank',
      'home',
      'car',
      'owed',
    ]);
    expect(visibleItems(CHECKLIST, { home: { decision: 'yes' } }).map((i) => i.id)).toStrictEqual([
      'bank',
      'home',
      'home_loan',
      'car',
      'owed',
    ]);
    expect(visibleItems(CHECKLIST, { home: { decision: 'no' } }).map((i) => i.id)).toStrictEqual([
      'bank',
      'home',
      'car',
      'owed',
    ]);
  });
});

describe('isVisible', () => {
  it('says whether one question shows, whatever else was answered', () => {
    expect(isVisible(CHECKLIST, NOTHING, 'bank')).toBe(true);
    expect(isVisible(CHECKLIST, NOTHING, 'home_loan')).toBe(false);
    expect(isVisible(CHECKLIST, { home: { decision: 'yes' } }, 'home_loan')).toBe(true);
    expect(isVisible(CHECKLIST, { home: { decision: 'no' } }, 'home_loan')).toBe(false);
    expect(isVisible(CHECKLIST, NOTHING, 'elsewhere')).toBe(false);
  });
});

describe('isAnswered', () => {
  it('counts a no and a saved yes, but not a yes still waiting for its amount', () => {
    expect(isAnswered({ bank: { decision: 'no' } }, 'bank')).toBe(true);
    expect(isAnswered({ bank: { decision: 'yes', holdingId: 'hld_x' } }, 'bank')).toBe(true);
    expect(isAnswered({ bank: { decision: 'yes' } }, 'bank')).toBe(false);
    expect(isAnswered(NOTHING, 'bank')).toBe(false);
  });
});

describe('firstUnanswered, nextUnanswered and previousItem', () => {
  it('walk the visible questions in order, skipping settled ones on the way on', () => {
    expect(firstUnanswered(CHECKLIST, NOTHING)?.id).toBe('bank');
    const answers: BasicsAnswers = {
      bank: { decision: 'yes', holdingId: 'hld_bank' },
      home: { decision: 'yes', holdingId: 'hld_home' },
    };
    expect(firstUnanswered(CHECKLIST, answers)?.id).toBe('home_loan');
    expect(nextUnanswered(CHECKLIST, answers, 'bank')?.id).toBe('home_loan');
    expect(previousItem(CHECKLIST, answers, 'home_loan')?.id).toBe('home');
    expect(previousItem(CHECKLIST, answers, 'bank')).toBeUndefined();
  });

  it('finish once nothing visible is open, even with questions skipped behind', () => {
    const answers: BasicsAnswers = {
      bank: { decision: 'no' },
      home: { decision: 'no' },
      car: { decision: 'no' },
      owed: { decision: 'no' },
    };
    expect(firstUnanswered(CHECKLIST, answers)).toBeUndefined();
    expect(nextUnanswered(CHECKLIST, answers, 'owed')).toBeUndefined();
  });

  it('return to skipped questions on the way back', () => {
    const answers: BasicsAnswers = { bank: { decision: 'yes', holdingId: 'hld_bank' } };
    expect(nextUnanswered(CHECKLIST, answers, 'bank')?.id).toBe('home');
    expect(previousItem(CHECKLIST, answers, 'home')?.id).toBe('bank');
  });
});

describe('followupsOf', () => {
  it('names everything asked only because of an answer, transitively', () => {
    expect(followupsOf(CHECKLIST, 'home').map((i) => i.id)).toStrictEqual(['home_loan']);
    expect(followupsOf(CHECKLIST, 'car').map((i) => i.id)).toStrictEqual(['car_loan']);
    expect(followupsOf(CHECKLIST, 'bank')).toStrictEqual([]);
    expect(followupsOf(CHECKLIST, 'owed')).toStrictEqual([]);
  });
});

describe('omitAnswers', () => {
  it('drops exactly the answers named', () => {
    const answers: BasicsAnswers = {
      bank: { decision: 'yes', holdingId: 'hld_bank' },
      home: { decision: 'yes', holdingId: 'hld_home' },
      home_loan: { decision: 'yes', holdingId: 'hld_loan' },
    };
    expect(omitAnswers(answers, ['home', 'home_loan'])).toStrictEqual({
      bank: { decision: 'yes', holdingId: 'hld_bank' },
    });
  });
});

describe('checklistOf', () => {
  it('takes the first pack in the chain that asks anything', () => {
    const generic = { checklist: [item({ id: 'bank' })] };
    const country = { checklist: [item({ id: 'local_bank' })] };
    expect(checklistOf([country, generic] as never).map((i) => i.id)).toStrictEqual(['local_bank']);
    expect(checklistOf([{ checklist: [] }, generic] as never).map((i) => i.id)).toStrictEqual([
      'bank',
    ]);
    expect(checklistOf([{ checklist: [] }] as never)).toStrictEqual([]);
  });
});

/** A snapshot holding just one holding, in the shape `seedAnswers` reads. */
function snapshotWith(holdings: Holding[], values: Snapshot['values']): Snapshot {
  return {
    dataVersion: 2,
    baseCurrency: 'EUR',
    packRef: [],
    prefs: {},
    types: [],
    tags: [],
    holdings,
    values,
  };
}

function holding(over: Partial<Holding> & { id: string; name: string }): Holding {
  return {
    kind: 'asset',
    typeId: 'typ_cash',
    currency: 'EUR',
    cadenceDays: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    rowVersion: 1,
    access: 'accessible',
    accessReason: null,
    accessUntil: null,
    accessBasis: null,
    tagIds: [],
    ...over,
  };
}

describe('seedAnswers', () => {
  it('counts each saved holding as its item’s yes, with the latest value to show', () => {
    const snapshot = snapshotWith(
      [
        holding({ id: 'hld_bank', name: 'bank' }),
        holding({ id: 'hld_home', name: 'home' }),
        holding({ id: 'hld_stray', name: 'something else' }),
      ],
      {
        hld_bank: [['2026-08-01', 500000, 'EUR', 500000, 'web', null, 'val_1']],
        hld_home: [
          ['2026-07-01', 100000, 'EUR', 100000, 'web', null, 'val_2'],
          ['2026-08-01', 120000, 'EUR', 120000, 'web', null, 'val_3'],
        ],
      },
    );
    expect(seedAnswers(CHECKLIST, snapshot)).toStrictEqual({
      bank: { decision: 'yes', holdingId: 'hld_bank', amount: '5000.00' },
      home: { decision: 'yes', holdingId: 'hld_home', amount: '1200.00' },
    });
  });

  it('keeps a holding without a value as a yes still waiting for its amount', () => {
    const snapshot = snapshotWith([holding({ id: 'hld_bank', name: 'bank' })], {});
    expect(seedAnswers(CHECKLIST, snapshot)).toStrictEqual({
      bank: { decision: 'yes', holdingId: 'hld_bank' },
    });
  });

  it('never mistakes another kind, an archived holding or a stranger’s name', () => {
    const snapshot = snapshotWith(
      [
        holding({ id: 'hld_loan', name: 'owed', kind: 'asset' }),
        holding({ id: 'hld_old', name: 'bank', archived: true }),
      ],
      {},
    );
    expect(seedAnswers(CHECKLIST, snapshot)).toStrictEqual({});
  });
});

describe('holdingInput', () => {
  const types: UserType[] = [
    {
      id: 'typ_cash',
      universal: 'cash',
      packTypeKey: null,
      customName: null,
      sort: 0,
      archived: false,
    },
    {
      id: 'typ_car_loan',
      universal: 'loan',
      packTypeKey: 'car_loan',
      customName: null,
      sort: 1,
      archived: false,
    },
  ];

  it('saves the item with its opening value, via guided', () => {
    expect(
      holdingInput(CHECKLIST[0]!, {
        types,
        currency: 'EUR',
        amount: '5000',
        date: '2026-08-01',
      }),
    ).toStrictEqual({
      name: 'bank',
      kind: 'asset',
      universal: 'cash',
      currency: 'EUR',
      opening: { amount: '5000', date: '2026-08-01' },
      via: 'guided',
    });
  });

  it('answers the item’s accessibility question, and names the pack type it names', () => {
    expect(
      holdingInput(CHECKLIST[1]!, {
        types,
        currency: 'EUR',
        amount: '1200',
        date: '2026-08-01',
      }),
    ).toMatchObject({ universal: 'property', access: 'yes' });
    expect(
      holdingInput(CHECKLIST[4]!, {
        types,
        currency: 'EUR',
        amount: '300',
        date: '2026-08-01',
      }),
    ).toMatchObject({ kind: 'liability', typeId: 'typ_car_loan' });
    expect(
      holdingInput(CHECKLIST[4]!, {
        types: [],
        currency: 'EUR',
        amount: '300',
        date: '2026-08-01',
      }),
    ).toMatchObject({ kind: 'liability', universal: 'loan' });
    expect(
      holdingInput(CHECKLIST[4]!, {
        types,
        currency: 'EUR',
        amount: '300',
        date: '2026-08-01',
      }),
    ).not.toHaveProperty('access');
  });
});
