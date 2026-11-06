const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export type Stats = {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  capacity: number;
  policy: string;
  totalRequests: number;
  hitRate: number;
  missRate: number;
  validEntries: number;
  expiredEntries: number;
};

export type SimulationResult = {
  policy: string;
  workload: string;
  stats: Stats;
};

export type WorkloadProfile = {
  id: string;
  name: string;
  description: string;
  behavior: string[];
};

export type WorkloadCharacteristics = {
  requests: number;
  uniqueKeys: number;
  repeatedAccesses: number;
  topTenPercentAccessShare: number;
  temporalLocality: number;
  frequencyConcentration: "High" | "Medium" | "Low";
  temporalLocalityLevel: "High" | "Medium" | "Low";
  workloadType: string;
  mostAccessedKeys: Array<{ key: string; accesses: number; accessShare: number }>;
  frequencyDistribution: Array<{ accessesPerKey: number; keyCount: number }>;
};

export type PolicyAnalysis = {
  workload: string;
  workloadName: string;
  capacity: number;
  comparisons: SimulationResult[];
  characteristics: WorkloadCharacteristics;
  insight: string;
};

export type StressResult = {
  attempted: number;
  completed: number;
  errors: number;
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  hitRate: number;
  durationNanos: number;
  operationsPerSecond: number;
  finalSize: number;
  cacheGeneration: number;
  cacheCapacity: number;
  cachePolicy: "LRU" | "LFU";
  stats: Stats;
};

export type BenchmarkWorkload = "UNIFORM" | "ZIPFIAN" | "SEQUENTIAL_SCAN" | "BURSTY" | "READ_HEAVY" | "MIXED";

export type BenchmarkRequest = {
  workloadType: BenchmarkWorkload;
  operations: number;
  capacity: number;
  distinctKeys: number;
  ttlSeconds?: number;
  readPercentage: number;
  seed: number;
  trials?: number;
};

export type BenchmarkPolicyResult = {
  policy: "LRU" | "LFU";
  operations: number;
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  expirations: number;
  durationNanos: number;
  operationsPerSecond: number;
  p50LatencyNanos: number;
  p95LatencyNanos: number;
  p99LatencyNanos: number;
  minOperationsPerSecond: number;
  maxOperationsPerSecond: number;
  minP95LatencyNanos: number;
  maxP95LatencyNanos: number;
  trials: Array<{ trial: number; durationNanos: number; operationsPerSecond: number; p50LatencyNanos: number; p95LatencyNanos: number; p99LatencyNanos: number; hits: number; misses: number; evictions: number; expirations: number }>;
};

export type BenchmarkResult = {
  configuration: BenchmarkRequest;
  workloadGenerationNanos: number;
  workloadFingerprint: string;
  comparisons: BenchmarkPolicyResult[];
  caffeineBaseline: {
    implementation: string;
    evictionDescription: string;
    operations: number;
    reads: number;
    writes: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    expirationRemovals: number;
    otherRemovals: number;
    durationNanos: number;
    operationsPerSecond: number;
    p50LatencyNanos: number;
    p95LatencyNanos: number;
    p99LatencyNanos: number;
    metricNote: string;
  };
  recommendation: {
    recommendedPolicy: "LRU" | "LFU" | null;
    assessment: "CLEAR_ADVANTAGE" | "MODEST_ADVANTAGE" | "SIMILAR" | "INSUFFICIENT";
    hitRateDifference: number;
    explanation: string;
    tradeoff: string;
    limitation: string;
  };
  measurementNote: string;
};

async function request<T>(path: string, init?: RequestInit, apiRoot = "/api/cache"): Promise<T> {
  const response = await fetch(`${baseUrl}${apiRoot}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error ?? body.message ?? body.status;
    const message = typeof detail === "string" ? detail : detail == null ? "" : JSON.stringify(detail);
    throw new Error(message || `Request failed (${response.status})`);
  }
  return body as T;
}

function validateWorkloads(value: WorkloadProfile[]): WorkloadProfile[] {
  if (!Array.isArray(value) || value.some((profile) =>
    !profile || typeof profile.id !== "string" || typeof profile.name !== "string" ||
    typeof profile.description !== "string" || !Array.isArray(profile.behavior) ||
    profile.behavior.some((item) => typeof item !== "string"))) {
    throw new Error("The backend returned an invalid workload profiles response.");
  }
  return value;
}

function validateStats(value: Stats): Stats {
  const numericKeys: Array<keyof Stats> = [
    "hits", "misses", "evictions", "expirations", "size", "capacity", "totalRequests", "hitRate", "missRate", "validEntries", "expiredEntries",
  ];
  if (!value || numericKeys.some((key) => typeof value[key] !== "number")) {
    throw new Error("The backend returned an invalid cache metrics response.");
  }
  return value;
}

export const api = {
  stats: async () => validateStats(await request<Stats>("/stats")),
  workloads: async () => validateWorkloads(await request<WorkloadProfile[]>("/workloads")),
  put: (key: string, value: string, ttlSeconds?: number) =>
    request<{ key: string; value: string; status: string }>(`/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, ttlSeconds }),
    }),
  get: async (key: string) => {
    const response = await fetch(`${baseUrl}/api/cache/${encodeURIComponent(key)}`);
    const result = await response.json();
    if (!response.ok && response.status !== 404) {
      throw new Error(result.error ?? `Request failed (${response.status})`);
    }
    return result as { key: string; value: string | null; status: string };
  },
  remove: (key: string) =>
    request<{ status: string; key: string }>(`/${encodeURIComponent(key)}`, { method: "DELETE" }),
  clear: () => request<{ status: string }>("", { method: "DELETE" }),
  policy: (policy: string) =>
    request<{ policy: string }>("/policy", {
      method: "POST",
      body: JSON.stringify({ policy }),
    }),
  configure: (capacity: number, policy: string) =>
    request<{ capacity: number; policy: string; workloads: string[] }>(
      `/configure?capacity=${capacity}&policy=${encodeURIComponent(policy)}`,
      { method: "POST" },
    ),
  analyze: (workload: string, capacity: number, requests: number) =>
    request<PolicyAnalysis>(
      `/analyze?workload=${encodeURIComponent(workload)}&capacity=${capacity}&requests=${requests}`,
      { method: "POST" },
    ),
  stress: (threads: number, operations: number) =>
    request<StressResult>(`/stress?threads=${threads}&operations=${operations}`, { method: "POST" }),
  benchmark: (configuration: BenchmarkRequest) =>
    request<BenchmarkResult>("", {
      method: "POST",
      body: JSON.stringify(configuration),
    }, "/api/benchmarks"),
};
