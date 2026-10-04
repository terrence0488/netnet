/**
 * Every message NetNet sends a person (architecture §7.10, CONVENTIONS §6): typed parameters,
 * never free text, so no field exists that an amount, a total, or a holding, type or tag name could
 * be put in. A new kind is added here with its template and its privacy-test samples.
 */
export type Message =
  /** The link that verifies a new account's email (PRD J1). `token` is Better Auth's. */
  | { kind: 'account.verify_email'; token: string }
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
