-- M6 · Return rate (PRD §3.2): "% of signups with any activity (web or agent) in calendar week 4";
-- target 30%; kill below 10% on P-B and P-C (PRD §3.3). Window [ :from, :to ), UTC, with :to
-- exclusive.
--
-- How this reads it: activity is `session_started` (web) or `agent_tool_called` (agent). Week 4 is
-- the fourth seven-day period after the signup instant: [signup + 21 days, signup + 28 days). The
-- denominator is the signups whose week 4 had ended by :to, so a cohort that has not reached week
-- 4 does not deflate the rate. The person's segment is the one non-unknown segment among their
-- events, else `unknown`.
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
mature as (
  select * from signups where signup_at + interval '28 days' <= :to
),
activity as (
  select e.user_id
    from analytics.event e
    join signups s on s.user_id = e.user_id
   where e.name in ('session_started', 'agent_tool_called')
     and e.at >= s.signup_at + interval '21 days'
     and e.at < s.signup_at + interval '28 days'
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
)
select 'M6' as metric,
       s.segment,
       (count(m.user_id) filter (where a.user_id is not null))::bigint as numerator,
       (count(m.user_id))::bigint as denominator,
       round(
         100.0 * (count(m.user_id) filter (where a.user_id is not null))
           / nullif(count(m.user_id), 0),
         1
       ) as value
  from segments s
  left join mature m on s.segment = 'blended' or m.segment = s.segment
  left join activity a on a.user_id = m.user_id
 group by s.segment
 order by s.segment;
