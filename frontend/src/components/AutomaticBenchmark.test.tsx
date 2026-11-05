import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AutomaticBenchmark from "./AutomaticBenchmark";
import type { BenchmarkResult } from "../services/api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const result: BenchmarkResult = {
  configuration: {
    workloadType: "ZIPFIAN", operations: 10, capacity: 4, distinctKeys: 8,
    readPercentage: 90, seed: 2026, trials: 3,
  },
  workloadGenerationNanos: 25_000,
  workloadFingerprint: "a".repeat(64),
  comparisons: (["LRU", "LFU"] as const).map((policy) => ({
    policy, operations: 10, reads: 9, writes: 1, hits: 4, misses: 5, hitRate: 4 / 9,
    evictions: 0, expirations: 0, durationNanos: 850, operationsPerSecond: 11_000_000,
    p50LatencyNanos: 240, p95LatencyNanos: 1_250, p99LatencyNanos: 2_300,
    minOperationsPerSecond: 9_000_000, maxOperationsPerSecond: 13_000_000,
    minP95LatencyNanos: 1_000, maxP95LatencyNanos: 1_700,
    trials: [],
  })),
  caffeineBaseline: {
    implementation: "Caffeine", evictionDescription: "W-TinyLFU", operations: 10, reads: 9, writes: 1,
    hits: 4, misses: 5, hitRate: 4 / 9, evictions: 0, expirationRemovals: 0, otherRemovals: 0, durationNanos: 800,
    operationsPerSecond: 12_000_000, p50LatencyNanos: 200, p95LatencyNanos: 1_100,
    p99LatencyNanos: 2_000, metricNote: "Caffeine statistics.",
  },
  recommendation: {
    recommendedPolicy: "LRU", assessment: "MODEST_ADVANTAGE", hitRateDifference: 0.1,
    explanation: "LRU performed well.", tradeoff: "Results vary.", limitation: "Synthetic trace.",
  },
  measurementNote: "Execution timing is in nanoseconds.",
};

describe("AutomaticBenchmark", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("submits the selected trial count and shows a loading state", async () => {
    const user = userEvent.setup();
    let finish!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AutomaticBenchmark />);

    await user.clear(screen.getByLabelText(/Measured trials/));
    await user.type(screen.getByLabelText(/Measured trials/), "3");
    await user.click(screen.getByRole("button", { name: "Start benchmark" }));

    expect(fetch).toHaveBeenCalledWith("/api/benchmarks", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"trials":3'),
    }));
    expect((screen.getByRole("button", { name: /Running cache comparison/ }) as HTMLButtonElement).disabled).toBe(true);
    finish(jsonResponse(result));
    await screen.findByText("Cache implementation comparison");
  });

  it("renders precise latency units and trial variability", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(result));
    render(<AutomaticBenchmark />);
    fireEvent.click(screen.getByRole("button", { name: "Start benchmark" }));

    await screen.findAllByText("Execution duration");
    const metricValue = (label: string) => screen.getAllByText(label).map((element) => element.parentElement?.textContent ?? "");
    expect(metricValue("p50 / p95 latency").every((value) => value.includes("240 ns / 1.25 µs"))).toBe(true);
    expect(metricValue("Trial throughput range").every((value) => value.includes("ops/s"))).toBe(true);
    expect(metricValue("p95 latency range").every((value) => value.includes("1.00 µs–1.70 µs"))).toBe(true);
    expect(screen.getByText(/Workload generation:/).textContent).toContain("0.03 ms");
  });

  it("shows API failures and returns to the idle state", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "Service unavailable" }, 503));
    render(<AutomaticBenchmark />);
    await user.click(screen.getByRole("button", { name: "Start benchmark" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Service unavailable");
    expect((screen.getByRole("button", { name: "Start benchmark" }) as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
