import { useCallback, useEffect, useState } from "react";
import MetricCard from "../components/MetricCard";
import AutomaticBenchmark from "../components/AutomaticBenchmark";
import PolicyComparison from "../components/PolicyComparison";
import PolicySelector from "../components/PolicySelector";
import TTLMonitor from "../components/TTLMonitor";
import { api, type PolicyAnalysis, type Stats, type StressResult, type WorkloadProfile } from "../services/api";

type Section = "Overview" | "Automatic Evaluation" | "Policy Lab" | "Workloads" | "Stress Test";
const SECTIONS: Section[] = ["Overview", "Automatic Evaluation", "Policy Lab", "Workloads", "Stress Test"];

export default function Dashboard() {
  const [section, setSection] = useState<Section>("Overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [profiles, setProfiles] = useState<WorkloadProfile[]>([]);
  const [profilesError, setProfilesError] = useState("");
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState("LRU");
  const [capacity, setCapacity] = useState(4);
  const [capacityDirty, setCapacityDirty] = useState(false);
  const [key, setKey] = useState("member:demo-104");
  const [value, setValue] = useState("eligibility-summary");
  const [ttl, setTtl] = useState("");
  const [workload, setWorkload] = useState("claims-processing");
  const [labCapacity, setLabCapacity] = useState(500);
  const [labRequests, setLabRequests] = useState(10_000);
  const [analysis, setAnalysis] = useState<PolicyAnalysis | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [stressThreads, setStressThreads] = useState(8);
  const [stressOperations, setStressOperations] = useState(10_000);
  const [stressBusy, setStressBusy] = useState(false);
  const [stressResult, setStressResult] = useState<StressResult | null>(null);
  const [stressDuration, setStressDuration] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await api.stats();
      setStats(current);
      setPolicy(current.policy);
      if (!capacityDirty) setCapacity(current.capacity);
      setConnection("online");
      setError("");
    } catch (requestError) {
      setConnection("offline");
      setError(requestError instanceof Error ? requestError.message : "Could not reach the backend.");
    }
  }, [capacityDirty]);

  const refreshProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError("");
    try {
      setProfiles(await api.workloads());
    } catch (requestError) {
      setProfilesError(requestError instanceof Error ? requestError.message : "Could not load workload profiles.");
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshProfiles();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshProfiles]);

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyConfiguration() {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000) {
      setError("Capacity must be between 1 and 100,000.");
      return;
    }
    if (capacity === stats?.capacity) {
      await perform(() => api.policy(policy), "Eviction policy updated.");
    } else {
      await perform(() => api.configure(capacity, policy), "Capacity and policy applied. Existing entries were reset.");
      setCapacityDirty(false);
    }
  }

  async function putConfiguredValue() {
    if (!key.trim() || !value.trim()) {
      setError("Cache key and value are required.");
      return;
    }
    const parsedTtl = ttl.trim() === "" ? undefined : Number(ttl);
    if (parsedTtl !== undefined && (!Number.isInteger(parsedTtl) || parsedTtl < 1 || parsedTtl > 604_800)) {
      setError("TTL must be a whole number between 1 and 604,800 seconds, or left empty.");
      return;
    }
    await perform(() => api.put(key, value, parsedTtl), "Value stored in the active cache.");
  }

  async function readKey() {
    setError("");
    setMessage("");
    try {
      const result = await api.get(key);
      setMessage(result.status === "HIT" ? `HIT · ${result.key} returned ${result.value}` : `${result.status} · ${result.key} was not present.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The request could not be completed.");
    }
  }

  async function runAnalysis() {
    if (!Number.isInteger(labCapacity) || labCapacity < 1 || labCapacity > 100_000 ||
        !Number.isInteger(labRequests) || labRequests < 1 || labRequests > 100_000) {
      setError("Choose a capacity and request count between 1 and 100,000.");
      return;
    }
    setAnalysisBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.analyze(workload, labCapacity, labRequests);
      setAnalysis(result);
      setMessage("Comparison complete. Both policies ran the same generated trace.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Comparison failed.");
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function runStress() {
    if (!Number.isInteger(stressThreads) || stressThreads < 1 || stressThreads > 128 ||
        !Number.isInteger(stressOperations) || stressOperations < 1 || stressOperations > 100_000 ||
        stressThreads * stressOperations > 1_000_000) {
      setError("Use 1–128 threads and 1–100,000 operations per thread, up to 1,000,000 total operations.");
      return;
    }
    setStressBusy(true);
    setStressResult(null);
    setError("");
    const started = performance.now();
    try {
      const result = await api.stress(stressThreads, stressOperations);
      setStressDuration(performance.now() - started);
      setStressResult(result);
      setMessage(`Stress run complete. Results are from cache generation ${result.cacheGeneration} (${result.cachePolicy}, capacity ${result.cacheCapacity}).`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Stress test failed.");
    } finally {
      setStressBusy(false);
    }
  }

  const metrics: Array<[string, string | number, string, boolean?]> = [
    ["Hit rate", stats ? `${(stats.hitRate * 100).toFixed(1)}%` : "—", "of cache lookups", true],
    ["Miss rate", stats ? `${(stats.missRate * 100).toFixed(1)}%` : "—", "of cache lookups"],
    ["Total requests", stats?.totalRequests.toLocaleString() ?? "—", "GET operations"],
    ["Current entries", stats ? `${stats.size.toLocaleString()} / ${stats.capacity.toLocaleString()}` : "—", "occupied capacity"],
    ["Evictions", stats?.evictions.toLocaleString() ?? "—", "capacity removals"],
    ["Expirations", stats?.expirations.toLocaleString() ?? "—", "observed on access"],
  ];

  const selectedProfile = profiles.find((profile) => profile.id === workload);
  const recentProfile = profiles.find((profile) => profile.id === analysis?.workload);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#overview" onClick={() => setSection("Overview")} aria-label="CachePulse overview">
          <span className="brand-symbol" aria-hidden="true"><span /></span>
          <span className="brand-name">CachePulse<small>PERFORMANCE &amp; OBSERVABILITY</small></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          {SECTIONS.map((item) => (
            <button key={item} aria-current={section === item ? "page" : undefined} className={section === item ? "nav-tab active" : "nav-tab"} onClick={() => { setSection(item); setError(""); setMessage(""); }}>
              {item}
            </button>
          ))}
        </nav>
        <div className={`connection connection-${connection}`} aria-live="polite">
          <span className="connection-dot" />
          {connection === "online" ? "Backend connected" : connection === "offline" ? "Backend unavailable" : "Checking backend"}
        </div>
      </header>

      <main className="page-wrap" id="overview">
        <div className="page-intro">
          <div><p className="eyebrow">CACHE PERFORMANCE ENGINEERING</p><h1>{section === "Overview" ? "Cache overview" : section}</h1>
            <p className="page-description">{section === "Overview" ? "Measure cache behavior, compare eviction strategies, and analyze workload performance." : section === "Automatic Evaluation" ? "Generate a bounded synthetic trace and compare LRU and LFU using the same operations." : section === "Policy Lab" ? "Run one deterministic trace through two eviction strategies and inspect the measured behavior." : section === "Workloads" ? "Explore healthcare-oriented simulated access patterns. These profiles use synthetic keys and contain no patient data." : "Exercise the shared in-memory cache with concurrent GET and PUT operations."}</p>
          </div>
          <div className="live-summary"><span className="summary-label">ACTIVE POLICY</span><strong>{stats?.policy ?? "—"}</strong><span className="summary-divider" /><span className="summary-label">CAPACITY</span><strong>{stats?.capacity.toLocaleString() ?? "—"}</strong></div>
        </div>

        {error && <div className="feedback feedback-error" role="alert"><strong>Request could not be completed</strong><span>{error}</span>{connection === "offline" && <small>Start the backend in backend/ with <code>.\mvnw.cmd spring-boot:run</code>.</small>}</div>}
        {message && <div className="feedback feedback-success" role="status"><span className="feedback-check" aria-hidden="true">✓</span>{message}</div>}

        {section === "Automatic Evaluation" && <AutomaticBenchmark />}

        {section === "Overview" && (
          <>
            <section className="metrics-grid" aria-label="Live cache metrics">
              {metrics.map(([label, metric, detail, emphasis]) => <MetricCard key={label} label={label} value={metric} detail={detail} emphasis={emphasis} />)}
            </section>
            <div className="overview-grid">
              <section className="panel configuration-panel">
                <div className="section-heading"><div><p className="eyebrow">LIVE CACHE</p><h2>Cache configuration</h2></div><span className="live-tag"><i className="status-dot" /> Live</span></div>
                <p className="section-copy">These controls change the shared cache instance used by live operations.</p>
                <div className="form-row">
                  <PolicySelector value={policy} onChange={setPolicy} />
                  <label className="field">Capacity<input type="number" min="1" max="100000" value={capacity} onChange={(event) => { setCapacity(Number(event.target.value)); setCapacityDirty(true); }} /></label>
                </div>
                <div className="form-row cache-form">
                  <label className="field">Cache key<input value={key} onChange={(event) => setKey(event.target.value)} placeholder="synthetic demo key" /></label>
                  <label className="field">Value<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
                  <label className="field">TTL in seconds <span className="field-note">Optional</span><input type="number" min="1" value={ttl} onChange={(event) => setTtl(event.target.value)} placeholder="No expiration" /></label>
                </div>
                <div className="button-row">
                  <button className="button button-primary" disabled={busy || connection !== "online"} onClick={() => void applyConfiguration()}>{busy ? "Applying…" : "Apply configuration"}</button>
                  <button className="button button-secondary" disabled={busy || connection !== "online" || !key.trim() || !value.trim()} onClick={() => void putConfiguredValue()}>PUT value</button>
                  <button className="button button-secondary" disabled={busy || connection !== "online" || !key.trim()} onClick={() => void readKey()}>GET key</button>
                  <button className="button button-secondary" disabled={busy || connection !== "online" || !key.trim()} onClick={() => void perform(() => api.remove(key), "Remove request completed.")}>Remove key</button>
                  <button className="button button-quiet" disabled={busy || connection !== "online"} onClick={() => void perform(() => api.clear(), "Active cache cleared.")}>Clear cache</button>
                </div>
              </section>

              <TTLMonitor stats={stats} />
            </div>
            <section className="visualization-grid">
              <section className="panel chart-panel">
                <div className="section-heading"><div><p className="eyebrow">REQUEST OUTCOME</p><h2>Hit and miss distribution</h2></div><span className="chart-window">Cumulative</span></div>
                {stats && stats.totalRequests > 0 ? <>
                  <div className="distribution-bar" role="img" aria-label={`${(stats.hitRate * 100).toFixed(1)} percent hits and ${(stats.missRate * 100).toFixed(1)} percent misses`}><span className="distribution-hit" style={{ width: `${stats.hitRate * 100}%` }} /><span className="distribution-miss" style={{ width: `${stats.missRate * 100}%` }} /></div>
                  <div className="chart-legend"><span><i className="legend-hit" />Hits <b>{(stats.hitRate * 100).toFixed(1)}%</b></span><span><i className="legend-miss" />Misses <b>{(stats.missRate * 100).toFixed(1)}%</b></span></div>
                </> : <p className="chart-empty">{stats ? "No GET requests recorded yet." : "Waiting for live cache metrics."}</p>}
              </section>
              <section className="panel chart-panel lifecycle-chart">
                <div className="section-heading"><div><p className="eyebrow">CAPACITY EVENTS</p><h2>Removals observed</h2></div><span className="chart-window">Cumulative</span></div>
                {stats ? <div className="event-bars"><div><span>Evictions</span><div className="event-track"><i className="eviction-bar" style={{ width: `${stats.evictions + stats.expirations === 0 ? 0 : Math.max(2, (stats.evictions / Math.max(1, stats.evictions + stats.expirations)) * 100)}%` }} /></div><b>{stats.evictions.toLocaleString()}</b></div><div><span>Expirations</span><div className="event-track"><i className="expiration-bar" style={{ width: `${stats.evictions + stats.expirations === 0 ? 0 : Math.max(2, (stats.expirations / Math.max(1, stats.evictions + stats.expirations)) * 100)}%` }} /></div><b>{stats.expirations.toLocaleString()}</b></div></div> : <p className="chart-empty">Waiting for live cache metrics.</p>}
                <p className="chart-caption">The bars show the split between cumulative eviction and expiration counts.</p>
              </section>
            </section>
            <section className="next-step panel"><div><p className="eyebrow">COMPARE STRATEGIES</p><h2>How would another policy handle this access pattern?</h2><p>Run LRU and LFU against the same generated workload in the Policy Lab.</p></div><button className="button button-primary" onClick={() => setSection("Policy Lab")}>Open Policy Lab <span aria-hidden="true">→</span></button></section>
          </>
        )}

        {section === "Policy Lab" && (
          <>
            <section className="lab-banner panel"><div><p className="eyebrow">SAME TRACE · TWO POLICIES</p><h2>Measure before drawing conclusions.</h2><p>CachePulse generates a deterministic synthetic access trace, then executes it separately against fresh LRU and LFU caches at the same capacity.</p></div><div className="banner-stamp"><span>LRU</span><b>↔</b><span>LFU</span></div></section>
            <div className="lab-layout">
              <section className="panel lab-form">
                <div className="section-heading"><div><p className="eyebrow">EXPERIMENT SETUP</p><h2>Healthcare workload lab</h2></div><span className="synthetic-tag">SIMULATED DATA</span></div>
                <label className="field">Workload profile<select value={workload} onChange={(event) => setWorkload(event.target.value)} disabled={!profiles.length}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                {selectedProfile && <div className="profile-description"><p>{selectedProfile.description}</p><ul>{selectedProfile.behavior.map((item) => <li key={item}>{item}</li>)}</ul></div>}
                {!profiles.length && <div className="helper-text" role={profilesError ? "alert" : undefined}>{profilesError ? <>Could not load workload profiles: {profilesError} <button className="text-button" type="button" disabled={profilesLoading} onClick={() => void refreshProfiles()}>{profilesLoading ? "Retrying…" : "Retry"}</button></> : profilesLoading ? "Loading workload profiles…" : "No workload profiles are available."}</div>}
                <div className="form-row lab-number-fields">
                  <label className="field">Cache capacity<input type="number" min="1" max="100000" value={labCapacity} onChange={(event) => setLabCapacity(Number(event.target.value))} /></label>
                  <label className="field">Requests<input type="number" min="1" max="100000" value={labRequests} onChange={(event) => setLabRequests(Number(event.target.value))} /></label>
                </div>
                <button className="button button-primary full-button" disabled={analysisBusy || connection !== "online" || !profiles.length} onClick={() => void runAnalysis()}>{analysisBusy ? <><span className="spinner small" /> Running comparison…</> : "Run comparison"}</button>
                <div className="lab-helper-row"><p className="form-footnote">Maximum 100,000 requests per run. Each result uses a fresh cache.</p><button className="text-button" type="button" onClick={() => { setWorkload("member-services"); setLabCapacity(40); setLabRequests(2_000); setAnalysis(null); setError(""); setMessage(""); }}>Load sample run: Member Services · 40 capacity · 2,000 requests</button></div>
              </section>
              <PolicyComparison analysis={analysis} loading={analysisBusy} />
            </div>
          </>
        )}

        {section === "Workloads" && (
          <>
            <section className="workload-intro panel"><p className="eyebrow">SYNTHETIC ACCESS PROFILES</p><h2>Healthcare-oriented workload patterns</h2><p>These deterministic simulations illustrate common transaction shapes. They are not production traces and do not contain patient data.</p></section>
            <section className="workload-grid" aria-label="Available simulated workload profiles">
              {profiles.map((profile, index) => <article className="panel workload-card" key={profile.id}><div className="workload-card-head"><span className="workload-index">0{index + 1}</span><span className="synthetic-tag">SYNTHETIC</span></div><h3>{profile.name}</h3><p>{profile.description}</p><ul>{profile.behavior.map((item) => <li key={item}>{item}</li>)}</ul><button className="text-button" onClick={() => { setWorkload(profile.id); setSection("Policy Lab"); setError(""); setMessage(""); }}>{analysis?.workload === profile.id ? "View measured analysis" : "Compare this profile"}<span aria-hidden="true">→</span></button></article>)}
            </section>
            {analysis && recentProfile && <section className="panel recent-analysis"><div><p className="eyebrow">LATEST MEASURED TRACE</p><h2>{recentProfile.name}</h2><p>{analysis.characteristics.requests.toLocaleString()} synthetic requests · {analysis.characteristics.uniqueKeys.toLocaleString()} unique keys · capacity {analysis.capacity.toLocaleString()}</p></div><button className="button button-secondary" onClick={() => { setWorkload(analysis.workload); setSection("Policy Lab"); }}>View results</button></section>}
          </>
        )}

        {section === "Stress Test" && (
          <div className="stress-layout">
            <section className="panel stress-setup"><div className="section-heading"><div><p className="eyebrow">CONCURRENCY BENCH</p><h2>Stress the shared cache</h2></div><span className="live-tag"><i className="status-dot" /> Live cache</span></div><p className="section-copy">Workers perform concurrent GET and PUT operations against the active cache. The backend reports completed operations and errors.</p>
              <div className="form-row"><label className="field">Threads<input type="number" min="1" max="128" value={stressThreads} onChange={(event) => setStressThreads(Number(event.target.value))} /></label><label className="field">Operations per thread<input type="number" min="1" max="100000" value={stressOperations} onChange={(event) => setStressOperations(Number(event.target.value))} /></label></div>
              <div className="stress-workload"><span>Operation mix</span><strong>Mixed GET / PUT</strong><small>About one third writes and two thirds reads across worker operations.</small></div>
              <button className="button button-primary full-button" disabled={stressBusy || connection !== "online"} onClick={() => void runStress()}>{stressBusy ? <><span className="spinner small" /> Running stress test…</> : "Run stress test"}</button>
              <p className="form-footnote">Maximum 1,000,000 total operations per run.</p>
            </section>
            <section className="panel stress-results"><div className="section-heading"><div><p className="eyebrow">RUN RESULTS</p><h2>{stressResult ? "Measured execution" : "Awaiting a run"}</h2></div></div>
              {stressResult ? <><p className="helper-text">Cache generation {stressResult.cacheGeneration} · {stressResult.cachePolicy} · capacity {stressResult.cacheCapacity}</p><div className="stress-stat-grid"><div><strong>{stressResult.attempted.toLocaleString()}</strong><span>Attempted</span></div><div><strong>{stressResult.completed.toLocaleString()}</strong><span>Completed</span></div><div><strong>{stressResult.errors.toLocaleString()}</strong><span>Errors</span></div><div><strong>{stressResult.reads.toLocaleString()} / {stressResult.writes.toLocaleString()}</strong><span>Reads / writes</span></div><div><strong>{stressResult.hits.toLocaleString()} / {stressResult.misses.toLocaleString()}</strong><span>Run hits / misses</span></div><div><strong>{stressResult.finalSize.toLocaleString()}</strong><span>Final entries</span></div></div><div className="duration-note"><span>Server throughput <b>{stressResult.operationsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/s</b></span><span>Client duration <b>{((stressDuration ?? 0) / 1000).toFixed(2)} s</b></span></div></> : <div className="stress-empty"><span className="empty-mark" aria-hidden="true">⌁</span><p>Configure the run and start it to see actual operation totals, errors, and final cache state.</p></div>}
            </section>
          </div>
        )}

        <footer className="app-footer"><span>CachePulse <i /> Cache Performance &amp; Observability</span><span>All measurements come from backend cache execution.</span></footer>
      </main>
    </div>
  );
}
