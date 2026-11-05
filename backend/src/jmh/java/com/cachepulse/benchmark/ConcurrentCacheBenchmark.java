package com.cachepulse.benchmark;

import com.cachepulse.cache.CacheEngine;
import com.cachepulse.cache.eviction.PolicyType;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.openjdk.jmh.annotations.Benchmark;
import org.openjdk.jmh.annotations.BenchmarkMode;
import org.openjdk.jmh.annotations.Fork;
import org.openjdk.jmh.annotations.Group;
import org.openjdk.jmh.annotations.GroupThreads;
import org.openjdk.jmh.annotations.Level;
import org.openjdk.jmh.annotations.Measurement;
import org.openjdk.jmh.annotations.Mode;
import org.openjdk.jmh.annotations.OutputTimeUnit;
import org.openjdk.jmh.annotations.Param;
import org.openjdk.jmh.annotations.Scope;
import org.openjdk.jmh.annotations.Setup;
import org.openjdk.jmh.annotations.State;
import org.openjdk.jmh.annotations.Warmup;

/**
 * Schedule-sensitive shared-cache contention workload. The writer inserts unique keys while readers
 * probe key 0, so read hit/miss outcomes may depend on scheduling and policy state.
 */
@State(Scope.Group)
@BenchmarkMode({Mode.Throughput, Mode.SampleTime})
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 8, time = 1)
@Fork(3)
public class ConcurrentCacheBenchmark {
    @Param({"LRU", "LFU", "CAFFEINE"}) public String implementation;
    @Param({"128", "4096"}) public int capacity;
    private CacheEngine<Integer, Integer> custom;
    private com.github.benmanes.caffeine.cache.Cache<Integer, Integer> caffeine;
    private AtomicInteger next = new AtomicInteger();

    @Setup(Level.Iteration)
    public void setup() {
        custom = implementation.equals("CAFFEINE") ? null
                : new CacheEngine<>(capacity, PolicyType.valueOf(implementation));
        caffeine = implementation.equals("CAFFEINE") ? Caffeine.newBuilder().maximumSize(capacity).build() : null;
        for (int key = 0; key < capacity; key++) put(key, key);
        next.set(0);
    }

    @Benchmark @Group("scheduleSensitiveMixedCache") @GroupThreads(3)
    public Integer scheduleSensitiveRead() {
        return custom != null ? custom.get(0).orElse(null) : caffeine.getIfPresent(0);
    }

    @Benchmark @Group("scheduleSensitiveMixedCache") @GroupThreads(1)
    public void uniqueWrite() {
        int key = capacity + next.getAndIncrement();
        put(key, key);
    }

    private void put(int key, int value) {
        if (custom != null) custom.put(key, value);
        else caffeine.put(key, value);
    }
}
