# REST API

Base path: `/api/cache`. JSON errors return `{ "error": "..." }`.

## Active cache

- `GET /{key}` — returns key, value, and `HIT`, `MISS`, or `EXPIRED`. HIT is 200; MISS/EXPIRED is 404. Each lookup updates request metrics.
- `PUT /{key}` — JSON `{ "value": "...", "ttlSeconds": 30 }`; `ttlSeconds` is optional and positive.
- `DELETE /{key}` — remove one key.
- `DELETE /` — clear active entries; cumulative counters remain.
- `GET /stats` — hits, misses, hit rate, miss rate, evictions, expirations, current size, capacity, current policy, and total GET requests.
- `GET /config` — current capacity, policy, and legacy sample workload identifiers.
- `POST /policy` — JSON `{ "policy": "LFU" }` or `{ "policy": "LRU" }`; retains entries while rebuilding policy metadata.
- `POST /configure?capacity=100&policy=LRU` — replace the active cache with the requested capacity and policy. This resets entries and their counters.
- `POST /stress?threads=8&operations=1000` — concurrent GET/PUT work against the active cache. One stress run is allowed at a time; a concurrent request receives 429. Returns attempted/completed counts, run-specific reads/writes/hits/misses, errors, throughput, final size, and the active cache's cumulative stats snapshot. It does not represent a controlled LRU-vs-LFU benchmark.

## Policy Lab

- `GET /workloads` — returns the available healthcare-oriented simulated profiles, with descriptions and access-pattern notes.
- `POST /analyze?workload=claims-processing&capacity=500&requests=10000` — deterministically generates one synthetic domain-key trace, characterizes it, then executes the same ordered trace against fresh LRU and LFU caches. Returns both measured `CacheStats`, request/unique/repeated counts, top 10% access share, locality levels, derived workload type, up to five most accessed keys, the exact frequency histogram, and an explanation incorporating measured hit rates, miss rates/counts and evictions. Capacity and request count must each be between 1 and 100,000.
- `POST /simulate?workload=locality&capacity=4` — legacy sample simulation endpoint; runs the same fixed trace against both policies. Workloads: locality, sequential, mixed, burst.

The workload profiles are simulated healthcare-inspired patterns, not production traces. Keys are synthetic and contain no patient data or PHI.

## Automatic benchmark

- `POST /api/benchmarks` accepts JSON such as:

```json
{
  "workloadType": "ZIPFIAN",
  "operations": 10000,
  "capacity": 500,
  "distinctKeys": 2000,
  "ttlSeconds": 30,
  "readPercentage": 90,
  "seed": 2026
}
```

Supported workload types are `UNIFORM`, `ZIPFIAN`, `SEQUENTIAL_SCAN`, `BURSTY`, `READ_HEAVY`, and `MIXED`. Operations, capacity, and distinct keys are bounded to 1–100,000; TTL is optional and bounded to 1–604,800 seconds; read percentage is 0–100. `READ_HEAVY` requires at least 90% reads. JSON request bodies across the API are limited to 512 KiB. A seed reproduces the ordered operation trace, whose SHA-256 fingerprint is returned.

The response contains independent LRU and LFU results, operation/read/write counts, hit/miss rates, capacity evictions, expirations, throughput, p50/p95/p99 operation latency, workload generation time, and a structured policy recommendation. It also contains a `caffeineBaseline` result replayed against the same operation trace, with the same maximum size and optional write TTL. Caffeine uses native W-TinyLFU behavior and is not a pure LRU/LFU policy. Its `evictions` field counts capacity removals only; `expirationRemovals` and `otherRemovals` are separate listener counts. The generator makes the trace before timing. Each cache receives the same trace with fresh state and a virtual clock; virtual time advances 1 ms per logical operation. A warm-up pass runs before the measured custom policy trials and Caffeine replay. The Caffeine cache uses its native periodic maintenance, with one cleanup after timing to finalize removal counts; it does not force cleanup after each operation. Custom expiry is lazy, so TTL runs can have different capacity outcomes. Caffeine timing is one replay with statistics and synchronous listener instrumentation; LRU/LFU timings are multiple-trial medians. Treat timing as descriptive rather than directly comparable.

The optional TTL models elapsed virtual operation time, not a sleep during the run. Throughput and latency are one-run JVM measurements and may vary with runtime warm-up and machine load. The `concurrency` setting remains in the separate `/api/cache/stress` experiment against the shared live cache; concurrent interleaving is not mixed into serial policy comparisons.

## Metrics endpoint

`GET /api/metrics` returns the same immutable stats snapshot as `/api/cache/stats`. The valid/expired entry breakdown scans entries under the cache lock; other counters are maintained during operations.
