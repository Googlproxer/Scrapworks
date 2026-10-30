# Generated worker evidence

Source: 2411993621bce59a9671b90815cf59014faebab9354a8804e5f0345b0fb55208. Jobs: 94; failures: 0; timeouts: 0.

Target state hashes equivalent across complete primary runs: true.

| Candidate | Execution | p95 round trip ms | p99 round trip ms | p95 work/publication ms | p99 work/publication ms | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| miniplex | worker | 5.900 | 7.200 | 4.600 | 5.600 | 5/5 |
| miniplex | inline | 3.400 | 5.000 | 2.500 | 3.900 | 5/5 |

Warm execution context verified by manifest: true. Receiver gate metric: observedReceiver.

hostApply measures explicit JavaScript decoding/cache application. Where present, observedReceiver measures the whole message handler, including MessageEvent.data access and request bookkeeping; browser-internal work before that access can remain unattributed. Round trips and frame intervals include delivery. Epoch-aligned estimates are diagnostic only. Profiling runs do not contribute to ranking.
