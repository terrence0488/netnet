import { describe, expect, it } from 'vitest';
import { archivedRowSub } from './Archived';

describe('archivedRowSub', () => {
  it('names the type and how old its latest value is', () => {
    expect(archivedRowSub('Investments', '2026-10-01', '2026-10-09')).toBe(
      'Investments · a week ago',
    );
    expect(archivedRowSub('Investments', null, '2026-10-09')).toBe('Investments');
  });
});
