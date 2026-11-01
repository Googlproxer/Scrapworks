# Generated worker evidence

Source: e195ced3a6605aa0cb6027f6ca917d9ee1c20790e7002bfce346360b55d97df1. Jobs: 256; failures: 0; timeouts: 20.
Paced source: 2906a898ac78be81e92b9aa6f4acd67dc4452db6dbaaa29ed0263aef0e4ba1b1; unchanged primary hot path and core source verified.

Target state hashes equivalent across complete primary runs: true.

| Candidate | Execution | p95 round trip ms | p99 round trip ms | p95 work/publication ms | p99 work/publication ms | Complete |
| --------- | --------- | ----------------: | ----------------: | ----------------------: | ----------------------: | -------: |
| miniplex  | worker    |            58.000 |            62.700 |                   3.600 |                   3.800 |      5/5 |
| bitecs    | inline    |             5.000 |             5.500 |                   4.800 |                   5.300 |      5/5 |
| bitecs    | worker    |            57.800 |            62.700 |                   3.200 |                   3.700 |      5/5 |
| miniplex  | inline    |             4.400 |             4.900 |                   4.100 |                   4.600 |      5/5 |

Warm execution context verified by manifest: true. Receiver gate metric: observedReceiver.

hostApply measures explicit JavaScript decoding/cache application. Where present, observedReceiver measures the whole message handler, including MessageEvent.data access and request bookkeeping; browser-internal work before that access can remain unattributed. Round trips and frame intervals include delivery. Epoch-aligned estimates are diagnostic only. Profiling runs do not contribute to ranking.
