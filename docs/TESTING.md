# Testing

Run backend tests and packaging from `backend/` in PowerShell:

```powershell
.\mvnw.cmd test
.\mvnw.cmd package
```

The Maven Wrapper pins Maven 3.9.16. A JDK 17+ must be installed; set `JAVA_HOME` if your shell does not already expose it. The JUnit suite covers cache operations, LRU/LFU behavior, TTL with both real and injected clocks, metrics, concurrency, simulations, seeded benchmark reproducibility, fairness, input validation, policy recommendations, and REST integration.

Run frontend tests and build from `frontend/`:

```powershell
npm install
npm test
npm run build
```

The Vitest suite covers benchmark submission/results and Policy Lab workload profile loading, selection, and retry behavior. `npm run build` runs TypeScript checking and creates the production Vite bundle.

Manual API checks can use the examples in [API](API.md) after starting the backend. Verify `/api/cache/stats`, `/api/cache/workloads`, each `/api/cache/analyze` profile, `/api/benchmarks` with repeated seeds, active-cache PUT/GET/TTL and policy changes, and `/api/cache/stress`. Analysis and benchmark results should come from backend responses, not UI fixtures.
