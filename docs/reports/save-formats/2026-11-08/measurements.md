# Save-format benchmark

Times are p50 / p95 milliseconds (nearest rank). Raw samples and source hashes are in `result.json`.

Storage deltas are browser-accounted estimates for one row after an empty database is open. They are not exact disk-file sizes. Wire bytes are exact encoded payload bytes (JSON uses UTF-8); native objects have no portable wire size.

Full Save includes the real worker capture and committed repository write. Full Load includes the repository read, validation and a fresh production worker ready with its first publication. Babylon/Angular scene restoration, confirmation dialogs, database opening and asset loading are excluded. The current-object full pipeline calls the unchanged production repository.

Stage timings are independent diagnostics and must not be added to the full pipeline. Warmups and correctness checks are excluded. Codec order is shuffled reproducibly each round. Fresh workers include startup; IndexedDB reads are warm browser-cache reads. No forced GC or performance thresholds.

## opening

8 entities; 10,786 native physics bytes; exported opening world.

Production host save gate: accepted.

Common diagnostics: capture 0.60 / 0.60 ms; host validation + clone 0.90 / 1.00 ms; clone alone 0.90 / 0.90 ms. A rejected validation time measures time to reject.

| Format | Wire bytes | Estimated storage delta bytes | Full Save ms | Full Load ms |
| --- | ---: | ---: | ---: | ---: |
| Current object / production repository | n/a | 65,613 | 3.40 / 4.20 | 72.00 / 72.20 |
| JSON string | 30,542 | 31,422 | 2.50 / 4.00 | 68.50 / 82.90 |
| JSON + browser gzip | 2,615 | 3,492 | 2.70 / 3.00 | 68.90 / 77.20 |
| MessagePack / unchanged object layout | 16,690 | 17,570 | 2.10 / 2.50 | 68.80 / 87.50 |
| Object + Uint8Array physics | n/a | 18,236 | 2.50 / 2.70 | 70.70 / 71.70 |
| Compact components + binary physics / MessagePack | 15,016 | 15,893 | 2.40 / 2.80 | 70.20 / 80.90 |

| Format | Encode ms | IDB write ms | IDB read ms | Decode ms | Repository Save ms | Repository Load ms | Worker restore ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current-object | 0.00 / 0.00 | 2.60 / 2.90 | 0.70 / 0.80 | 0.00 / 0.00 | 2.80 / 3.50 | 1.70 / 2.00 | 70.30 / 70.60 |
| json | 0.10 / 0.10 | 1.10 / 1.90 | 0.30 / 0.40 | 0.10 / 0.20 | 1.80 / 2.80 | 0.70 / 1.10 | 67.70 / 82.20 |
| json-gzip | 1.30 / 1.30 | 0.80 / 0.90 | 0.20 / 0.30 | 0.50 / 0.60 | 2.20 / 2.40 | 0.80 / 1.20 | 68.10 / 76.10 |
| msgpack | 0.30 / 0.30 | 1.00 / 1.70 | 0.40 / 0.50 | 0.10 / 0.20 | 1.70 / 1.80 | 1.30 / 1.30 | 67.60 / 86.20 |
| binary-physics | 0.20 / 0.40 | 1.10 / 1.30 | 0.50 / 0.80 | 0.10 / 0.10 | 1.70 / 2.10 | 0.60 / 1.20 | 69.50 / 71.10 |
| compact-msgpack | 0.40 / 0.60 | 1.10 / 1.10 | 0.30 / 0.40 | 0.30 / 0.40 | 1.70 / 2.10 | 0.70 / 0.80 | 69.50 / 80.10 |

All formats passed exact stored round-trip comparison and 4-tick native simulation continuation. Fixture SHA-256: `cc823208fde34061dc1cff37fe7ef21991eaec3d043877a59c12361a8adfc02f`.

## piles-10000

10,000 entities; 16,019 native physics bytes; synthetic supported component shapes.

Production host save gate: accepted.

Common diagnostics: capture 39.00 / 44.80 ms; host validation + clone 18.90 / 19.50 ms; clone alone 13.80 / 15.50 ms. A rejected validation time measures time to reject.

| Format | Wire bytes | Estimated storage delta bytes | Full Save ms | Full Load ms |
| --- | ---: | ---: | ---: | ---: |
| Current object / production repository | n/a | 415,013 | 87.20 / 98.80 | 230.80 / 244.00 |
| JSON string | 2,038,070 | 334,807 | 76.90 / 103.50 | 222.60 / 250.50 |
| JSON + browser gzip | 174,956 | 176,190 | 102.50 / 132.70 | 238.90 / 277.90 |
| MessagePack / unchanged object layout | 1,336,756 | 281,047 | 72.00 / 77.10 | 230.20 / 273.50 |
| Object + Uint8Array physics | n/a | 345,524 | 95.50 / 114.80 | 245.50 / 258.30 |
| Compact components + binary physics / MessagePack | 714,113 | 233,509 | 83.10 / 102.40 | 228.80 / 264.90 |

| Format | Encode ms | IDB write ms | IDB read ms | Decode ms | Repository Save ms | Repository Load ms | Worker restore ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current-object | 0.00 / 0.00 | 33.10 / 41.10 | 11.70 / 15.20 | 0.00 / 0.00 | 48.40 / 59.80 | 31.00 / 37.80 | 196.80 / 210.60 |
| json | 5.00 / 5.60 | 7.40 / 10.50 | 1.60 / 2.00 | 5.90 / 7.60 | 33.00 / 49.00 | 25.20 / 38.90 | 191.50 / 211.70 |
| json-gzip | 24.80 / 26.30 | 4.50 / 5.00 | 0.70 / 0.70 | 10.60 / 13.50 | 55.40 / 64.30 | 26.80 / 43.90 | 205.90 / 234.00 |
| msgpack | 9.10 / 9.80 | 6.50 / 7.50 | 1.40 / 6.10 | 9.40 / 9.70 | 33.90 / 36.00 | 33.20 / 41.60 | 199.00 / 236.10 |
| binary-physics | 0.50 / 1.00 | 32.90 / 41.80 | 13.00 / 18.10 | 0.30 / 0.30 | 49.90 / 64.90 | 30.20 / 43.80 | 205.30 / 229.80 |
| compact-msgpack | 7.30 / 12.50 | 6.20 / 8.10 | 1.10 / 1.40 | 5.20 / 8.80 | 42.10 / 48.60 | 28.10 / 32.50 | 200.40 / 239.50 |

All formats passed exact stored round-trip comparison and 4-tick native simulation continuation. Fixture SHA-256: `b8e424e06f6ae48f70a7b1cdbb776c0fa3292c82f136ec5943aca20c8915db12`.

## piles-100000

100,000 entities; 16,019 native physics bytes; synthetic supported component shapes.

Production host save gate: accepted.

Common diagnostics: capture 500.80 / 545.60 ms; host validation + clone 237.10 / 334.90 ms; clone alone 174.50 / 259.40 ms. A rejected validation time measures time to reject.

| Format | Wire bytes | Estimated storage delta bytes | Full Save ms | Full Load ms |
| --- | ---: | ---: | ---: | ---: |
| Current object / production repository | n/a | 3,448,653 | 997.20 / 1092.90 | 1412.70 / 1682.80 |
| JSON string | 20,074,901 | 3,244,955 | 718.20 / 842.20 | 1326.50 / 1367.40 |
| JSON + browser gzip | 1,695,900 | 1,697,107 | 839.80 / 897.50 | 1436.10 / 1660.80 |
| MessagePack / unchanged object layout | 13,260,322 | 2,731,557 | 746.50 / 840.80 | 1387.70 / 1467.60 |
| Object + Uint8Array physics | n/a | 3,384,599 | 957.80 / 995.60 | 1389.80 / 1452.20 |
| Compact components + binary physics / MessagePack | 7,057,679 | 2,283,980 | 739.20 / 978.10 | 1346.70 / 1577.90 |

| Format | Encode ms | IDB write ms | IDB read ms | Decode ms | Repository Save ms | Repository Load ms | Worker restore ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current-object | 0.00 / 0.10 | 303.20 / 339.40 | 116.80 / 121.60 | 0.00 / 0.00 | 515.50 / 645.00 | 358.70 / 393.60 | 1047.90 / 1324.10 |
| json | 38.20 / 47.60 | 38.90 / 39.30 | 13.10 / 15.50 | 47.60 / 48.80 | 266.30 / 416.90 | 260.50 / 297.80 | 1049.20 / 1106.90 |
| json-gzip | 214.30 / 243.10 | 9.00 / 51.60 | 1.90 / 2.40 | 91.40 / 96.80 | 398.40 / 436.60 | 322.10 / 420.70 | 1099.00 / 1282.80 |
| msgpack | 74.60 / 75.50 | 34.80 / 35.20 | 8.10 / 8.80 | 94.00 / 144.60 | 322.00 / 385.80 | 299.70 / 330.10 | 1088.00 / 1145.60 |
| binary-physics | 0.60 / 0.60 | 305.00 / 324.20 | 116.30 / 158.20 | 0.30 / 0.30 | 520.10 / 544.00 | 313.60 / 333.20 | 1056.60 / 1138.60 |
| compact-msgpack | 75.40 / 85.20 | 23.90 / 43.00 | 5.90 / 6.40 | 66.70 / 80.50 | 308.10 / 451.90 | 289.20 / 321.90 | 1072.10 / 1288.70 |

All formats passed exact stored round-trip comparison and 4-tick native simulation continuation. Fixture SHA-256: `89dbbabc25a68a3140c4218aa2fd881010f20442b9507b1d04b07d6873c0d38e`.

## piles-250000

250,000 entities; 16,019 native physics bytes; synthetic supported component shapes.

Production host save gate: accepted.

Common diagnostics: capture 1185.90 / 1589.50 ms; host validation + clone 587.10 / 781.10 ms; clone alone 530.90 / 549.30 ms. A rejected validation time measures time to reject.

| Format | Wire bytes | Estimated storage delta bytes | Full Save ms | Full Load ms |
| --- | ---: | ---: | ---: | ---: |
| Current object / production repository | n/a | 8,528,252 | 2534.20 / 2618.60 | 3382.90 / 3668.40 |
| JSON string | 50,286,275 | 8,096,772 | 1890.60 / 2048.20 | 3375.70 / 3612.90 |
| JSON + browser gzip | 4,230,595 | 4,231,806 | 2216.20 / 2456.70 | 3303.70 / 3382.40 |
| MessagePack / unchanged object layout | 33,282,922 | 6,822,507 | 1946.90 / 2106.70 | 3352.80 / 3378.80 |
| Object + Uint8Array physics | n/a | 8,464,207 | 2530.10 / 2705.80 | 3354.90 / 3593.70 |
| Compact components + binary physics / MessagePack | 17,780,279 | 5,712,390 | 2036.20 / 2108.10 | 3193.70 / 3291.40 |

| Format | Encode ms | IDB write ms | IDB read ms | Decode ms | Repository Save ms | Repository Load ms | Worker restore ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current-object | 0.00 / 0.00 | 816.00 / 867.90 | 303.70 / 314.00 | 0.00 / 0.10 | 1376.30 / 1443.00 | 840.80 / 878.10 | 2530.80 / 2790.30 |
| json | 107.80 / 112.90 | 80.90 / 90.70 | 22.60 / 29.60 | 143.20 / 205.00 | 687.60 / 872.20 | 737.30 / 1032.00 | 2579.90 / 2715.80 |
| json-gzip | 479.80 / 514.10 | 17.60 / 23.70 | 4.90 / 9.40 | 240.20 / 253.50 | 1016.30 / 1316.50 | 759.80 / 803.00 | 2507.00 / 2613.60 |
| msgpack | 210.70 / 248.00 | 77.20 / 79.90 | 18.90 / 19.80 | 239.90 / 250.30 | 806.80 / 937.80 | 803.50 / 888.80 | 2510.40 / 2557.10 |
| binary-physics | 0.50 / 0.60 | 827.30 / 1004.40 | 298.60 / 334.30 | 0.20 / 0.30 | 1312.30 / 1522.50 | 824.70 / 865.40 | 2508.90 / 2728.30 |
| compact-msgpack | 202.40 / 270.40 | 56.40 / 73.30 | 13.50 / 14.40 | 179.50 / 184.70 | 945.90 / 1018.50 | 690.70 / 722.20 | 2503.00 / 2569.20 |

All formats passed exact stored round-trip comparison and 4-tick native simulation continuation. Fixture SHA-256: `f60de9c36944a1e28e763d76d25d3cbcb0df3505712e1129ad7f1b70c557972f`.

## physics-1000

1,001 entities; 642,986 native physics bytes; synthetic supported component shapes.

Production host save gate: accepted.

Common diagnostics: capture 26.80 / 28.70 ms; host validation + clone 65.50 / 80.80 ms; clone alone 60.40 / 65.00 ms. A rejected validation time measures time to reject.

| Format | Wire bytes | Estimated storage delta bytes | Full Save ms | Full Load ms |
| --- | ---: | ---: | ---: | ---: |
| Current object / production repository | n/a | 2,763,092 | 233.90 / 243.40 | 390.30 / 411.10 |
| JSON string | 2,090,785 | 190,057 | 110.50 / 127.50 | 298.00 / 314.20 |
| JSON + browser gzip | 65,507 | 66,746 | 120.50 / 129.40 | 307.70 / 323.50 |
| MessagePack / unchanged object layout | 1,189,512 | 129,072 | 122.50 / 130.80 | 370.20 / 377.50 |
| Object + Uint8Array physics | n/a | 181,129 | 126.10 / 161.20 | 320.50 / 345.30 |
| Compact components + binary physics / MessagePack | 1,031,489 | 124,783 | 117.70 / 162.10 | 324.30 / 344.40 |

| Format | Encode ms | IDB write ms | IDB read ms | Decode ms | Repository Save ms | Repository Load ms | Worker restore ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current-object | 0.00 / 0.00 | 112.10 / 118.50 | 51.90 / 58.80 | 0.00 / 0.00 | 197.90 / 212.20 | 109.70 / 136.60 | 276.50 / 286.10 |
| json | 5.80 / 5.90 | 6.70 / 8.40 | 1.50 / 2.10 | 5.20 / 6.80 | 81.00 / 87.70 | 23.60 / 24.60 | 274.00 / 290.70 |
| json-gzip | 18.00 / 18.70 | 4.00 / 4.40 | 0.60 / 0.70 | 9.20 / 9.90 | 91.40 / 100.80 | 27.30 / 36.20 | 280.10 / 298.20 |
| msgpack | 13.00 / 16.00 | 5.80 / 5.90 | 1.10 / 8.10 | 7.50 / 16.10 | 93.00 / 102.30 | 78.40 / 96.70 | 286.30 / 295.30 |
| binary-physics | 15.20 / 17.90 | 14.90 / 18.30 | 5.70 / 6.00 | 8.50 / 10.10 | 96.30 / 134.40 | 32.60 / 44.20 | 287.90 / 314.00 |
| compact-msgpack | 18.00 / 20.10 | 5.90 / 6.20 | 1.10 / 1.20 | 11.50 / 18.20 | 89.50 / 127.20 | 31.20 / 47.00 | 294.40 / 297.40 |

All formats passed exact stored round-trip comparison and 4-tick native simulation continuation. Fixture SHA-256: `082c75fdd3a7a4da84fd4522b8c95c7d9ecd38dc0950c6bad3f0f2a70c1df9ae`.

Small sample counts are exploratory; p95 can equal the maximum. Repeat full runs on an otherwise idle machine before selecting a format. These fixtures do not predict future machine/transport saves, peak memory, frame hitches, cold disk reads, crash durability or migration effort.
