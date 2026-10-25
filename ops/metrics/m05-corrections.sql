-- M5 · Correction rate (PRD §3.2): "% of agent-written values edited or deleted within 48h";
-- target below 10% (above 25% = failing). Window [ :from, :to ), UTC, with :to exclusive.
--
-- How this reads it: `value_recorded` with `source` `agent` fires once per value written, not per
-- call (apps/api/src/ledger/values.ts: one event per new value, and a same-date replacement whose
-- amount did not change; a changed one fires `value_corrected` instead). That count is the
-- denominator. The numerator is `value_corrected` with `original_source` `agent` and
-- `age_at_correction` ≤ 2: the event stores whole days, so "within 48 h" is ≤ 2, as P4-T3 states.
-- A correction counts only when the value it corrects was recorded in the window (its implied
-- record time is at or after :from), and the event carries no value id, so a second correction of
-- one value would count again. Values recorded in the last 48 h of the window have not had their
-- full 48 h; that only deflates the rate slightly. The person's segment is the one non-unknown
-- segment among their events, else `unknown`.
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
recorded as (
  select e.user_id, count(*) as values
    from analytics.event e
   where e.name = 'value_recorded'
     and e.props->>'source' = 'agent'
     and e.at >= :from
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
),
corrected as (
  select e.user_id, count(*) as corrected
    from analytics.event e
   where e.name = 'value_corrected'
     and e.props->>'original_source' = 'agent'
     and (e.props->>'age_at_correction')::int <= 2
     and e.at >= :from
     and e.at < :to
     and e.at - make_interval(days => (e.props->>'age_at_correction')::int) >= :from
     and not (e.user_id = any(:exclude_users))
   group by e.user_id
)
select 'M5' as metric,
       s.segment,
       coalesce(sum(c.corrected), 0)::bigint as numerator,
       coalesce(sum(r.values), 0)::bigint as denominator,
       round(
         100.0 * coalesce(sum(c.corrected), 0) / nullif(coalesce(sum(r.values), 0), 0),
         1
       ) as value
  from segments s
  left join account_segment a on s.segment = 'blended' or a.segment = s.segment
  left join recorded r on r.user_id = a.user_id
  left join corrected c on c.user_id = a.user_id
 group by s.segment
 order by s.segment;
