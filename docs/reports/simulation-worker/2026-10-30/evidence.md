# Generated worker evidence

Source: 62ad22e6f3311e71e83b727b73a9b66c99801bf89ad3f65e74d91b361a8b2b16. Jobs: 188; failures: 0; timeouts: 0.

Target state hashes equivalent across complete primary runs: true.

| Candidate | Execution | p95 round trip ms | p99 round trip ms | p95 work/publication ms | p99 work/publication ms | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| miniplex | worker | 1.400 | 2.000 | 1.000 | 1.500 | 5/5 |
| bitecs | inline | 1.400 | 2.100 | 1.100 | 1.600 | 5/5 |
| bitecs | worker | 1.300 | 1.800 | 0.900 | 1.300 | 5/5 |
| miniplex | inline | 1.500 | 2.100 | 1.100 | 1.700 | 5/5 |

Warm execution context verified by manifest: true. Receiver gate metric: observedReceiver.

hostApply measures explicit JavaScript decoding/cache application. Where present, observedReceiver measures the whole message handler, including MessageEvent.data access and request bookkeeping; browser-internal work before that access can remain unattributed. Round trips and frame intervals include delivery. Epoch-aligned estimates are diagnostic only. Profiling runs do not contribute to ranking.
