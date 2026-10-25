import {
  newValuesSchema,
  valuePatchSchema,
  type DomainEvent,
  type NewValue,
  type Value,
  type ValuePatch,
  type ValueResult,
  type Warning,
  type Write,
} from '@netnet/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { FieldErrors, notFound, parseInput } from './input';
import {
  givenRateOf,
  majorAmount,
  prepareValue,
  sameGivenRate,
  type PreparedValue,
  type ValueRate,
} from './money';
import { loadHoldings, loadValue, loadValueRow, toValue, type ValueRow } from './rows';
import { value } from './schema';
import type { Scope } from './scope';
import { runWrite, type WriteScope } from './write';

/**
 * Values (PRD J3, architecture §6.6): one per holding and date, the latest by date driving the
 * totals. A value for a date that already has one replaces it, with a warning.
 */

const DAY_MS = 86_400_000;
/** `value_corrected`'s bound on `age_at_correction` (contracts' events). */
const MAX_AGE_DAYS = 36_500;

const key = (holdingId: string, date: string) => `${holdingId}|${date}`;

/** `value_corrected`, for a change to `old`'s amount, date or currency, or its deletion (§7.7). */
function corrected(w: WriteScope, old: Value): DomainEvent | undefined {
  if (!w.eventSource) return undefined;
  const days = Math.floor((w.s.now().getTime() - Date.parse(old.enteredAt)) / DAY_MS);
  return {
    name: 'value_corrected',
    props: {
      original_source: old.source,
      age_at_correction: Math.min(Math.max(days, 0), MAX_AGE_DAYS),
    },
  };
}

function recorded(w: WriteScope): DomainEvent | undefined {
  const source = w.eventSource;
  return source ? { name: 'value_recorded', props: { source } } : undefined;
}

function fire(w: WriteScope, event: DomainEvent | undefined): void {
  if (event) w.event(event);
}

/** The columns a prepared value and its writer set. */
async function written(w: WriteScope, prepared: PreparedValue) {
  const now = w.s.now();
  return {
    date: prepared.date,
    amountMinor: prepared.amountMinor,
    currency: prepared.currency,
    baseMinor: prepared.baseMinor,
    baseCurrency: prepared.baseCurrency,
    fxRate: prepared.fxRate,
    fxRateDate: prepared.fxRateDate,
    fxSource: prepared.fxSource,
    givenRate: prepared.givenRate?.rate ?? null,
    givenRateInto: prepared.givenRate?.into ?? null,
    givenRateBy: prepared.givenRate?.by ?? null,
    ...(await w.provenance()),
    updatedAt: now,
  };
}

/** Inserts a new value for `holdingId`, with its audit row. */
export async function insertValue(
  w: WriteScope,
  holdingId: string,
  prepared: PreparedValue,
): Promise<Value> {
  const [created] = await insertValues(w, holdingId, [prepared]);
  if (!created) throw new Error('unreachable: one value in, one out');
  return created;
}

/**
 * Inserts new values for `holdingId` in one statement, each with its audit row, in the order
 * given. The holding has no value on any of their dates, and they are on different dates: the
 * caller has made sure (the demo household's loader, `./demo`, for a holding it just created).
 */
export async function insertValues(
  w: WriteScope,
  holdingId: string,
  prepared: readonly PreparedValue[],
): Promise<Value[]> {
  const { s } = w;
  const rows: ValueRow[] = [];
  for (const p of prepared) {
    rows.push({
      userId: s.userId,
      id: s.id('val'),
      holdingId,
      ...(await written(w, p)),
      enteredAt: s.now(),
      rowVersion: 1,
    });
  }
  if (rows.length === 0) return [];
  await s.db.insert(value).values(rows);
  const created = rows.map(toValue);
  for (const v of created) await w.audit('value', v.id, 'create', null, v);
  return created;
}

/** Replaces `old` (same holding and date) with `prepared`, as a new entry by this writer. */
async function replaceValue(w: WriteScope, old: Value, prepared: PreparedValue): Promise<Value> {
  const { s } = w;
  const set = {
    ...(await written(w, prepared)),
    enteredAt: s.now(),
    rowVersion: old.rowVersion + 1,
  };
  const [row] = await s.db
    .update(value)
    .set(set)
    .where(and(eq(value.userId, s.userId), eq(value.id, old.id)))
    .returning();
  if (!row) throw new Error('The value to replace vanished inside its own write.');
  const next = toValue(row);
  await w.audit('value', old.id, 'update', old, next);
  return next;
}

function sameDateWarning(path: string | undefined, message: string): Warning {
  return path === undefined
    ? { code: 'SAME_DATE_REPLACED', message }
    : { code: 'SAME_DATE_REPLACED', message, path };
}

/** `recordValues` (`record_values`): 1 to 200 values, all written or none (J6), as one batch. */
export function recordValues(s: Scope, items: readonly NewValue[]): Promise<Write<ValueResult[]>> {
  const parsed = parseInput(newValuesSchema, items, 'values');
  return runWrite(s, 'recordValues', async (w) => {
    const errors = new FieldErrors();
    const holdingIds = [...new Set(parsed.map((i) => i.holdingId))];
    const holdings = new Map((await loadHoldings(s, holdingIds)).map((h) => [h.id, h]));
    const prepared: (PreparedValue | undefined)[] = [];
    for (const [index, item] of parsed.entries()) {
      const at = `values[${index}]`;
      const target = holdings.get(item.holdingId);
      if (!target) {
        errors.add(
          'NOT_FOUND',
          `${at}.holdingId`,
          `There is no holding "${item.holdingId}" in this account.`,
        );
        prepared.push(undefined);
        continue;
      }
      prepared.push(
        await prepareValue(
          w,
          {
            amount: item.amount,
            currency: item.currency ?? target.currency,
            date: item.date,
            fxRate: item.fxRate,
          },
          at,
          errors,
        ),
      );
    }
    errors.throwIfAny();
    const ready = prepared as PreparedValue[];

    // Two items for one holding and date: the later wins, the earlier is not written (J3).
    const winner = new Map<string, number>();
    ready.forEach((p, index) => winner.set(key(parsed[index]!.holdingId, p.date), index));

    const stored = new Map<string, Value>();
    const rows = await s.db
      .select()
      .from(value)
      .where(
        and(
          eq(value.userId, s.userId),
          inArray(value.holdingId, holdingIds),
          inArray(value.date, [...new Set(ready.map((p) => p.date))]),
        ),
      );
    for (const row of rows) stored.set(key(row.holdingId, row.date), toValue(row));

    const results: { value?: Value; replaced: boolean; warnings: Warning[] }[] = [];
    for (const [index, p] of ready.entries()) {
      const holdingId = parsed[index]!.holdingId;
      const kept = winner.get(key(holdingId, p.date))!;
      if (kept !== index) {
        const warning = sameDateWarning(
          `values[${index}]`,
          `values[${kept}] is for the same holding and date (${p.date}), so it was kept and this one was not written.`,
        );
        w.warn(warning);
        results.push({ replaced: false, warnings: [warning] });
        continue;
      }
      const old = stored.get(key(holdingId, p.date));
      if (!old) {
        results.push({ value: await insertValue(w, holdingId, p), replaced: false, warnings: [] });
        fire(w, recorded(w));
        continue;
      }
      const next = await replaceValue(w, old, p);
      const warning = sameDateWarning(
        `values[${index}]`,
        `Replaced the value already recorded for this holding on ${p.date} (${old.id}): one value per holding and date.`,
      );
      w.warn(warning);
      results.push({ value: next, replaced: true, warnings: [warning] });
      const changed = old.amountMinor !== next.amountMinor || old.currency !== next.currency;
      fire(w, changed ? corrected(w, old) : recorded(w));
    }

    // An item that lost to a later one shows the value that was kept.
    return results.map((r, index) => {
      const kept = winner.get(key(parsed[index]!.holdingId, ready[index]!.date))!;
      return { ...r, value: r.value ?? results[kept]!.value! };
    });
  });
}

/**
 * `updateValue` (`update_value`): a correction. A rate given now becomes the value's given rate
 * (architecture §6.6); one given earlier stays through edits to the amount and date, until the
 * caller drops it (`fxRate: null`) or moves the value to another currency without a new one. A
 * published rate is looked up again only when the date or currency changes. Moving to a date that
 * already has a value replaces it, with a warning.
 */
export function updateValue(s: Scope, id: string, patch: ValuePatch): Promise<Write<Value>> {
  const p = parseInput(valuePatchSchema, patch);
  return runWrite(s, 'updateValue', async (w) => {
    const stored = await loadValueRow(s, id);
    if (!stored) throw notFound('value', id);
    const current = toValue(stored);
    const currentGiven = givenRateOf(stored);
    const errors = new FieldErrors();
    const currency = p.currency ?? current.currency;
    const date = p.date ?? current.date;
    const sameCurrency = currency === current.currency;
    const keptRate: ValueRate | undefined =
      p.fxRate === undefined &&
      sameCurrency &&
      date === current.date &&
      current.fxSource !== 'same' &&
      current.baseCurrency === w.state.baseCurrency
        ? { rate: current.fxRate, rateDate: current.fxRateDate, source: current.fxSource }
        : undefined;
    const prepared = await prepareValue(
      w,
      {
        amount: p.amount ?? majorAmount(current.amountMinor, current.currency),
        currency,
        date,
        fxRate: p.fxRate,
        given: sameCurrency && p.fxRate !== null ? currentGiven : null,
        stored: keptRate,
      },
      '',
      errors,
    );
    errors.throwIfAny();
    if (!prepared) throw new Error('unreachable: a value that failed has errors');

    const unchanged =
      prepared.amountMinor === current.amountMinor &&
      prepared.currency === current.currency &&
      prepared.date === current.date &&
      prepared.baseMinor === current.baseMinor &&
      prepared.fxRate === current.fxRate &&
      prepared.fxRateDate === current.fxRateDate &&
      prepared.fxSource === current.fxSource &&
      sameGivenRate(prepared.givenRate, currentGiven);
    if (unchanged) return current;

    if (prepared.date !== current.date) {
      const [clash] = await s.db
        .select()
        .from(value)
        .where(
          and(
            eq(value.userId, s.userId),
            eq(value.holdingId, current.holdingId),
            eq(value.date, prepared.date),
          ),
        )
        .limit(1);
      if (clash) {
        const replaced = toValue(clash);
        await s.db.delete(value).where(and(eq(value.userId, s.userId), eq(value.id, clash.id)));
        await w.audit('value', replaced.id, 'delete', replaced, null);
        w.warn(
          sameDateWarning(
            undefined,
            `Replaced the value already recorded for this holding on ${prepared.date} (${replaced.id}): one value per holding and date.`,
          ),
        );
      }
    }

    const [row] = await s.db
      .update(value)
      .set({ ...(await written(w, prepared)), rowVersion: current.rowVersion + 1 })
      .where(and(eq(value.userId, s.userId), eq(value.id, id)))
      .returning();
    if (!row) throw new Error('The value vanished inside its own write.');
    const next = toValue(row);
    await w.audit('value', id, 'update', current, next);
    if (
      next.amountMinor !== current.amountMinor ||
      next.currency !== current.currency ||
      next.date !== current.date
    ) {
      fire(w, corrected(w, current));
    }
    return next;
  });
}

/** `deleteValue` (`delete_value`): a correction too, so it fires `value_corrected` (§6.8). */
export function deleteValue(s: Scope, id: string): Promise<Write<void>> {
  return runWrite(s, 'deleteValue', async (w) => {
    const current = await loadValue(s, id);
    if (!current) throw notFound('value', id);
    await s.db.delete(value).where(and(eq(value.userId, s.userId), eq(value.id, id)));
    await w.audit('value', id, 'delete', current, null);
    fire(w, corrected(w, current));
  });
}
