# Production backups

`backup.yml` dumps `netnet-prod` daily at 02:30 UTC — `pg_dump` of every schema as owner,
`--no-owner --no-privileges` — encrypts it with `age` to `BACKUP_PUBLIC_KEY`, and keeps the
artifact 30 days. That is also the account-deletion window the app states (architecture §8):
anything deleted is gone from the live database at once and from every backup within 30 days.

Only the Founder's private key opens a backup. It lives offline, never in the repository, the
workflows or a chat. Losing it makes every backup unreadable; rotating it means generating a
new key, storing the new public half as the secret, and knowing the older artifacts stay under
the old key.

## Restoring to a scratch branch (a check, or the start of a recovery)

1. Download the artifact (`netnet-prod-‹date›.sql.age`) from the backup run.
2. Decrypt it with the private key:
   ```sh
   age -d -i /path/to/netnet-backup-key.txt netnet-prod-‹date›.sql.age -o restore.sql
   ```
3. Make a scratch branch of the `netnet-prod` project (Neon's Branches → New Branch) and take
   its owner connection string.
4. Restore into it:
   ```sh
   psql '‹scratch owner connection string›' -v ON_ERROR_STOP=1 -f restore.sql
   ```
5. Verify: the schemas and row counts look like production's, for example
   ```sql
   select schemaname, tablename from pg_tables
   where schemaname in ('ledger', 'core', 'analytics') order by 1, 2;
   select count(*) from ledger.holding;
   select count(*) from core.user;
   ```
6. Delete the scratch branch when done. For a real recovery, keep it: once it is verified,
   move production to it (point the `DATABASE_URL`s at it, or restore the same file over the
   main branch the same way), and only then delete the old branch.

## Restore proof

The brief asks for one proven restore on fictional data, before any real data exists. (Blocked:
F12 — there is no production database yet. Run `backup.yml` by hand once production holds only
fictional data, restore it as above, and record it here.)

| Date | Artifact | Scratch branch | Result |
|---|---|---|---|
| — | — | — | — |
