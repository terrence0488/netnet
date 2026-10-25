/**
 * Every message NetNet sends a person (architecture §7.10, CONVENTIONS §6): typed parameters,
 * never free text, so no field exists that an amount, a total, or a holding, type or tag name could
 * be put in. A new kind is added here with its template and its privacy-test samples.
 *
 * `ops.health_alert` is the one kind that goes to the operator, not to a person: it names no
 * user, and `notifyOperator` sends it to `OPS_EMAIL` (architecture §9.3, P4-T4).
 */
import type { HealthFigures, HealthTriggerId } from './health-alert';

export type Message =
  /** The link that verifies a new account's email (PRD J1). `token` is Better Auth's. */
  | { kind: 'account.verify_email'; token: string }
  /**
   * The comeback reminder (PRD J12): push to every active device, email only when there is none
   * or every push failed. `agentName` is the connected agent used most recently — the guide's name
   * for `claude`/`chatgpt`, the registered name for `other` only when short and plain — or absent
   * when no agent is connected or its name cannot be shown; the "Just ask" line is then left out.
   */
  | { kind: 'reminder.comeback'; agentName?: string | undefined }
  /** The link that sets a new password. `token` is Better Auth's, single use. */
  | { kind: 'account.reset_password'; token: string }
  /**
   * An agent was connected (PRD J5): sent on every Allow, by email only, whatever the Reminders
   * switches say. `agentName` is the name it registered with, untrusted: the template cleans,
   * cuts and escapes it. `nameVerified` is false for a DCR client, whose name NetNet cannot check.
   * `connectedAt` is an ISO instant, shown in `timeZone` (IANA).
   */
  | {
      kind: 'security.agent_connected';
      agentName: string;
      nameVerified: boolean;
      connectedAt: string;
      timeZone: string;
    }
  /**
   * The Founder's daily health alert (architecture §9.3, §9.4; P4-T4), sent by `notifyOperator`
   * to `OPS_EMAIL` only. It names no user: counts, sizes, percentages and dates only.
   */
  | {
      kind: 'ops.health_alert';
      /** The triggers that fired, in `HEALTH_TRIGGER_IDS` order. */
      triggers: HealthTriggerId[];
      /** What the check read: counts, sizes, percentages and dates only. */
      figures: HealthFigures;
      /** A dispatched test: the subject says so, and the alert may go out with no trigger. */
      test: boolean;
    };

export type MessageKind = Message['kind'];

export type MessageOf<K extends MessageKind> = Extract<Message, { kind: K }>;

/**
 * What became of a message: the channel that took it, or null with the reason. `devices` counts
 * the push devices reached (web push, P3).
 */
export interface Delivery {
  channel: 'push' | 'email' | null;
  devices?: number;
  reason?: 'off' | 'nowhere' | 'failed';
}

/** The only way to reach a person (architecture §7.10). It never throws: see `Delivery`. */
export type Notify = (userId: string, msg: Message) => Promise<Delivery>;

/**
 * The operator's alert (architecture §9.3): the sibling of `notify` that goes to `OPS_EMAIL` and
 * nowhere else. It takes no user id, because the day's figures belong to no account.
 */
export type NotifyOperator = (msg: MessageOf<'ops.health_alert'>) => Promise<Delivery>;
