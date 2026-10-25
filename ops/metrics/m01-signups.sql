-- M1 · Signups (PRD §3.2): "Verified accounts created"; target 100; kill below 25 on P-B and P-C
-- (PRD §3.3). Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: a signup is an `account_created` with `method` `google` or `apple`, or an
-- `email_verified` for an email sign-up (PRD §3.5; architecture §7.7). The account must have been
-- created in the window; an email account whose address is still unverified at :to is not a
-- signup, and one verified after :to is not one yet. `account_created` and `email_verified` carry
-- `unknown`; they are joined to the account by `user_id`, and the person's segment is the one
-- non-unknown segment among their events, `unknown` when onboarding was skipped.
--
-- A count: numerator and value are the same number, and the denominator is null. Parameters are
-- `:from`, `:to` (timestamptz) and `:exclude_users` (text[] of usr_ ids, the probe account).
-- Reads `analytics.event` only.

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
)
select 'M1' as metric,
       s.segment,
       (count(sg.user_id))::bigint as numerator,
       null::bigint as denominator,
       (count(sg.user_id))::numeric as value
  from segments s
  left join signups sg on s.segment = 'blended' or sg.segment = s.segment
 group by s.segment
 order by s.segment;
