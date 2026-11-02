package com.cachepulse;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.cachepulse.cache.eviction.PolicyType;
import com.cachepulse.service.CacheService;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;

class CacheServiceTest {
    private final CacheService service = new CacheService(4, PolicyType.LRU);

    @Test
    void rejectsInvalidCapacity() {
        assertThrows(IllegalArgumentException.class, () -> service.configure(0, PolicyType.LRU));
        assertThrows(IllegalArgumentException.class,
                () -> service.configure(CacheService.MAX_CAPACITY + 1, PolicyType.LRU));
    }

    @Test
    void rejectsInvalidKeysAndOversizedValues() {
        assertThrows(IllegalArgumentException.class, () -> service.put(" ", "value", null));
        assertThrows(IllegalArgumentException.class,
                () -> service.put("x".repeat(CacheService.MAX_KEY_LENGTH + 1), "value", null));
        assertThrows(IllegalArgumentException.class,
                () -> service.put("key", "x".repeat(CacheService.MAX_VALUE_LENGTH + 1), null));
    }

    @Test
    void reconfigurationWaitsUntilAnActiveCacheLeaseIsReleased() throws Exception {
        var executor = Executors.newSingleThreadExecutor();
        try {
            var lease = service.acquireCacheLease();
            long generation = lease.generation();
            CountDownLatch configureStarted = new CountDownLatch(1);
            var configure = executor.submit(() -> {
                configureStarted.countDown();
                service.configure(8, PolicyType.LFU);
            });

            assertTrue(configureStarted.await(1, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> configure.get(50, TimeUnit.MILLISECONDS));
            assertEquals(4, lease.cache().stats().capacity());
            assertEquals(generation, lease.generation());

            lease.close();
            configure.get(1, TimeUnit.SECONDS);
            assertEquals(8, service.stats().capacity());
            assertEquals(PolicyType.LFU, service.policy());
        } finally {
            executor.shutdownNow();
        }
    }
}
