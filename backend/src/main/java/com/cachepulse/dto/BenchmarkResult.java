package com.cachepulse.dto;

import java.util.List;

public record BenchmarkResult(
        BenchmarkRequest configuration,
        long workloadGenerationNanos,
        String workloadFingerprint,
        List<BenchmarkPolicyResult> comparisons,
        BenchmarkBaselineResult caffeineBaseline,
        PolicyRecommendation recommendation,
        String measurementNote) {
}
