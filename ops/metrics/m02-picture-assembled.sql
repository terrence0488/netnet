-- M2 · Picture assembled (PRD §3.2): "% of signups with ≥3 holdings within 7 days"; target 50%.
-- Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: `holding_created` fires once per holding (apps/api/src/ledger/holdings.ts),
-- so counting those events per person counts holdings, not calls. "Within 7 days" is 7 × 24 hours
-- after the signup instant (a verification for an email account, the creation for Google/Apple);
-- a holding created at exactly 7 days is outside. The denominator is only the signups whose 7 days
-- had ended by :to, so a cohort that could not yet reach the threshold does not deflate the rate.
-- A person's segment is the one non-unknown segment among their events, else `unknown`.
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
  select * from signups where signup_at + interval '7 days' <= :to
),
holdings as (
  select e.user_id, count(*) as holdings
    from analytics.event e
    join signups s on s.user_id = e.user_id
   where e.name = 'holding_created'
     and e.at >= s.signup_at
     and e.at < s.signup_at + interval '7 days'
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
)
select 'M2' as metric,
       s.segment,
       (count(m.user_id) filter (where coalesce(h.holdings, 0) >= 3))::bigint as numerator,
       (count(m.user_id))::bigint as denominator,
       round(
         100.0 * (count(m.user_id) filter (where coalesce(h.holdings, 0) >= 3))
           / nullif(count(m.user_id), 0),
         1
       ) as value
  from segments s
  left join mature m on s.segment = 'blended' or m.segment = s.segment
  left join holdings h on h.user_id = m.user_id
 group by s.segment
 order by s.segment;
