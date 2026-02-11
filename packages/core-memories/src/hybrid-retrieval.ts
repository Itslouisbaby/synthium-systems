/**
 * CoreMemories Hybrid Retrieval - Phase 2
 * Combines vector semantic search with chain traversal (explicit relationships)
 */
import { VectorStore, VectorSearchResult } from "./vector-store.js";
import { ChainLinkageStore, ChainTraversalResult, ChainLinkType } from "./chain-linkage.js";

export interface HybridRetrievalConfig {
  enabled: boolean;
  vectorWeight: number; // 0.0-1.0, default 0.7
  chainWeight: number; // 0.0-1.0, default 0.3
  recencyBoost: boolean; // Apply recency weights
  recencyHalfLifeHours: number; // Half-life for recency decay (default: 24h)
  maxHops: number; // Maximum chain traversal depth (default: 2)
  minLinkStrength: number; // Minimum link strength to include (default: 0.3)
  maxChainCandidates: number; // Maximum candidates from chain traversal
  vectorCandidateMultiplier: number; // How many vector results to fetch before reranking
}

export const DEFAULT_HYBRID_CONFIG: HybridRetrievalConfig = {
  enabled: true,
  vectorWeight: 0.7,
  chainWeight: 0.3,
  recencyBoost: true,
  recencyHalfLifeHours: 24,
  maxHops: 2,
  minLinkStrength: 0.3,
  maxChainCandidates: 50,
  vectorCandidateMultiplier: 3,
};

export interface HybridRetrievalResult {
  id: string;
  sourceId: string;
  vectorScore: number;
  chainScore: number;
  linkStrength: number;
  recencyScore: number;
  hybridScore: number;
  linkType?: ChainLinkType;
  hopDistance?: number;
}

export interface HybridRetrievalMetrics {
  queryStartTime: number;
  queryEndTime?: number;
  vectorCandidatesCount: number;
  chainCandidatesCount: number;
  finalResultsCount: number;
  avgVectorScore: number;
  avgChainScore: number;
  avgLinkStrength: number;
  retrievalRate: number;
}

export class HybridRetrieval {
  private vectorStore: VectorStore;
  private chainStore: ChainLinkageStore;
  private config: HybridRetrievalConfig;

  constructor(memoryDir: string, config: Partial<HybridRetrievalConfig> = {}) {
    this.vectorStore = new VectorStore(memoryDir);
    this.chainStore = new ChainLinkageStore(memoryDir);
    this.config = { ...DEFAULT_HYBRID_CONFIG, ...config };
  }

  calculateRecencyScore(timestamp: number, referenceTime: number, halfLifeHours: number): number {
    if (halfLifeHours <= 0) return 1.0;
    const ageHours = (referenceTime - timestamp) / (1000 * 60 * 60);
    const decay = Math.exp(-Math.LN2 * ageHours / halfLifeHours);
    return Math.max(0, Math.min(1, decay));
  }

  calculateChainScore(linkStrength: number, hopDistance: number): number {
    if (hopDistance <= 0) return linkStrength;
    const hopDecay = Math.pow(0.5, hopDistance - 1);
    return linkStrength * hopDecay;
  }

  calculateHybridScore(params: {
    vectorScore: number;
    linkStrength: number;
    recencyScore: number;
    vectorWeight: number;
    chainWeight: number;
  }): number {
    const baseScore = params.vectorScore;
    const chainBoost = params.linkStrength > 0 
      ? 1.0 + params.chainWeight * params.linkStrength 
      : 1.0;
    return baseScore * chainBoost * params.recencyScore;
  }

  async retrieve(queryVector: number[], seedIds: string[] = [], opts: { maxResults?: number; minScore?: number; weekNumbers?: number[] } = {}): Promise<HybridRetrievalResult[]> {
    const startTime = Date.now();
    const now = Date.now();
    const maxResults = opts.maxResults || 10;
    const minScore = opts.minScore || 0.3;

    // Step 1: Vector search
    const vectorCandidatesLimit = maxResults * this.config.vectorCandidateMultiplier;
    const vectorResults = await this.vectorStore.search(queryVector, vectorCandidatesLimit, opts.weekNumbers);
    
    // Step 2: Chain traversal from seed IDs
    const chainResults: ChainTraversalResult[] = [];
    for (const seedId of seedIds) {
      const related = this.chainStore.traverseChain(seedId, this.config.maxHops, this.config.minLinkStrength);
      chainResults.push(...related);
    }

    // Step 3: Merge candidates
    const merged = new Map<string, HybridRetrievalResult>();
    
    // Add vector results as base
    for (const v of vectorResults) {
      merged.set(v.id, {
        id: v.id,
        sourceId: v.sourceId,
        vectorScore: v.score,
        chainScore: 0,
        linkStrength: 0,
        recencyScore: 1.0,
        hybridScore: v.score,
      });
    }

    // Enrich with chain results
    for (const c of chainResults) {
      const existing = merged.get(c.id);
      const chainScore = this.calculateChainScore(c.linkStrength, c.hopDistance);
      
      if (existing) {
        existing.chainScore = Math.max(existing.chainScore, chainScore);
        existing.linkStrength = Math.max(existing.linkStrength, c.linkStrength);
        existing.linkType = c.linkType;
        existing.hopDistance = c.hopDistance;
      } else {
        merged.set(c.id, {
          id: c.id,
          sourceId: c.id,
          vectorScore: 0,
          chainScore,
          linkStrength: c.linkStrength,
          recencyScore: 1.0,
          hybridScore: chainScore * 0.5, // Chains without vector match have lower base score
          linkType: c.linkType,
          hopDistance: c.hopDistance,
        });
      }
    }

    // Step 4: Calculate final hybrid scores with recency
    const results: HybridRetrievalResult[] = [];
    for (const entry of merged.values()) {
      if (this.config.recencyBoost) {
        entry.recencyScore = this.calculateRecencyScore(now, now, this.config.recencyHalfLifeHours);
      }
      entry.hybridScore = this.calculateHybridScore({
        vectorScore: entry.vectorScore,
        linkStrength: entry.linkStrength,
        recencyScore: entry.recencyScore,
        vectorWeight: this.config.vectorWeight,
        chainWeight: this.config.chainWeight,
      });
      results.push(entry);
    }

    // Step 5: Sort and filter
    const filtered = results
      .filter(r => r.hybridScore >= minScore)
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, maxResults);

    return filtered;
  }

  getMetrics(results: HybridRetrievalResult[], startTime: number): HybridRetrievalMetrics {
    const now = Date.now();
    const vectorCount = results.filter(r => r.vectorScore > 0).length;
    const chainCount = results.filter(r => r.chainScore > 0).length;
    
    return {
      queryStartTime: startTime,
      queryEndTime: now,
      vectorCandidatesCount: vectorCount,
      chainCandidatesCount: chainCount,
      finalResultsCount: results.length,
      avgVectorScore: results.length > 0 ? results.reduce((s, r) => s + r.vectorScore, 0) / results.length : 0,
      avgChainScore: results.length > 0 ? results.reduce((s, r) => s + r.chainScore, 0) / results.length : 0,
      avgLinkStrength: results.length > 0 ? results.reduce((s, r) => s + r.linkStrength, 0) / results.length : 0,
      retrievalRate: results.length / ((now - startTime) / 1000),
    };
  }
}
