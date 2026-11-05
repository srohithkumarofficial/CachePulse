package com.cachepulse.dto;

public record BenchmarkBaselineResult(
        String implementation,
        String evictionDescription,
        int operations,
        int reads,
        int writes,
        long hits,
        long misses,
        double hitRate,
        // Capacity-based evictions; retained field name for API compatibility.
        long evictions,
        long expirationRemovals,
        long otherRemovals,
        long durationNanos,
        double operationsPerSecond,
        long p50LatencyNanos,
        long p95LatencyNanos,
        long p99LatencyNanos,
        String metricNote) { }
