-- M8 · Freshness (PRD §3.2): "Median days since last value update, across users active in the last
-- 30 days"; target below 45 days. The 30 days end at :to.
--
-- How this reads it: a value update is `value_recorded` (web or agent); a correction is not a
-- fresh value, and a deletion would wrongly refresh the picture. "Active" is a `session_started`
-- or an `agent_tool_called` in the 30 days before :to, or the window when it starts later. A person
-- who has never recorded a value is measured from their first account event (or their first
-- event, when no account event is readable), so a picture that was never filled does not look
-- fresh. The median is
-- across the active users; the person's segment is the one non-unknown segment among their
-- events, else `unknown`.
--
-- numerator/denominator are the active users the median covers; `value` is the median in days.
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
signup as (
  select user_id, min(at) as signup_at
    from analytics.event
   where user_id is not null
     and name in ('account_created', 'email_verified')
   group by user_id
),
active as (
  select e.user_id,
         max(e.at) as last_active,
         min(e.at) as first_seen
    from analytics.event e
   where e.name in ('session_started', 'agent_tool_called')
     and e.user_id is not null
     and e.at >= greatest(:from, :to - interval '30 days')
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
last_value as (
  select e.user_id, max(e.at) as last_value_at
    from analytics.event e
   where e.name = 'value_recorded'
     and e.user_id is not null
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
per_user as (
  select a.user_id,
         s.segment,
         extract(
           epoch from (:to - coalesce(v.last_value_at, sg.signup_at, a.first_seen))
         ) / 86400.0 as days
    from active a
    join account_segment s on s.user_id = a.user_id
    left join last_value v on v.user_id = a.user_id
    left join signup sg on sg.user_id = a.user_id
)
select 'M8' as metric,
       s.segment,
       (count(p.user_id))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round((percentile_cont(0.5) within group (order by p.days))::numeric, 1) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
 order by s.segment;
