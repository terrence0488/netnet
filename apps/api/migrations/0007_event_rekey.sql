-- P3-T4 (PRD J10): deleting an account re-keys its analytics events to a random id
-- (architecture §6.4), so the app role may read and update that one column: the UPDATE's WHERE
-- reads it, the SET writes it. Inserting stays the only other write it may do to this table, and
-- every other column stays unreadable to it.
GRANT SELECT ("user_id"), UPDATE ("user_id") ON "analytics"."event" TO "netnet_app";
