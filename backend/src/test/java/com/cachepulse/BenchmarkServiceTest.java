package com.cachepulse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.cachepulse.cache.eviction.PolicyType;
import com.cachepulse.dto.BenchmarkRequest;
import com.cachepulse.dto.BenchmarkWorkload;
import com.cachepulse.service.BenchmarkService;
import com.cachepulse.service.PolicyInsightEngine;
import org.junit.jupiter.api.Test;

class BenchmarkServiceTest {
    private final BenchmarkService service = new BenchmarkService(new PolicyInsightEngine());

    @Test
    void sameSeedProducesEqualMeasuredCacheOutcomesForBothPolicies() {
        var request = new BenchmarkRequest(BenchmarkWorkload.ZIPFIAN, 2_000, 32, 64, null, 80, 4812);

        var first = service.run(request);
        var second = service.run(request);

        assertEquals(first.comparisons().get(0).hits(), second.comparisons().get(0).hits());
        assertEquals(first.comparisons().get(0).misses(), second.comparisons().get(0).misses());
        assertEquals(first.comparisons().get(1).hits(), second.comparisons().get(1).hits());
        assertEquals(first.comparisons().get(1).evictions(), second.comparisons().get(1).evictions());
        assertEquals(first.caffeineBaseline().hits(), second.caffeineBaseline().hits());
        assertEquals(first.caffeineBaseline().misses(), second.caffeineBaseline().misses());
        assertEquals(first.caffeineBaseline().evictions(), second.caffeineBaseline().evictions());
        assertEquals(first.comparisons().get(0).reads(), first.caffeineBaseline().reads());
        assertEquals(first.comparisons().get(0).writes(), first.caffeineBaseline().writes());
        assertEquals("Caffeine", first.caffeineBaseline().implementation());
        assertEquals(first.workloadFingerprint(), second.workloadFingerprint());
        assertNotEquals(first.workloadFingerprint(), service.run(
                new BenchmarkRequest(BenchmarkWorkload.ZIPFIAN, 2_000, 32, 64, null, 80, 4813))
                .workloadFingerprint());
        assertEquals(PolicyType.LRU, first.comparisons().get(0).policy());
        assertEquals(PolicyType.LFU, first.comparisons().get(1).policy());
        assertEquals(5, first.configuration().trials());
        assertEquals(5, first.comparisons().get(0).trials().size());
        assertEquals(first.comparisons().get(0).hits(),
                first.comparisons().get(0).trials().get(0).hits());
        assertTrue(first.comparisons().get(0).trials().stream()
                .allMatch(trial -> trial.hits() == first.comparisons().get(0).hits()));
    }

    @Test
    void configuredTrialsReportCorrectMediansAndUseSameWorkload() {
        var result = service.run(new BenchmarkRequest(BenchmarkWorkload.MIXED, 2_500, 20, 1,
                1L, 65, 17, 4));
        var lru = result.comparisons().get(0);
        var lfu = result.comparisons().get(1);

        assertEquals(4, result.configuration().trials());
        assertEquals(4, lru.trials().size());
        assertEquals(4, lfu.trials().size());
        assertEquals(lru.operations(), lfu.operations());
        assertEquals(lru.reads(), lfu.reads());
        assertEquals(lru.writes(), lfu.writes());
        assertEquals(lru.operations(), result.caffeineBaseline().operations());
        assertEquals(lru.reads(), result.caffeineBaseline().reads());
        assertEquals(lru.writes(), result.caffeineBaseline().writes());
        var repeatedTtlRun = service.run(new BenchmarkRequest(BenchmarkWorkload.MIXED, 2_500, 20, 1,
                1L, 65, 17, 4));
        assertEquals(result.caffeineBaseline().hits(), repeatedTtlRun.caffeineBaseline().hits());
        assertEquals(result.caffeineBaseline().misses(), repeatedTtlRun.caffeineBaseline().misses());
        assertEquals(2_500, lru.reads() + lru.writes());
        assertEquals(lru.reads(), lru.hits() + lru.misses());
        assertTrue(lru.operationsPerSecond() > 0);
        assertTrue(lru.durationNanos() > 0);
        assertTrue(lru.p50LatencyNanos() > 0);
        assertTrue(lru.p95LatencyNanos() >= lru.p50LatencyNanos());
        assertTrue(lru.p99LatencyNanos() >= lru.p95LatencyNanos());
        assertEquals(medianDouble(lru.trials().stream()
                .map(trial -> trial.operationsPerSecond()).toList()), lru.operationsPerSecond(), 0.0001);
        assertEquals(medianDouble(lru.trials().stream()
                .map(trial -> (double) trial.p95LatencyNanos()).toList()), (double) lru.p95LatencyNanos(), 0.0);
        assertEquals(lru.durationNanos(), median(lru.trials().stream()
                .map(trial -> trial.durationNanos()).toList()));
        assertEquals(lru.p95LatencyNanos(), median(lru.trials().stream()
                .map(trial -> trial.p95LatencyNanos()).toList()));
        assertTrue(lru.minOperationsPerSecond() <= lru.operationsPerSecond());
        assertTrue(lru.maxOperationsPerSecond() >= lru.operationsPerSecond());
        assertTrue(lru.minP95LatencyNanos() <= lru.p95LatencyNanos());
        assertTrue(lru.maxP95LatencyNanos() >= lru.p95LatencyNanos());
        assertEquals(lru.hits(), lru.trials().get(0).hits());
        assertTrue(lru.trials().stream().allMatch(trial ->
                trial.hits() == lru.hits() && trial.misses() == lru.misses()));
        assertNotNull(result.recommendation());
        assertTrue(result.workloadGenerationNanos() > 0);
    }

    @Test
    void rejectsOutOfRangeBenchmarkConfigurations() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.run(new BenchmarkRequest(BenchmarkWorkload.UNIFORM, 100_001, 10, 10, null, 50, 1)));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.run(new BenchmarkRequest(BenchmarkWorkload.UNIFORM, 100, 10, 10, null, 101, 1)));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.run(new BenchmarkRequest(BenchmarkWorkload.READ_HEAVY, 100, 10, 10, null, 89, 1)));
        assertThrows(IllegalArgumentException.class,
                () -> service.run(new BenchmarkRequest(BenchmarkWorkload.UNIFORM, 100, 10, 10, null, 50, 1, 21)));
    }

    @Test
    void supportsEveryWorkloadWithSmallKeySpaces() {
        for (BenchmarkWorkload type : BenchmarkWorkload.values()) {
            int readPercentage = type == BenchmarkWorkload.READ_HEAVY ? 90 : 50;
            var result = service.run(new BenchmarkRequest(type, 500, 8, 1, null, readPercentage, 9));
            assertEquals(500, result.comparisons().get(0).operations());
            assertEquals(64, result.workloadFingerprint().length());
            assertTrue(result.comparisons().get(0).reads() >= 0);
        }
    }

    @Test
    void caffeineSeparatesCapacityEvictionsFromReplacementRemovals() {
        var capacityRun = service.run(new BenchmarkRequest(
                BenchmarkWorkload.SEQUENTIAL_SCAN, 20, 1, 2, null, 0, 7, 1));
        var capacity = capacityRun.caffeineBaseline();
        assertTrue(capacity.evictions() > 0);
        assertEquals(0, capacity.expirationRemovals());
        assertEquals(0, capacity.hits() + capacity.misses());

        var replacementRun = service.run(new BenchmarkRequest(
                BenchmarkWorkload.UNIFORM, 20, 1, 1, null, 0, 7, 1));
        var replacements = replacementRun.caffeineBaseline();
        assertEquals(0, replacements.evictions());
        assertTrue(replacements.otherRemovals() > 0);
    }

    @Test
    void caffeineReportsVirtualTtlRemovalsAndReadMetricInvariants() {
        var result = service.run(new BenchmarkRequest(
                BenchmarkWorkload.SEQUENTIAL_SCAN, 3_000, 1_200, 1_200, 1L, 80, 91, 1));
        var caffeine = result.caffeineBaseline();

        assertTrue(caffeine.expirationRemovals() > 0);
        assertEquals(0, caffeine.evictions());
        assertEquals(caffeine.reads(), caffeine.hits() + caffeine.misses());
        assertEquals(caffeine.reads() == 0 ? 0 : (double) caffeine.hits() / caffeine.reads(), caffeine.hitRate());
    }

    private long median(java.util.List<Long> values) {
            long[] sorted = values.stream().mapToLong(Long::longValue).sorted().toArray();
            int middle = sorted.length / 2;
            return sorted.length % 2 == 1
                    ? sorted[middle]
                    : Math.round(sorted[middle - 1] / 2.0 + sorted[middle] / 2.0);
    }

    private double medianDouble(java.util.List<Double> values) {
            double[] sorted = values.stream().mapToDouble(Double::doubleValue).sorted().toArray();
            int middle = sorted.length / 2;
            return sorted.length % 2 == 1
                    ? sorted[middle]
                    : (sorted[middle - 1] + sorted[middle]) / 2;
    }
}
