package com.cachepulse;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import com.cachepulse.controller.RequestBodyLimitFilter;

@SpringBootTest
@AutoConfigureMockMvc
class BenchmarkControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsMeasuredBenchmarkAndRecommendation() throws Exception {
        mockMvc.perform(post("/api/benchmarks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"workloadType":"UNIFORM","operations":100,"capacity":10,
                                 "distinctKeys":20,"readPercentage":80,"seed":42}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comparisons.length()").value(2))
                .andExpect(jsonPath("$.comparisons[0].policy").value("LRU"))
                .andExpect(jsonPath("$.comparisons[1].policy").value("LFU"))
                .andExpect(jsonPath("$.caffeineBaseline.implementation").value("Caffeine"))
                .andExpect(jsonPath("$.caffeineBaseline.evictionDescription").value("W-TinyLFU admission and eviction (library-managed)"))
                .andExpect(jsonPath("$.caffeineBaseline.operations").value(100))
                .andExpect(jsonPath("$.caffeineBaseline.hits").isNumber())
                .andExpect(jsonPath("$.caffeineBaseline.evictions").isNumber())
                .andExpect(jsonPath("$.caffeineBaseline.expirationRemovals").isNumber())
                .andExpect(jsonPath("$.caffeineBaseline.otherRemovals").isNumber())
                .andExpect(jsonPath("$.configuration.trials").value(5))
                .andExpect(jsonPath("$.comparisons[0].trials.length()").value(5))
                .andExpect(jsonPath("$.workloadFingerprint").isNotEmpty())
                .andExpect(jsonPath("$.recommendation.assessment").isNotEmpty());
    }

    @Test
    void acceptsAnExplicitTrialCount() throws Exception {
        mockMvc.perform(post("/api/benchmarks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"workloadType":"UNIFORM","operations":100,"capacity":10,
                                 "distinctKeys":20,"readPercentage":80,"seed":42,"trials":3}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configuration.trials").value(3))
                .andExpect(jsonPath("$.comparisons[0].trials.length()").value(3))
                .andExpect(jsonPath("$.comparisons[1].trials.length()").value(3));
    }

    @Test
    void rejectsOutOfRangeBenchmarkBody() throws Exception {
        mockMvc.perform(post("/api/benchmarks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"workloadType":"UNIFORM","operations":100001,"capacity":10,
                                 "distinctKeys":20,"readPercentage":80,"seed":42}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void stressEndpointReportsRunSpecificOutcomesAndThroughput() throws Exception {
        mockMvc.perform(post("/api/cache/stress?threads=2&operations=30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attempted").value(60))
                .andExpect(jsonPath("$.completed").value(60))
                .andExpect(jsonPath("$.reads").isNumber())
                .andExpect(jsonPath("$.writes").isNumber())
                .andExpect(jsonPath("$.hits").isNumber())
                .andExpect(jsonPath("$.misses").isNumber())
                .andExpect(jsonPath("$.operationsPerSecond").isNumber());
    }

    @Test
    void rejectsOversizedRequestBodiesBeforeJsonParsing() throws Exception {
        String oversized = "{\"ignored\":\"" + "x".repeat(RequestBodyLimitFilter.MAX_REQUEST_BODY_BYTES + 1) + "\"}";
        mockMvc.perform(post("/api/benchmarks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(oversized))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }
}
