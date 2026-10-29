# Generated worker evidence

Source: 39234364929a6d2a1651ad1d255c7bd70d4a43f2c9561142a6730308f6fbeaee. Jobs: 145; failures: 0; timeouts: 20.

Target state hashes equivalent across complete primary runs: true.

| Candidate | Execution | p95 round trip ms | p99 round trip ms | p95 work/publication ms | p99 work/publication ms | Complete |
| --------- | --------- | ----------------: | ----------------: | ----------------------: | ----------------------: | -------: |
| miniplex  | worker    |            57.100 |            63.100 |                   3.000 |                   3.400 |      5/5 |
| bitecs    | inline    |             9.600 |            11.100 |                   9.500 |                  11.100 |      5/5 |
| bitecs    | worker    |            57.100 |            63.800 |                   3.200 |                   3.700 |      5/5 |
| miniplex  | inline    |             4.400 |             5.000 |                   4.200 |                   4.700 |      5/5 |

Warm execution context verified by manifest: false. Receiver gate metric: hostApply.

hostApply measures explicit JavaScript decoding/cache application. Where present, observedReceiver measures the whole message handler, including MessageEvent.data access and request bookkeeping; browser-internal work before that access can remain unattributed. Round trips and frame intervals include delivery. Epoch-aligned estimates are diagnostic only. Profiling runs do not contribute to ranking.
