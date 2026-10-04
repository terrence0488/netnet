import type { AccessBasis, HoldingIn, UserTypeIn, ValueIn } from '@netnet/contracts';

/**
 * What `Ledger.context()` returns for `core.compileContext` (architecture §7.5). P1-T9 defines
 * these in `packages/contracts/src/context.ts`; until it lands they are declared here, exactly,
 * and then swapped for that import.
 */
export interface ContextConnection {
  id: string;
  client: 'claude' | 'chatgpt' | 'other';
  guideName?: string;
}
export interface ContextHolding extends HoldingIn {
  accessReason: string | null;
  accessUntil: string | null;
  accessBasis: AccessBasis | null;
}
export interface ContextValue extends ValueIn {
  connectionId: string | null;
}
export interface ContextType extends UserTypeIn {
  id: string;
}
export interface ContextTag {
  id: string;
  name: string;
}
export interface ContextInput {
  baseCurrency: string;
  /** Every holding, archived included. */
  holdings: readonly ContextHolding[];
  /** Every value of those holdings. */
  values: readonly ContextValue[];
  types: readonly ContextType[];
  tags: readonly ContextTag[];
  /** The user's connections, revoked included; guideName left unset (the caller fills it from content). */
  connections: readonly ContextConnection[];
}
