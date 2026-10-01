/** Shared by the `db:*` scripts. Connection strings and passwords are never printed. */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example).`);
  return value;
}

/** Runs a script's body, printing one line on success and the error's message on failure. */
export async function run(script: string, body: () => Promise<string>): Promise<void> {
  try {
    console.log(`${script}: ${await body()}`);
  } catch (error) {
    console.error(`${script} failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
