-- M4 · Agent write adoption (PRD §3.2): "% of connected users with ≥1 successful write tool call;
-- median ≥5 writes/user/month"; target 70%. Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: a connected user is one with an `agent_connection_completed` before :to; a
-- successful write is an `agent_tool_called` with `kind` `write` and `outcome` `ok` (a failed call
-- is a different event outcome and does not count). "Per month" scales the window's writes to 30
-- days: writes × 30 / the window's days. The median is across the connected users, so a person
-- with no write counts as 0. The person's segment is the one non-unknown segment among their
-- events, else `unknown`.
--
-- numerator/denominator are the persons the reading covers (connected users for the rate, the
-- same users for the median); `value` is the percentage or the median. Parameters `:from`, `:to`
-- (timestamptz) and `:exclude_users` (text[]). Reads analytics.event only.

with segments(segment) as (
  values ('starting_out'), ('accumulating'), ('established'), ('unknown'), ('blended')
),
account_segment as (
  select user_id,
         coalesce(max(segment) filter (where segment <> 'unknown'), 'unknown') as segment
    from analytics.event
   where user_id is not null
     and not (user_id = any(:exclude_users))
   group by user_id
),
connected as (
  select e.user_id
    from analytics.event e
   where e.name = 'agent_connection_completed'
     and e.user_id is not null
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
writes as (
  select e.user_id, count(*) as writes
    from analytics.event e
   where e.name = 'agent_tool_called'
     and e.props->>'kind' = 'write'
     and e.props->>'outcome' = 'ok'
     and e.at >= :from
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
per_user as (
  select c.user_id,
         a.segment,
         coalesce(w.writes, 0) as writes,
         coalesce(w.writes, 0) * 30.0
           / nullif(extract(epoch from (:to - :from)) / 86400.0, 0) as writes_per_month
    from connected c
    join account_segment a on a.user_id = c.user_id
    left join writes w on w.user_id = c.user_id
)
select 'M4' as metric,
       s.segment,
       (count(p.user_id) filter (where p.writes > 0))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round(
         100.0 * (count(p.user_id) filter (where p.writes > 0)) / nullif(count(p.user_id), 0),
         1
       ) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
union all
select 'M4 median' as metric,
       s.segment,
       (count(p.user_id))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round((percentile_cont(0.5) within group (order by p.writes_per_month))::numeric, 1) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
 order by metric, segment;
