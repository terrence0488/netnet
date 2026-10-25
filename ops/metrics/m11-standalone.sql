-- M11 · Standalone value (PRD §3.2): "% of signups with ≥2 sessions before any agent connection;
-- and % still active in week 4 having never connected"; targets 40% and 15%. Window [ :from,
-- :to ), UTC, with :to exclusive.
--
-- How this reads it: a session is `session_started`. "Before any agent connection" compares it
-- with the first `agent_connection_completed`; a person who never connected has all their sessions
-- count. Week 4 is [signup + 21 days, signup + 28 days); "active" is `session_started` or
-- `agent_tool_called` in it, and "never connected" means no completed connection before :to. The
-- week-4 denominator is the signups whose week 4 had ended by :to; the first reading uses every
-- signup in the window. The person's segment is the one non-unknown segment among their events,
-- else `unknown`.
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
connected as (
  select e.user_id, min(e.at) as connected_at
    from analytics.event e
   where e.name = 'agent_connection_completed'
     and e.user_id is not null
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
sessions as (
  select e.user_id, count(*) as sessions
    from analytics.event e
    join signups s on s.user_id = e.user_id
    left join connected c on c.user_id = e.user_id
   where e.name = 'session_started'
     and e.at < :to
     and (c.connected_at is null or e.at < c.connected_at)
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
week4 as (
  select e.user_id
    from analytics.event e
    join signups s on s.user_id = e.user_id
   where e.name in ('session_started', 'agent_tool_called')
     and e.at >= s.signup_at + interval '21 days'
     and e.at < s.signup_at + interval '28 days'
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
per_user as (
  select s.user_id,
         s.segment,
         coalesce(se.sessions, 0) as sessions,
         (c.connected_at is null) as never_connected,
         (w.user_id is not null) as week4_active,
         (s.signup_at + interval '28 days' <= :to) as mature
    from signups s
    left join sessions se on se.user_id = s.user_id
    left join connected c on c.user_id = s.user_id
    left join week4 w on w.user_id = s.user_id
)
select 'M11 sessions' as metric,
       s.segment,
       (count(p.user_id) filter (where p.sessions >= 2))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round(
         100.0 * (count(p.user_id) filter (where p.sessions >= 2)) / nullif(count(p.user_id), 0),
         1
       ) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
union all
select 'M11 week 4' as metric,
       s.segment,
       (count(p.user_id) filter (
         where p.mature and p.never_connected and p.week4_active
       ))::bigint as numerator,
       (count(p.user_id) filter (where p.mature))::bigint as denominator,
       round(
         100.0 * (count(p.user_id) filter (
           where p.mature and p.never_connected and p.week4_active
         )) / nullif((count(p.user_id) filter (where p.mature)), 0),
         1
       ) as value
  from segments s
  left join per_user p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
 order by metric, segment;
