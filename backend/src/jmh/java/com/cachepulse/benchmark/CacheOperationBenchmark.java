package com.cachepulse.benchmark;

import com.cachepulse.cache.CacheEngine;
import com.cachepulse.cache.eviction.PolicyType;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;
import java.util.SplittableRandom;
import org.openjdk.jmh.annotations.Benchmark;
import org.openjdk.jmh.annotations.BenchmarkMode;
import org.openjdk.jmh.annotations.Level;
import org.openjdk.jmh.annotations.Mode;
import org.openjdk.jmh.annotations.OutputTimeUnit;
import org.openjdk.jmh.annotations.Param;
import org.openjdk.jmh.annotations.Scope;
import org.openjdk.jmh.annotations.Setup;
import org.openjdk.jmh.annotations.State;
import org.openjdk.jmh.annotations.Warmup;
import org.openjdk.jmh.annotations.Measurement;
import org.openjdk.jmh.annotations.Fork;

@State(Scope.Thread)
@BenchmarkMode({Mode.Throughput, Mode.SampleTime})
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 8, time = 1)
@Fork(3)
public class CacheOperationBenchmark {
    @Param({"LRU", "LFU", "CAFFEINE"}) public String implementation;
    @Param({"128", "4096"}) public int capacity;
    @Param({"UNIFORM", "ZIPFIAN"}) public String distribution;

    private CacheEngine<Integer, Integer> custom;
    private Cache<Integer, Integer> caffeine;
    private int cursor;
    private int[] keySequence;

    @Setup(Level.Iteration)
    public void setup() {
        custom = implementation.equals("CAFFEINE") ? null
                : new CacheEngine<>(capacity, PolicyType.valueOf(implementation));
        caffeine = implementation.equals("CAFFEINE")
                ? Caffeine.newBuilder().maximumSize(capacity).build() : null;
        for (int key = 0; key < capacity; key++) put(key, key);
        cursor = 0;
        keySequence = new int[65_536];
        SplittableRandom random = new SplittableRandom(2026);
        double[] cumulative = new double[capacity];
        double total = 0;
        for (int rank = 1; rank <= capacity; rank++) total += 1.0 / rank;
        double sum = 0;
        for (int rank = 1; rank <= capacity; rank++) {
            sum += (1.0 / rank) / total;
            cumulative[rank - 1] = sum;
        }
        for (int index = 0; index < keySequence.length; index++) {
            if (distribution.equals("UNIFORM")) {
                keySequence[index] = random.nextInt(capacity);
            } else {
                double sample = random.nextDouble();
                int rank = 0;
                while (rank < capacity - 1 && cumulative[rank] < sample) rank++;
                keySequence[index] = rank;
            }
        }
    }

    @Benchmark public Integer getHit() { return get(distributedKey()); }
    @Benchmark public Integer getMiss() { return get(capacity + 1_000_000); }
    @Benchmark public void putNew() { int key = capacity + cursor++; put(key, key); }
    @Benchmark public void putExisting() { put(0, cursor++); }
    @Benchmark public Integer getDistributed() { return get(distributedKey()); }

    @Benchmark
    public Object mixedReadWrite() {
        int key = distributedKey();
        if ((cursor++ & 7) == 0) { put(key, cursor); return cursor; }
        return get(key);
    }

    private int distributedKey() {
        return keySequence[cursor++ & (keySequence.length - 1)];
    }

    private Integer get(int key) {
        if (custom != null) return custom.get(key).orElse(null);
        return caffeine.getIfPresent(key);
    }

    private void put(int key, int value) {
        if (custom != null) custom.put(key, value);
        else caffeine.put(key, value);
    }
}
