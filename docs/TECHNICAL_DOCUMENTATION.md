# Technical documentation

## Cache behavior

The cache is an in-memory bounded key/value store. LRU metadata updates and victim selection use an access-ordered `LinkedHashMap`; LFU bucket changes are expected O(1), while recalculating the minimum frequency when its bucket empties scans remaining distinct frequency buckets. Engine operations take one exclusive lock to protect compound state.

TTL is optional and entry-specific. Non-positive TTL is rejected. An expired entry discovered by GET is removed from storage and policy metadata and increments both misses and expirations. Overwrite or explicit removal of an expired entry also increments expirations. There is no background expiry scan; expiration is observed on access or replacement/removal.

## Metrics

Maintained counters track GET requests, hits, misses, evictions and expirations; current entry count is separately maintained. `stats()` also scans entries under the exclusive cache lock to calculate the exact valid/expired-entry breakdown at the current clock time. This makes stats O(cache size) and briefly blocks cache operations. Avoiding that scan would require changing or removing the exact time-relative breakdown, or adding a more complex expiry index/maintenance model; no approximate counters are used. Counters remain cumulative across remove and clear. Hit/miss rates are zero before the first GET. PUT may change size and increase evictions or expirations, but does not contribute to GET request totals.

## Workload Lab methodology

The four healthcare-oriented simulated profiles are Claims Processing, Member Services, Authorization, and Mixed Healthcare. Keys are deterministic synthetic domain keys (for example, `claim-0`, `member-1`, and `rules-2`), not patient data. They model general information workflows and do not reproduce any organization's private production workload. For a chosen profile, capacity, and request count, the service generates one deterministic trace and passes that identical ordered trace to fresh LRU and LFU cache instances. Each trace access is a GET; a miss is followed by a PUT. Returned policy counters therefore reflect actual cache operations.

Trace characterization is calculated from generated keys:

- **Unique keys:** count of distinct generated keys.
- **Repeated accesses:** requests minus unique keys.
- **Top 10% access share:** fraction of all requests belonging to the most frequently accessed 10% of unique keys (rounded up to at least one key).
- **Most accessed keys:** up to five key/count pairs, sorted by descending measured access count and then key.
- **Frequency distribution:** exact histogram mapping each observed accesses-per-key count to the number of keys with that count. Histogram key counts sum to unique keys and weighted access counts sum to requests.
- **Temporal locality:** fraction of accesses whose key appeared within the previous 50 trace positions.
- **Levels and workload type:** Frequency concentration and temporal locality are High at 70% or above, Medium at 40% to below 70%, and Low below 40%. Top-10% share indicates frequency concentration; reuse within the previous 50 trace positions is a temporal locality engineering indicator. Workload type is derived from these measured levels. These descriptors are simple engineering indicators, not scientific predictions.

The policy explanation compares measured LRU/LFU hit rates (a gap below two percentage points is described as similar), miss rates, miss counts, eviction counts, and measured locality levels. It is specific to that deterministic run, not a universal recommendation.

## Automatic benchmark methodology

`BenchmarkService` constructs one seeded operation list before running either cache. It supports uniform key selection, Zipfian rank weighting, sequential key scans, bursty access in 100-operation phases (three hot-key phases followed by a cold-key phase), read-heavy Zipfian access, and configurable mixed reads/writes. Bounds are 100,000 operations, cache entries, and unique keys per request. Values are synthetic strings. The response includes a SHA-256 fingerprint of the operation type, key, and value sequence so users can verify reproducibility without returning a potentially large trace.

LRU and LFU each receive a new empty cache with the same capacity and virtual clock. Virtual time advances by one millisecond per logical operation. Each custom policy gets one unmeasured warm-up pass followed by the configured 1–20 measured trials. Workload generation and fingerprinting are reported separately. Per-operation latency wraps only the cache call; run duration and throughput include the iteration loop and timer overhead. Percentiles are nearest-rank over the measured operation latencies. LRU/LFU summaries use medians across trials; they remain demonstrations rather than statistically robust performance claims.

The advisor recommends the higher measured hit-rate policy only when the difference is at least two percentage points and the trace contains reads. Otherwise it reports similar results or insufficient evidence. Latency and throughput are reported but do not decide the recommendation because a single wall-clock sample is noisy.

The response also includes a Caffeine replay of the same operation sequence, with the same maximum entry count and optional write TTL driven by a virtual ticker. Caffeine retains its native W-TinyLFU policy and is excluded from the LRU/LFU advisor. Its existing `evictions` response field counts only `RemovalCause.SIZE`; expiration removals and other removal causes are reported separately by a synchronous removal listener. Caffeine maintenance is not forced after every operation. Expired values are never returned by a read, but physical cleanup and freeing capacity follow Caffeine's maintenance behavior; the custom cache lazily removes expired entries when encountered. Thus TTL traces can produce different capacity outcomes. A final cleanup after the timed trace drains pending removals for reporting and is excluded from operation timings. Caffeine timing is one run and includes statistics/removal-listener overhead, while LRU/LFU timing is a median over multiple trials.

No adaptive policy switching is implemented. The advisor returns a recommendation after a run and does not change the active cache. Switching policies safely would require a sustained observation window, a measured switching cost, and hysteresis to prevent reactions to noisy fluctuations; that is outside the current experiment.

## JMH operation benchmarks

JMH is an opt-in Maven profile with source in `src/jmh/java`; it is not part of normal Spring startup. `CacheOperationBenchmark` seeds per-thread cache state during iteration setup, outside the measured operation, and covers hits, misses, new/existing writes, deterministic distributed reads, and mixed operations. `ConcurrentCacheBenchmark` uses group-scoped shared cache state with three readers and one writer. The writer inserts unique keys while readers probe key 0, so read outcomes are schedule-sensitive; this group measures mixed contention throughput/latency, not a stable read-hit ratio. Parameters cover LRU, LFU, Caffeine, and capacities 128/4096. JMH runs throughput and sample-time modes, five one-second warmups, eight one-second measurements, and three forks.

Run from `backend/` with `mvnw -Pjmh -DskipTests compile`, then invoke `org.openjdk.jmh.Main` using `exec-maven-plugin:exec` as shown in the README. The `%classpath` token passes project and dependency jars to the child JVM so JMH forks work. Output is ops/s and sample-time distributions in microseconds. Capture JDK version, JVM flags, operating system, CPU, and exact command alongside any reported result. JMH is not a unit test, and performance varies by machine. JMH Caffeine caches do not record statistics; the interactive replay does, so the two measurements have different instrumentation overhead.

## Limitations

The API stores strings and runs as one process; state is lost on restart. Expired, never-read entries can occupy capacity until accessed or overwritten. The global cache lock prioritizes correctness over parallel throughput. Analysis and benchmark requests are synchronous and bounded to 100,000 operations. Stress requests are synchronous and bounded to 1,000,000 operations per call. Workload profiles are synthetic education/demo data, not patient information or production traces.
