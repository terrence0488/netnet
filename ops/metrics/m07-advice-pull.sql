-- M7 · Advice pull (PRD §3.2): "% of connected users making ≥1 read-only agent query after week 1;
-- and median ≥3 such queries/user/month"; target 50%; kill below 20% on P-B and P-C (PRD §3.3).
-- Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: a read-only query is `agent_tool_called` with `kind` `read` (any outcome:
-- the premise is that they ask). "After week 1" is at or after signup + 7 days. The denominator is
-- the connected users whose week 1 had ended by :to. The median scales each person's reads to 30
-- days over their own observed days after week 1 (signup + 7 days to :to), so a person who joined
-- late is not compared as if they had the whole window. The person's segment is the one
-- non-unknown segment among their events, else `unknown`.
--
-- numerator/denominator are the persons the reading covers; `value` is the percentage or the
-- median. Parameters `:from`, `:to` (timestamptz) and `:exclude_users` (text[]). Reads
-- analytics.event only.

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
account_created as (
  select user_id,
         min(at) as created_at,
         max(props->>'method') as method
    from analytics.event
   where name = 'account_created'
     and user_id is not null
     and at >= :from
     and at < :to
     and not (user_id = any(:exclude_users))
   group by user_id
),
verified as (
  select user_id, min(at) as verified_at
    from analytics.event
   where name = 'email_verified'
     and user_id is not null
     and at < :to
     and not (user_id = any(:exclude_users))
   group by user_id
),
signups as (
  select c.user_id,
         c.created_at,
         case when c.method = 'email' then v.verified_at else c.created_at end as signup_at,
         a.segment
    from account_created c
    join account_segment a on a.user_id = c.user_id
    left join verified v on v.user_id = c.user_id
   where c.method in ('google', 'apple')
      or (c.method = 'email' and v.verified_at is not null and v.verified_at >= c.created_at)
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
reads as (
  select e.user_id, count(*) as reads
    from analytics.event e
    join signups s on s.user_id = e.user_id
   where e.name = 'agent_tool_called'
     and e.props->>'kind' = 'read'
     and e.at >= s.signup_at + interval '7 days'
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
per_user as (
  select c.user_id,
         a.segment,
         coalesce(r.reads, 0) as reads,
         coalesce(r.reads, 0) * 30.0
           / nullif(
               extract(epoch from (:to - (s.signup_at + interval '7 days'))) / 86400.0,
               0
             ) as reads_per_month
    from connected c
    join account_segment a on a.user_id = c.user_id
    join signups s on s.user_id = c.user_id
    left join reads r on r.user_id = c.user_id
   where s.signup_at + interval '7 days' <= :to
)
select 'M7' as metric,
       s.segment,
       (count(p.user_id) filter (where p.reads > 0))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round(
         100.0 * (count(p.user_id) filter (where p.reads > 0)) / nullif(count(p.user_id), 0),
         1
       ) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
union all
select 'M7 median' as metric,
       s.segment,
       (count(p.user_id))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round((percentile_cont(0.5) within group (order by p.reads_per_month))::numeric, 1) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
 order by metric, segment;
