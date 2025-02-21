import { CognitiveWeight, KnowledgeNode } from "./types";
import { daysBetween } from "./utils";
import type DeepSeekPlugin from "./main";

export class CognitiveEngine {
  static plugin: DeepSeekPlugin;

  static initialize(plugin: DeepSeekPlugin) {
    CognitiveEngine.plugin = plugin;
  }

  static updateWeight(node: KnowledgeNode): KnowledgeNode {
    const timeDecay = node.weight.base * Math.exp(
      -this.plugin.settings.decayRate *
      this.getDaysSinceLastUpdate(node)
    );
    const interactionBoost = 0.2 * Math.log(1 + node.weight.interactions);
    const newBase = Math.min(1, timeDecay + interactionBoost);
    
    return {
      ...node,
      weight: {
        ...node.weight,
        base: newBase,
        lastUpdated: Date.now(),
        interactions: node.weight.interactions + 1
      }
    };
  }

  private static getDaysSinceLastUpdate(node: KnowledgeNode): number {
    return (Date.now() - node.weight.lastUpdated) / (1000 * 3600 * 24);
  }
}