-- M9 · Time to value (PRD §3.2): "p50 minutes from signup to first agent interaction (read or
-- write)"; target below 15 minutes. Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: signup is the same instant M1 uses (a verification for an email account, the
-- creation for Google/Apple); the first interaction is the earliest `agent_tool_called` at or
-- after it. The median is over the signups that had an interaction; the denominator is all
-- signups in the window, so the numerator says how many the median speaks for. The person's
-- segment is the one non-unknown segment among their events, else `unknown`.
--
-- Parameters `:from`, `:to` (timestamptz) and `:exclude_users` (text[]). Reads analytics.event
-- only.

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
first_call as (
  select e.user_id, min(e.at) as first_at
    from analytics.event e
    join signups s on s.user_id = e.user_id
   where e.name = 'agent_tool_called'
     and e.at >= s.signup_at
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
per_user as (
  select s.user_id, s.segment, s.signup_at, f.first_at
    from signups s
    left join first_call f on f.user_id = s.user_id
)
select 'M9' as metric,
       s.segment,
       (count(p.first_at))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round(
         (percentile_cont(0.5) within group (
           order by extract(epoch from (p.first_at - p.signup_at)) / 60.0
         ))::numeric,
         1
       ) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
 order by s.segment;
