-- N1 · The MCP success-rate and latency SLO (architecture §10): success rate and p95 from
-- `agent_tool_called` over 7 days. P4-T4's daily health check runs this file as `netnet_metrics`
-- and reads the three rows: `n1 calls`, `n1 success` and `n1 p95`.
--
-- How this reads it: the window is the 7 days ending at :to, or :from when it is later. Every
-- `agent_tool_called` is a call; a call is successful when `outcome` is `ok`, and p95 is the 95th
-- percentile of `latency_ms` (contiguous interpolation). The reading is blended: the SLO is for
-- the service as a whole, not a segment. The probe account and any other excluded user are
-- removed by id. Parameters `:from`, `:to` (timestamptz) and `:exclude_users` (text[]). Reads
-- analytics.event only.

with calls as (
  select e.name, e.user_id, e.props, e.at
    from analytics.event e
   where e.name = 'agent_tool_called'
     and e.at >= greatest(:from, :to - interval '7 days')
     and e.at < :to
     and not (e.user_id = any(:exclude_users))
)
select 'n1 calls' as metric,
       'blended' as segment,
       (count(*))::bigint as numerator,
       null::bigint as denominator,
       (count(*))::numeric as value
  from calls
union all
select 'n1 p95' as metric,
       'blended' as segment,
       null::bigint as numerator,
       (count(*))::bigint as denominator,
       round(
         (percentile_cont(0.95) within group (order by (props->>'latency_ms')::numeric))::numeric,
         0
       ) as value
  from calls
union all
select 'n1 success' as metric,
       'blended' as segment,
       (count(*) filter (where props->>'outcome' = 'ok'))::bigint as numerator,
       (count(*))::bigint as denominator,
       round(
         100.0 * (count(*) filter (where props->>'outcome' = 'ok')) / nullif(count(*), 0),
         1
       ) as value
  from calls
 order by metric;
