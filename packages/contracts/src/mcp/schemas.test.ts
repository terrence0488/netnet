import { describe, expect, it } from 'vitest';
import { createHoldingInputSchema } from './create-holding';
import { deleteHoldingInputSchema } from './delete-holding';
import { deleteTagInputSchema } from './delete-tag';
import { deleteTypeInputSchema } from './delete-type';
import { deleteValueInputSchema } from './delete-value';
import { getFinancialContextInputSchema } from './get-financial-context';
import { getHoldingInputSchema } from './get-holding';
import { getNetWorthHistoryInputSchema } from './get-net-worth-history';
import { getSetupGuideInputSchema } from './get-setup-guide';
import { getTaxonomyInputSchema } from './get-taxonomy';
import { listHoldingsInputSchema } from './list-holdings';
import { recordValuesInputSchema } from './record-values';
import { mcpErrorSchema } from './shared';
import { updateHoldingInputSchema } from './update-holding';
import { updateValueInputSchema } from './update-value';
import { upsertTagInputSchema } from './upsert-tag';
import { upsertTypeInputSchema } from './upsert-type';

/** Every MCP tool schema: a valid example passes, and each invalid case names its field. */
describe('mcp input schemas', () => {
  it('get_financial_context takes an optional baseline', () => {
    expect(getFinancialContextInputSchema.safeParse({}).success).toBe(true);
    expect(getFinancialContextInputSchema.safeParse({ baseline: 'last_month' }).success).toBe(true);
    const bad = getFinancialContextInputSchema.safeParse({ baseline: 'last_week' });
    expect(bad.success).toBe(false);
  });

  it('list_holdings pages within its limits', () => {
    expect(
      listHoldingsInputSchema.safeParse({ query: 'bank', stale_only: true, limit: 100 }).success,
    ).toBe(true);
    expect(listHoldingsInputSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listHoldingsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listHoldingsInputSchema.safeParse({ archived: 'sometimes' }).success).toBe(false);
  });

  it('get_holding needs its holding', () => {
    const ok = getHoldingInputSchema.safeParse({ holding_id: 'hld_01J', values_limit: 500 });
    expect(ok.success).toBe(true);
    expect(getHoldingInputSchema.safeParse({}).success).toBe(false);
    expect(
      getHoldingInputSchema.safeParse({ holding_id: 'hld_01J', values_limit: 501 }).success,
    ).toBe(false);
  });

  it('get_net_worth_history orders its range', () => {
    const ok = getNetWorthHistoryInputSchema.safeParse({
      from: '2026-01-01',
      to: '2026-08-01',
      interval: 'quarter',
      group_by: 'currency',
    });
    expect(ok.success).toBe(true);
    expect(
      getNetWorthHistoryInputSchema.safeParse({ from: '2026-08-01', to: '2026-01-01' }).success,
    ).toBe(false);
    expect(getNetWorthHistoryInputSchema.safeParse({ from: '2026-13-01' }).success).toBe(false);
    expect(getNetWorthHistoryInputSchema.safeParse({ interval: 'fortnight' }).success).toBe(false);
  });

  it('get_taxonomy takes nothing', () => {
    expect(getTaxonomyInputSchema.safeParse({}).success).toBe(true);
    expect(getTaxonomyInputSchema.safeParse({ country: 'SG' }).success).toBe(false);
  });

  it('get_setup_guide takes an optional country', () => {
    expect(getSetupGuideInputSchema.safeParse({}).success).toBe(true);
    expect(getSetupGuideInputSchema.safeParse({ country: 'SG' }).success).toBe(true);
    expect(getSetupGuideInputSchema.safeParse({ country: 'SGP' }).success).toBe(false);
  });

  it('create_holding needs exactly one of type_id and universal_type', () => {
    const base = { name: 'Pot', kind: 'asset', currency: 'eur' };
    const byType = createHoldingInputSchema.safeParse({ ...base, type_id: 'typ_01J' });
    expect(byType.success).toBe(true);
    if (byType.success) expect(byType.data.currency).toBe('EUR');
    expect(createHoldingInputSchema.safeParse({ ...base, universal_type: 'cash' }).success).toBe(
      true,
    );
    expect(createHoldingInputSchema.safeParse(base).success).toBe(false);
    expect(
      createHoldingInputSchema.safeParse({ ...base, type_id: 'typ_01J', universal_type: 'cash' })
        .success,
    ).toBe(false);
    expect(
      createHoldingInputSchema.safeParse({ ...base, type_id: 'typ_01J', kind: 'fund' }).success,
    ).toBe(false);
  });

  it('update_holding resets with null', () => {
    const ok = updateHoldingInputSchema.safeParse({
      holding_id: 'hld_01J',
      access_answer: null,
      cadence_days: null,
      archived: true,
    });
    expect(ok.success).toBe(true);
    expect(updateHoldingInputSchema.safeParse({}).success).toBe(false);
    expect(
      updateHoldingInputSchema.safeParse({ holding_id: 'hld_01J', cadence_days: 0 }).success,
    ).toBe(false);
  });

  it('delete_holding needs its holding', () => {
    expect(deleteHoldingInputSchema.safeParse({ holding_id: 'hld_01J' }).success).toBe(true);
    expect(deleteHoldingInputSchema.safeParse({}).success).toBe(false);
  });

  it('record_values takes 1 to 200 values', () => {
    const item = { holding_id: 'hld_01J', amount: '12.50' };
    expect(recordValuesInputSchema.safeParse({ values: [item] }).success).toBe(true);
    expect(recordValuesInputSchema.safeParse({ values: [] }).success).toBe(false);
    expect(
      recordValuesInputSchema.safeParse({ values: Array.from({ length: 201 }, () => item) })
        .success,
    ).toBe(false);
    expect(recordValuesInputSchema.safeParse({ values: [{ amount: '12.50' }] }).success).toBe(
      false,
    );
  });

  it('update_value patches within its fields', () => {
    const ok = updateValueInputSchema.safeParse({
      value_id: 'val_01J',
      amount: 9.99,
      fx_rate: null,
    });
    expect(ok.success).toBe(true);
    expect(updateValueInputSchema.safeParse({}).success).toBe(false);
    expect(updateValueInputSchema.safeParse({ value_id: 'val_01J', fx_rate: 'none' }).success).toBe(
      false,
    );
  });

  it('delete_value needs its value', () => {
    expect(deleteValueInputSchema.safeParse({ value_id: 'val_01J' }).success).toBe(true);
    expect(deleteValueInputSchema.safeParse({}).success).toBe(false);
  });

  it('upsert_type needs a universal type for a new type', () => {
    expect(upsertTypeInputSchema.safeParse({ name: 'Till', universal_type: 'cash' }).success).toBe(
      true,
    );
    expect(upsertTypeInputSchema.safeParse({ type_id: 'typ_01J', name: 'Till' }).success).toBe(
      true,
    );
    expect(upsertTypeInputSchema.safeParse({ name: 'Till' }).success).toBe(false);
  });

  it('delete_type moves with move_holdings_to', () => {
    const ok = deleteTypeInputSchema.safeParse({ type_id: 'typ_01J', move_holdings_to: 'typ_02K' });
    expect(ok.success).toBe(true);
    expect(deleteTypeInputSchema.safeParse({}).success).toBe(false);
  });

  it('upsert_tag renames with its id', () => {
    expect(upsertTagInputSchema.safeParse({ name: 'rainy' }).success).toBe(true);
    expect(upsertTagInputSchema.safeParse({ tag_id: 'tag_01J', name: 'rainy' }).success).toBe(true);
    expect(upsertTagInputSchema.safeParse({}).success).toBe(false);
  });

  it('delete_tag merges with merge_into', () => {
    const ok = deleteTagInputSchema.safeParse({ tag_id: 'tag_01J', merge_into: 'tag_02K' });
    expect(ok.success).toBe(true);
    expect(deleteTagInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      deleteValueInputSchema.safeParse({ value_id: 'val_01J', holding_id: 'hld_01J' }).success,
    ).toBe(false);
  });
});

describe('mcp error shape', () => {
  it('carries the code, the message and the fields', () => {
    const ok = mcpErrorSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'There is no holding "hld_01J".' },
    });
    expect(ok.success).toBe(true);
    const withFields = mcpErrorSchema.safeParse({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'values: Give 1 to 200 values.',
        fields: { values: 'Give 1 to 200 values.' },
        candidates: [{ id: 'hld_01J', name: 'Pot', latest: null }],
      },
    });
    expect(withFields.success).toBe(true);
    expect(mcpErrorSchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(false);
  });
});
