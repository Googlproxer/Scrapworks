# Complete production qualification results

All timings below are milliseconds. Aggregate values are medians of the five per-run percentiles; the CSV and JSON retain every percentile, maximum, throughput and work counter. Normal budgets apply at 100,000 meaningful entities.

| Entities | Workload | Mode | p50 compute/publication | p95 | p99 | p95 receiver | p99 receiver | p95 round trip |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100000 | mixed | worker | 2.70 | 4.60 | 5.60 | 1.20 | 1.40 | 5.90 |
| 100000 | mixed | inline | 1.20 | 2.50 | 3.90 | 0.90 | 1.20 | 3.40 |
| 50000 | mixed | worker | 0.90 | 1.90 | 2.50 | 0.50 | 0.70 | 2.40 |
| 50000 | mixed | inline | 0.70 | 1.40 | 2.30 | 0.50 | 0.60 | 1.90 |
| 250000 | mixed | worker | 5.70 | 11.80 | 14.60 | 3.30 | 3.60 | 15.00 |
| 250000 | mixed | inline | 3.90 | 8.30 | 11.60 | 2.40 | 2.80 | 10.70 |
| 100000 | idle | worker | 0.50 | 1.00 | 1.50 | 0.30 | 0.40 | 1.30 |
| 100000 | idle | inline | 0.40 | 0.70 | 1.30 | 0.20 | 0.30 | 0.90 |
| 100000 | active | worker | 6.00 | 10.80 | 14.10 | 3.50 | 3.80 | 14.40 |
| 100000 | active | inline | 4.90 | 9.60 | 12.50 | 3.40 | 3.80 | 12.40 |
| 100000 | churn | worker | 6.20 | 9.80 | 11.30 | 2.80 | 4.20 | 12.70 |
| 100000 | churn | inline | 5.40 | 9.20 | 11.60 | 1.70 | 2.10 | 10.80 |

## All target normal repetitions and spread

| Mode | Metric | Five runs in execution order | Median | Range |
| --- | --- | --- | ---: | --- |
| worker | workAndPublication p95 | 4.90, 4.50, 4.70, 4.30, 4.60 | 4.60 | 4.30–4.90 |
| worker | workAndPublication p99 | 6.00, 5.30, 5.70, 5.30, 5.60 | 5.60 | 5.30–6.00 |
| worker | observedReceiver p95 | 1.20, 1.10, 1.20, 1.10, 1.20 | 1.20 | 1.10–1.20 |
| worker | observedReceiver p99 | 1.40, 1.40, 1.40, 1.40, 1.40 | 1.40 | 1.40–1.40 |
| worker | roundTrip p95 | 6.10, 5.70, 5.90, 5.50, 5.90 | 5.90 | 5.50–6.10 |
| worker | roundTrip p99 | 7.50, 6.90, 7.20, 7.20, 7.30 | 7.20 | 6.90–7.50 |
| worker | systems p95 | 2.60, 2.50, 2.60, 2.40, 2.60 | 2.60 | 2.40–2.60 |
| worker | systems p99 | 3.40, 3.10, 3.40, 3.10, 3.40 | 3.40 | 3.10–3.40 |
| worker | structural p95 | 0.10, 0.10, 0.10, 0.10, 0.10 | 0.10 | 0.10–0.10 |
| worker | structural p99 | 0.10, 0.10, 0.10, 0.10, 0.10 | 0.10 | 0.10–0.10 |
| worker | publication p95 | 2.70, 2.20, 2.30, 2.30, 2.30 | 2.30 | 2.20–2.70 |
| worker | publication p99 | 3.00, 2.50, 2.70, 2.60, 2.60 | 2.60 | 2.50–3.00 |
| inline | workAndPublication p95 | 2.50, 2.40, 2.60, 2.30, 3.30 | 2.50 | 2.30–3.30 |
| inline | workAndPublication p99 | 4.20, 3.80, 3.90, 3.70, 4.40 | 3.90 | 3.70–4.40 |
| inline | observedReceiver p95 | 0.90, 0.90, 0.90, 0.90, 0.90 | 0.90 | 0.90–0.90 |
| inline | observedReceiver p99 | 1.20, 1.10, 1.20, 1.20, 1.20 | 1.20 | 1.10–1.20 |
| inline | roundTrip p95 | 3.40, 3.20, 3.50, 3.10, 4.20 | 3.40 | 3.10–4.20 |
| inline | roundTrip p99 | 5.20, 4.90, 5.00, 4.70, 5.60 | 5.00 | 4.70–5.60 |
| inline | systems p95 | 1.30, 1.30, 1.30, 1.20, 1.50 | 1.30 | 1.20–1.50 |
| inline | systems p99 | 2.00, 1.90, 2.00, 1.80, 2.50 | 2.00 | 1.80–2.50 |
| inline | structural p95 | 0.10, 0.10, 0.10, 0.10, 0.10 | 0.10 | 0.10–0.10 |
| inline | structural p99 | 0.10, 0.10, 0.10, 0.10, 0.10 | 0.10 | 0.10–0.10 |
| inline | publication p95 | 1.30, 1.20, 1.40, 1.20, 1.90 | 1.30 | 1.20–1.90 |
| inline | publication p99 | 2.30, 2.40, 2.60, 2.40, 3.10 | 2.40 | 2.30–3.10 |

## Every paced repetition

120 Hz rows are timer diagnostics; use achieved Hz. Required rows are normal mixed work at requested 60 Hz. Idle/active at 8 ms pressure are diagnostics.

| Mode | Workload | Pressure | Requested / achieved Hz | Rep | Callback p95/p99 | Input p95/p99 | Max backlog | Dropped ms | Long tasks |
| --- | --- | ---: | --- | ---: | --- | --- | ---: | ---: | ---: |
| inline | mixed | 0 | 60 / 60.02 | 0 | 17.70 / 17.90 | 50.60 / 51.00 | 61.30 | 0.00 | 0 |
| inline | mixed | 0 | 60 / 60.03 | 1 | 17.70 / 17.90 | 50.20 / 51.30 | 55.90 | 0.00 | 0 |
| inline | mixed | 0 | 60 / 60.02 | 2 | 17.70 / 17.90 | 50.50 / 50.80 | 59.10 | 0.00 | 0 |
| inline | mixed | 4 | 60 / 60.00 | 0 | 17.70 / 17.90 | 51.40 / 66.60 | 67.60 | 0.00 | 0 |
| inline | mixed | 4 | 60 / 60.01 | 1 | 17.70 / 17.90 | 50.10 / 50.90 | 65.90 | 0.00 | 0 |
| inline | mixed | 4 | 60 / 60.02 | 2 | 17.70 / 17.90 | 50.90 / 51.30 | 61.20 | 0.00 | 0 |
| inline | mixed | 8 | 60 / 60.03 | 0 | 17.70 / 17.90 | 50.20 / 51.40 | 53.30 | 0.00 | 0 |
| inline | mixed | 8 | 60 / 60.02 | 1 | 17.70 / 17.90 | 50.70 / 51.20 | 58.80 | 0.00 | 0 |
| inline | mixed | 8 | 60 / 59.98 | 2 | 17.70 / 17.90 | 50.30 / 51.10 | 60.70 | 0.00 | 0 |
| worker | mixed | 0 | 60 / 60.00 | 0 | 17.40 / 17.90 | 66.20 / 67.20 | 67.50 | 0.00 | 0 |
| worker | mixed | 0 | 60 / 60.00 | 1 | 17.60 / 18.00 | 50.60 / 51.30 | 66.60 | 0.00 | 0 |
| worker | mixed | 0 | 60 / 60.03 | 2 | 17.70 / 17.90 | 50.60 / 51.40 | 68.20 | 0.00 | 0 |
| worker | mixed | 4 | 60 / 60.01 | 0 | 17.50 / 17.80 | 50.70 / 51.30 | 78.20 | 0.00 | 0 |
| worker | mixed | 4 | 60 / 60.02 | 1 | 17.40 / 17.80 | 50.60 / 51.00 | 74.80 | 0.00 | 0 |
| worker | mixed | 4 | 60 / 60.02 | 2 | 17.40 / 17.80 | 50.60 / 50.80 | 77.00 | 0.00 | 0 |
| worker | mixed | 8 | 60 / 60.02 | 0 | 17.60 / 17.90 | 50.50 / 50.80 | 75.50 | 0.00 | 0 |
| worker | mixed | 8 | 60 / 60.01 | 1 | 17.60 / 17.90 | 50.60 / 51.20 | 79.60 | 0.00 | 0 |
| worker | mixed | 8 | 60 / 60.00 | 2 | 17.60 / 18.00 | 50.90 / 67.00 | 67.70 | 0.00 | 0 |
| inline | mixed | 4 | 120 / 64.48 | 0 | 17.30 / 17.80 | 56.60 / 59.90 | 61.10 | 0.00 | 0 |
| worker | mixed | 4 | 120 / 64.38 | 0 | 17.20 / 17.70 | 58.50 / 66.80 | 59.90 | 0.00 | 0 |
| worker | idle | 8 | 60 / 60.01 | 0 | 17.60 / 18.10 | 50.60 / 51.30 | 78.80 | 0.00 | 0 |
| worker | idle | 8 | 60 / 60.00 | 1 | 17.60 / 18.10 | 50.60 / 51.30 | 82.20 | 0.00 | 0 |
| worker | idle | 8 | 60 / 60.02 | 2 | 17.60 / 17.90 | 50.40 / 51.90 | 75.20 | 0.00 | 0 |
| worker | active | 8 | 60 / 59.97 | 0 | 17.60 / 18.40 | 66.50 / 66.70 | 71.40 | 0.00 | 0 |
| worker | active | 8 | 60 / 59.98 | 1 | 17.70 / 18.10 | 50.60 / 64.80 | 76.60 | 0.00 | 0 |
| worker | active | 8 | 60 / 59.98 | 2 | 17.70 / 18.20 | 50.80 / 56.80 | 79.30 | 0.00 | 0 |

## Ancillary single-run diagnostics

| Mode | Initialization | Capture | Encode | Decode | Rebuild and full presentation | Disposal | Snapshot bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| inline | 921.70 | 673.50 | 89.00 | 139.20 | 1043.40 | 47.10 | 44559083 |
| worker | 1648.60 | 1419.20 | 73.20 | 137.20 | 1887.20 | 0.20 | 44559083 |
