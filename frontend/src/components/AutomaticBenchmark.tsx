import { useState } from "react";
import { api, type BenchmarkRequest, type BenchmarkResult, type BenchmarkWorkload } from "../services/api";

const WORKLOADS: Array<[BenchmarkWorkload, string]> = [
  ["UNIFORM", "Uniform access"],
  ["ZIPFIAN", "Zipfian hot keys"],
  ["SEQUENTIAL_SCAN", "Sequential scan"],
  ["BURSTY", "Bursty hot-key phases"],
  ["READ_HEAVY", "Read-heavy Zipfian"],
  ["MIXED", "Mixed access pattern"],
];

function formatLatency(nanos: number) {
  if (nanos >= 1_000_000) return `${(nanos / 1_000_000).toFixed(2)} ms`;
  if (nanos >= 1_000) return `${(nanos / 1_000).toFixed(2)} µs`;
  return `${nanos} ns`;
}

export default function AutomaticBenchmark() {
  const [workloadType, setWorkloadType] = useState<BenchmarkWorkload>("ZIPFIAN");
  const [operations, setOperations] = useState(10_000);
  const [capacity, setCapacity] = useState(500);
  const [distinctKeys, setDistinctKeys] = useState(2_000);
  const [ttlSeconds, setTtlSeconds] = useState("");
  const [readPercentage, setReadPercentage] = useState(90);
  const [trials, setTrials] = useState(5);
  const [seed, setSeed] = useState("2026");
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    const parsedSeed = Number(seed);
    const ttl = ttlSeconds === "" ? undefined : Number(ttlSeconds);
    if (seed.trim() === "" || !Number.isSafeInteger(parsedSeed)) {
      setError("Seed must be a whole number within JavaScript's safe integer range.");
      return;
    }
    if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 1 || ttl > 604_800)) {
      setError("TTL must be between 1 and 604,800 seconds, or left empty.");
      return;
    }
    const configuration: BenchmarkRequest = {
      workloadType,
      operations,
      capacity,
      distinctKeys,
      ttlSeconds: ttl,
      readPercentage,
      seed: parsedSeed,
      trials,
    };
    if (!Number.isInteger(operations) || operations < 1 || operations > 100_000 ||
        !Number.isInteger(capacity) || capacity < 1 || capacity > 100_000 ||
        !Number.isInteger(distinctKeys) || distinctKeys < 1 || distinctKeys > 100_000 ||
        !Number.isInteger(readPercentage) || readPercentage < 0 || readPercentage > 100 ||
        !Number.isInteger(trials) || trials < 1 || trials > 20) {
      setError("Use 1–100,000 operations, capacity, and distinct keys, with a read ratio from 0–100%.");
      return;
    }
    if (workloadType === "READ_HEAVY" && readPercentage < 90) {
      setError("Read-heavy workloads require at least 90% reads.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      setResult(await api.benchmark(configuration));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Benchmark could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="automatic-benchmark">
      <section className="panel benchmark-intro">
        <p className="eyebrow">AUTOMATIC EVALUATION</p>
        <h2>Generate a reproducible cache workload</h2>
        <p>CachePulse creates the operation trace, then runs the same ordered reads and writes against fresh LRU and LFU caches. Workload generation is timed separately.</p>
      </section>

      {error && <div className="feedback feedback-error" role="alert"><strong>Benchmark could not be completed</strong><span>{error}</span></div>}

      <div className="benchmark-layout">
        <section className="panel benchmark-form">
          <div className="section-heading"><div><p className="eyebrow">RUN CONFIGURATION</p><h2>Workload settings</h2></div><span className="synthetic-tag">BOUNDED RUN</span></div>
          <label className="field">Workload type
            <select value={workloadType} onChange={(event) => {
              const next = event.target.value as BenchmarkWorkload;
              setWorkloadType(next);
              if (next === "READ_HEAVY") setReadPercentage((current) => Math.max(90, current));
            }}>
              {WORKLOADS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="form-row benchmark-fields">
            <label className="field">Operations<input type="number" min="1" max="100000" value={operations} onChange={(event) => setOperations(Number(event.target.value))} /></label>
            <label className="field">Cache capacity<input type="number" min="1" max="100000" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></label>
            <label className="field">Distinct keys<input type="number" min="1" max="100000" value={distinctKeys} onChange={(event) => setDistinctKeys(Number(event.target.value))} /></label>
            <label className="field">TTL in seconds <span className="field-note">Optional</span><input type="number" min="1" max="604800" value={ttlSeconds} onChange={(event) => setTtlSeconds(event.target.value)} placeholder="No expiration" /></label>
            <label className="field">Read percentage<input type="number" min="0" max="100" value={readPercentage} onChange={(event) => setReadPercentage(Number(event.target.value))} /><small className="field-help">Read-heavy workloads enforce at least 90% reads.</small></label>
            <label className="field">Random seed<input type="number" step="1" value={seed} onChange={(event) => setSeed(event.target.value)} /><small className="field-help">Same settings and seed reproduce cache outcomes.</small></label>
            <label className="field">Measured trials<input type="number" min="1" max="20" value={trials} onChange={(event) => setTrials(Number(event.target.value))} /><small className="field-help">One warm-up per policy; 1–20 measured runs.</small></label>
          </div>
          <button className="button button-primary full-button" disabled={busy} onClick={() => void run()}>
            {busy ? <><span className="spinner small" /> Running both policies…</> : "Start benchmark"}
          </button>
          <p className="form-footnote">Maximum 100,000 operations per policy. A short warm-up pass runs before the measured pass.</p>
        </section>

        <section className="panel benchmark-results" aria-live="polite">
          <div className="section-heading"><div><p className="eyebrow">MEASURED RESULTS</p><h2>{result ? "LRU vs LFU" : "Results will appear here"}</h2></div></div>
          {!result ? <div className="stress-empty"><span className="empty-mark" aria-hidden="true">↗</span><p>Choose a workload and start a run to see measured cache outcomes, latency, throughput, and the policy advisor.</p></div> : <>
            <div className="benchmark-result-grid">
              {result.comparisons.map((comparison) => <article className="benchmark-policy" key={comparison.policy}>
                <div className="result-heading"><span className={`policy-mark ${comparison.policy.toLowerCase()}`} aria-hidden="true" /><div><span className="eyebrow">MEASURED POLICY</span><h3>{comparison.policy}</h3></div></div>
                <div className="result-rate">{(comparison.hitRate * 100).toFixed(1)}<small>%</small></div>
                <div className="result-rate-label">Hit rate across {comparison.reads.toLocaleString()} reads</div>
                <div className="bar-track" role="progressbar" aria-label={`${comparison.policy} hit rate`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={comparison.hitRate * 100}><span style={{ width: `${Math.min(100, comparison.hitRate * 100)}%` }} /></div>
                <dl className="benchmark-metrics">
                  <div><dt>Hits / misses</dt><dd>{comparison.hits.toLocaleString()} / {comparison.misses.toLocaleString()}</dd></div>
                  <div><dt>Writes / evictions</dt><dd>{comparison.writes.toLocaleString()} / {comparison.evictions.toLocaleString()}</dd></div>
                  <div><dt>Expirations</dt><dd>{comparison.expirations.toLocaleString()}</dd></div>
                  <div><dt>Throughput</dt><dd>{comparison.operationsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/s</dd></div>
                  <div><dt>Execution duration</dt><dd>{formatLatency(comparison.durationNanos)}</dd></div>
                  <div><dt>p50 / p95 latency</dt><dd>{formatLatency(comparison.p50LatencyNanos)} / {formatLatency(comparison.p95LatencyNanos)}</dd></div>
                  <div><dt>p99 latency</dt><dd>{formatLatency(comparison.p99LatencyNanos)}</dd></div>
                  <div><dt>Trial throughput range</dt><dd>{comparison.minOperationsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })}–{comparison.maxOperationsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/s</dd></div>
                  <div><dt>p95 latency range</dt><dd>{formatLatency(comparison.minP95LatencyNanos)}–{formatLatency(comparison.maxP95LatencyNanos)}</dd></div>
                </dl>
              </article>)}
            </div>
            <section className="benchmark-advisor" aria-label="Policy advisor">
              <div className="insight-icon" aria-hidden="true">i</div>
              <div><span className="eyebrow">POLICY ADVISOR · {result.recommendation.assessment.replace(/_/g, " ")}</span>
                <h3>{result.recommendation.recommendedPolicy ? `${result.recommendation.recommendedPolicy} recommended for this run` : "No clear policy winner"}</h3>
                <p>{result.recommendation.explanation}</p>
                <small>{result.recommendation.tradeoff}</small>
                <small>{result.recommendation.limitation}</small>
              </div>
            </section>
            <p className="benchmark-note">{result.measurementNote} Workload generation: {(result.workloadGenerationNanos / 1_000_000).toFixed(2)} ms. Trace fingerprint: <code>{result.workloadFingerprint}</code>.</p>
          </>}
        </section>
      </div>
    </div>
  );
}
