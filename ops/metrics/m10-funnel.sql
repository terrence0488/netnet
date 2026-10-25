-- M10 · Funnel conversion (PRD §3.2): "Landing-page unique visitors → signup"; target ≥8% on
-- ≥1,200 visits (G-D4). Window [ :from, :to ), UTC, with :to exclusive. The funnel is read daily:
-- landing visitors are each UTC day's unique hashes, summed over the window.
--
-- How this reads it: `landing_view` carries a `visitor` hash made with that UTC day's salt
-- (architecture §6.4), so a visitor is unique per day only. The visitor count here is the sum of
-- daily uniques, which overstates a person who visits on several days: they count once per day,
-- not once in the window. `signup_started` is anonymous (no user id) and is counted as events.
-- `account_created` and `verified` are joined to the account by `user_id`; their own segment is
-- `unknown` and the person's one non-unknown segment is used instead. The conversion is blended
-- only: visitors are anonymous, so they cannot be split by segment.
--
-- A signup is an `account_created` by Google/Apple or an `email_verified` (PRD §3.5); an email
-- account unverified at :to is an account created but not a verified signup. Parameters `:from`,
-- `:to` (timestamptz) and `:exclude_users` (text[]); the probe account's events are excluded by
-- user id, but its anonymous landing views cannot be (it never visits the landing page). Reads
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
created as (
  select c.user_id, a.segment
    from account_created c
    join account_segment a on a.user_id = c.user_id
),
daily_visitors as (
  select (e.at at time zone 'UTC')::date as day, count(distinct e.visitor) as visitors
    from analytics.event e
   where e.name = 'landing_view'
     and e.visitor is not null
     and e.at >= :from
     and e.at < :to
   group by 1
),
visitors as (
  select coalesce(sum(visitors), 0)::bigint as n from daily_visitors
),
started as (
  select count(*)::bigint as n
    from analytics.event
   where name = 'signup_started'
     and at >= :from
     and at < :to
),
verified_count as (
  select count(*)::bigint as n from signups
)
select metric, segment, numerator, denominator, value
  from (
select 'M10 visitors' as metric,
       s.segment,
       case when s.segment in ('unknown', 'blended') then v.n else null end as numerator,
       null::bigint as denominator,
       case when s.segment in ('unknown', 'blended') then v.n::numeric else null end as value
  from segments s
  cross join visitors v
union all
select 'M10 signup started' as metric,
       s.segment,
       case when s.segment in ('unknown', 'blended') then st.n else null end as numerator,
       null::bigint as denominator,
       case when s.segment in ('unknown', 'blended') then st.n::numeric else null end as value
  from segments s
  cross join started st
union all
select 'M10 account created' as metric,
       s.segment,
       (count(c.user_id))::bigint as numerator,
       (count(c.user_id))::bigint as denominator,
       (count(c.user_id))::numeric as value
  from segments s
  left join created c on s.segment = 'blended' or c.segment = s.segment
 group by s.segment
union all
select 'M10 verified' as metric,
       s.segment,
       (count(v.user_id))::bigint as numerator,
       (count(v.user_id))::bigint as denominator,
       (count(v.user_id))::numeric as value
  from segments s
  left join signups v on s.segment = 'blended' or v.segment = s.segment
 group by s.segment
union all
select 'M10 conversion' as metric,
       'blended' as segment,
       (select n from verified_count) as numerator,
       (select n from visitors) as denominator,
       round(
         100.0 * (select n from verified_count) / nullif((select n from visitors), 0),
         1
       ) as value
) funnel
 order by case metric
            when 'M10 visitors' then 1
            when 'M10 signup started' then 2
            when 'M10 account created' then 3
            when 'M10 verified' then 4
            else 5
          end,
          segment;
