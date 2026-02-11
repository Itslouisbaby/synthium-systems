/**
 * CoreMemories Chain Linkage - Phase 2
 * Explicit relationship graph for memory traversal
 */
import fs from "node:fs";
import path from "node:path";

export type ChainLinkType = 
  | "related"      // General related content
  | "parent"       // Parent-child relationship
  | "child"        // Child-parent relationship  
  | "sequential"   // Temporal sequence
  | "causal"       // Cause-effect relationship
  | "reference";   // Explicit reference

export interface MemoryChainLink {
  fromId: string;
  toId: string;
  linkType: ChainLinkType;
  strength: number; // 0.0 - 1.0
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ChainTraversalResult {
  id: string;
  path: string;
  linkType: ChainLinkType;
  linkStrength: number;
  hopDistance: number;
  discoveredAt: number;
}

export class ChainLinkageStore {
  private memoryDir: string;
  private indexPath: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
    this.indexPath = path.join(memoryDir, "chain-index.json");
  }

  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private loadIndex(): Map<string, MemoryChainLink[]> {
    if (!fs.existsSync(this.indexPath)) {
      return new Map();
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.indexPath, "utf-8"));
      const index = new Map<string, MemoryChainLink[]>();
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          index.set(key, value);
        }
      }
      return index;
    } catch {
      return new Map();
    }
  }

  private saveIndex(index: Map<string, MemoryChainLink[]>) {
    this.ensureDir(path.dirname(this.indexPath));
    const obj: Record<string, MemoryChainLink[]> = {};
    for (const [key, value] of index) {
      obj[key] = value;
    }
    fs.writeFileSync(this.indexPath, JSON.stringify(obj, null, 2));
  }

  addLink(fromId: string, toId: string, linkType: ChainLinkType, strength = 0.5, metadata?: Record<string, unknown>) {
    const index = this.loadIndex();
    
    const forwardLink: MemoryChainLink = {
      fromId,
      toId,
      linkType,
      strength,
      createdAt: Date.now(),
      metadata,
    };
    
    const existing = index.get(fromId) || [];
    if (!existing.find(l => l.toId === toId)) {
      existing.push(forwardLink);
      index.set(fromId, existing);
    }
    
    // Add reverse link
    const reverseType = this.getReverseType(linkType);
    const reverseLink: MemoryChainLink = {
      fromId: toId,
      toId: fromId,
      linkType: reverseType,
      strength,
      createdAt: Date.now(),
      metadata,
    };
    const reverseExisting = index.get(toId) || [];
    if (!reverseExisting.find(l => l.toId === fromId)) {
      reverseExisting.push(reverseLink);
      index.set(toId, reverseExisting);
    }
    
    this.saveIndex(index);
  }

  private getReverseType(linkType: ChainLinkType): ChainLinkType {
    switch (linkType) {
      case "parent": return "child";
      case "child": return "parent";
      default: return linkType;
    }
  }

  traverseChain(startId: string, maxHops = 3, minStrength = 0.3): ChainTraversalResult[] {
    const index = this.loadIndex();
    const results: ChainTraversalResult[] = [];
    const visited = new Set<string>();
    const queue: { id: string; hops: number; path: string }[] = [{ id: startId, hops: 0, path: startId }];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      
      if (current.hops >= maxHops) continue;
      
      const links = index.get(current.id) || [];
      for (const link of links) {
        if (link.strength < minStrength) continue;
        if (visited.has(link.toId)) continue;
        
        results.push({
          id: link.toId,
          path: `${current.path} -> ${link.toId}`,
          linkType: link.linkType,
          linkStrength: link.strength,
          hopDistance: current.hops + 1,
          discoveredAt: link.createdAt,
        });
        
        queue.push({
          id: link.toId,
          hops: current.hops + 1,
          path: `${current.path} -> ${link.toId}`,
        });
      }
    }
    
    return results;
  }

  findRelated(entryId: string, opts: { maxHops?: number; minStrength?: number; linkTypes?: ChainLinkType[] } = {}): ChainTraversalResult[] {
    const { maxHops = 2, minStrength = 0.3, linkTypes } = opts;
    const results = this.traverseChain(entryId, maxHops, minStrength);
    if (linkTypes && linkTypes.length > 0) {
      return results.filter(r => linkTypes.includes(r.linkType));
    }
    return results;
  }

  getLinks(entryId: string): MemoryChainLink[] {
    const index = this.loadIndex();
    return index.get(entryId) || [];
  }

  removeLink(fromId: string, toId: string) {
    const index = this.loadIndex();
    const links = index.get(fromId) || [];
    const filtered = links.filter(l => l.toId !== toId);
    if (filtered.length < links.length) {
      index.set(fromId, filtered);
      this.saveIndex(index);
    }
  }
}
