-- M3 · Agent connection rate (PRD §3.2): "% of signups completing OAuth from an MCP client within
-- 14 days"; target 40%; kill below 15% on P-B and P-C (PRD §3.3). Window [ :from, :to ), UTC,
-- with :to exclusive.
--
-- How this reads it: `agent_connection_completed` fires when an approval finishes the OAuth
-- connection (architecture §7.7), so one event is one connected account; repeated tool calls add
-- none. "Within 14 days" is 14 × 24 hours after the signup instant (a verification for an email
-- account, the creation for Google/Apple). The denominator is the signups whose 14 days had ended
-- by :to, so an immature cohort does not deflate the rate. `client` is carried by the event but
-- this reading is the overall rate; the person's segment is the one non-unknown segment among
-- their events, else `unknown`.
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
  select * from signups where signup_at + interval '14 days' <= :to
),
connections as (
  select e.user_id
    from analytics.event e
    join signups s on s.user_id = e.user_id
   where e.name = 'agent_connection_completed'
     and e.at >= s.signup_at
     and e.at < s.signup_at + interval '14 days'
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
)
select 'M3' as metric,
       s.segment,
       (count(m.user_id) filter (where c.user_id is not null))::bigint as numerator,
       (count(m.user_id))::bigint as denominator,
       round(
         100.0 * (count(m.user_id) filter (where c.user_id is not null))
           / nullif(count(m.user_id), 0),
         1
       ) as value
  from segments s
  left join mature m on s.segment = 'blended' or m.segment = s.segment
  left join connections c on c.user_id = m.user_id
 group by s.segment
 order by s.segment;
