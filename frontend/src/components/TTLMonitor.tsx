import type { Stats } from "../services/api";

type TTLMonitorProps = { stats: Stats | null };

export default function TTLMonitor({ stats }: TTLMonitorProps) {
  return (
    <section className="panel lifecycle-panel">
      <div className="section-heading">
        <div><span className="eyebrow">ENTRY LIFECYCLE</span><h2>TTL monitor</h2></div>
        <span className="status-label"><i className="status-dot" /> Operation-driven</span>
      </div>
      <div className="lifecycle-grid">
        <div><strong>{stats?.size.toLocaleString() ?? "—"}</strong><span>Stored entries</span></div>
        <div><strong>{stats?.validEntries.toLocaleString() ?? "—"}</strong><span>Valid entries</span></div>
        <div><strong>{stats?.expiredEntries.toLocaleString() ?? "—"}</strong><span>Expired, awaiting cleanup</span></div>
        <div><strong>{stats?.expirations.toLocaleString() ?? "—"}</strong><span>Expirations observed</span></div>
      </div>
      <p className="helper-text">TTL is set per entry when you write a value. Expiration is counted when a cache operation discovers and removes an expired entry.</p>
    </section>
  );
}
