-- M13 · Comeback rate (PRD §3.2): "Of comeback reminders sent, % followed by the person checking
-- NetNet (opening it, or their agent using it) within 7 days, per channel; and % of week-4-active
-- users with push on for ≥1 device". Targets: push above email on the first, 25% on the second.
-- Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: `reminder_sent` fires once per reminder, however many devices it reached, and
-- carries `channel` (push or email). "Checked" is a `session_started` or an `agent_tool_called` by
-- the same user in [sent, sent + 7 days); a check at exactly 7 days is outside. "Week-4 active" is
-- a `session_started` or `agent_tool_called` in [signup + 21 days, signup + 28 days), and only
-- signups whose week 4 had ended by :to are read. Push on for a person is `push_enabled` minus
-- `push_disabled` before the end of their week 4: `saveEndpoint` reports `created` or
-- `reactivated`, so enabling a device already on writes no second `push_enabled` (apps/api/src/db/
-- endpoints.ts, http/notifications.ts), and a reactivation after a disable nets to zero. Two
-- devices on then one off nets one; the events carry no device id, so this is per person, not per
-- device. The person's segment is the one non-unknown segment among their events, else `unknown`;
-- `channel` is email/push for the comeback rate and null for the push share.
--
-- Parameters `:from`, `:to` (timestamptz) and `:exclude_users` (text[]). Reads analytics.event
-- only.

with segments(segment) as (
  values ('starting_out'), ('accumulating'), ('established'), ('unknown'), ('blended')
),
channels(channel) as (
  values ('email'), ('push')
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
reminders as (
  select e.id,
         e.user_id,
         e.at as sent_at,
         e.props->>'channel' as channel,
         a.segment
    from analytics.event e
    join account_segment a on a.user_id = e.user_id
   where e.name = 'reminder_sent'
     and e.user_id is not null
     and e.props->>'channel' in ('email', 'push')
     and e.at >= :from
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
),
checked as (
  select r.id,
         r.segment,
         r.channel,
         exists (
           select 1
             from analytics.event e
            where e.user_id = r.user_id
              and e.name in ('session_started', 'agent_tool_called')
              and e.at >= r.sent_at
              and e.at < r.sent_at + interval '7 days'
              and e.at < :to
         ) as checked
    from reminders r
),
week4 as (
  select s.user_id, s.segment, s.signup_at
    from signups s
   where s.signup_at + interval '28 days' <= :to
     and exists (
       select 1
         from analytics.event e
        where e.user_id = s.user_id
          and e.name in ('session_started', 'agent_tool_called')
          and e.at >= s.signup_at + interval '21 days'
          and e.at < s.signup_at + interval '28 days'
     )
),
push_net as (
  select w.user_id,
         w.segment,
         (count(e.user_id) filter (where e.name = 'push_enabled')
          - count(e.user_id) filter (where e.name = 'push_disabled'))::bigint as net
    from week4 w
    left join analytics.event e
      on e.user_id = w.user_id
     and e.name in ('push_enabled', 'push_disabled')
     and e.at < w.signup_at + interval '28 days'
   group by w.user_id, w.segment
)
select 'M13 comeback' as metric,
       s.segment,
       ch.channel,
       (count(c.id) filter (where c.checked))::bigint as numerator,
       (count(c.id))::bigint as denominator,
       round(
         100.0 * (count(c.id) filter (where c.checked)) / nullif(count(c.id), 0),
         1
       ) as value
  from segments s
  cross join channels ch
  left join checked c
    on c.channel = ch.channel
   and (s.segment = 'blended' or c.segment = s.segment)
 group by s.segment, ch.channel
union all
select 'M13 push' as metric,
       s.segment,
       null::text as channel,
       (count(p.user_id) filter (where p.net > 0))::bigint as numerator,
       (count(p.user_id))::bigint as denominator,
       round(
         100.0 * (count(p.user_id) filter (where p.net > 0)) / nullif(count(p.user_id), 0),
         1
       ) as value
  from segments s
  left join push_net p on s.segment = 'blended' or p.segment = s.segment
 group by s.segment
 order by metric, segment, channel;
