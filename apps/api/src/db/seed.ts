import { seedLedger } from '../ledger/seed';
import { createWithUser } from '../ledger/with-user';
import type { Database } from './client';
import { agentConnection, fxRate, profile } from './schema';

/**
 * Fictional data for a preview or a local database (`pnpm db:seed`): one demo person with a
 * profile, an agent connection, a few exchange rates and a small ledger. Every name and figure is
 * made up (CONVENTIONS §6). It runs as `netnet_app`, like the app, and can run again: rows that
 * exist are left alone.
 */
export const DEMO_USER_ID = 'usr_01K1G4KX00DEM0000000000000';
export const DEMO_CONNECTION_ID = 'con_01K1G4KX00DEM0000000000000';

/** When the seed says things happened: 2026-07-31T09:00:00Z. */
const SEEDED_AT = new Date(Date.UTC(2026, 6, 31, 9));

export async function seed(db: Database): Promise<void> {
  await db
    .insert(profile)
    .values({
      userId: DEMO_USER_ID,
      country: null,
      timeZone: 'UTC',
      segment: 'accumulating',
      onboardingState: 'done',
      createdAt: SEEDED_AT,
    })
    .onConflictDoNothing();
  await db
    .insert(agentConnection)
    .values({
      id: DEMO_CONNECTION_ID,
      userId: DEMO_USER_ID,
      clientId: 'https://agent.example/client.json',
      clientName: 'Fictional agent',
      registration: 'cimd',
      client: 'other',
      createdAt: SEEDED_AT,
      firstCallAt: SEEDED_AT,
      lastUsedAt: SEEDED_AT,
      securityEmailSentAt: SEEDED_AT,
    })
    .onConflictDoNothing();
  await db
    .insert(fxRate)
    .values([
      { date: '2026-07-31', currency: 'USD', perUsd: '1', source: 'ecb' },
      { date: '2026-07-31', currency: 'EUR', perUsd: '0.9217', source: 'ecb' },
      { date: '2026-07-31', currency: 'GBP', perUsd: '0.7843', source: 'ecb' },
    ])
    .onConflictDoNothing();
  await seedLedger(
    createWithUser(() => ({ db, clock: () => SEEDED_AT })),
    {
      userId: DEMO_USER_ID,
      baseCurrency: 'USD',
      connectionId: DEMO_CONNECTION_ID,
    },
  );
}
