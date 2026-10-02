/** Shared by the `db:*` scripts. Connection strings and passwords are never printed. */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example).`);
  return value;
}

/** An error's message and its causes' (Drizzle wraps Postgres's error in `cause`). */
function describe(error: unknown): string {
  const messages: string[] = [];
  for (let e: unknown = error; e instanceof Error && messages.length < 3; e = e.cause) {
    messages.push(e.message);
  }
  return messages.length > 0 ? messages.join('\n  caused by: ') : String(error);
}

/** Runs a script's body, printing one line on success and the error's messages on failure. */
export async function run(script: string, body: () => Promise<string>): Promise<void> {
  try {
    console.log(`${script}: ${await body()}`);
  } catch (error) {
    console.error(`${script} failed: ${describe(error)}`);
    process.exitCode = 1;
  }
}
