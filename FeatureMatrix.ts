import { Notice } from "obsidian";
import { KnowledgeNode } from "./types";
import { getSemanticVector } from "./api";
import type DeepSeekPlugin from "./main";

const SEMANTIC_DIMENSIONS = 1536; // 更新为实际API返回维度

export class FeatureMatrix {
  constructor(private plugin: DeepSeekPlugin) {}

  private cache = new Map<string, number[]>();

  async updateNodeVector(node: KnowledgeNode): Promise<KnowledgeNode> {
    const semanticVector = await this.getSemanticVector(node.content);
    const contextFactors = this.getContextFactors(node);
    
    return {
      ...node,
      vector: [
        ...semanticVector,
        node.weight.base,
        ...contextFactors,
        this.calculateComplexity(node) // 新增复杂度因子
      ]
    };
  }

  private calculateComplexity(node: KnowledgeNode): number {
    return (node.content.length / 500) * 0.7 + (node.links.length / 10) * 0.3;
  }

  private getContextFactors(node: KnowledgeNode): number[] {
    const linkFactor = Math.min(1, node.links.length / 10); // 现在links是对象数组
    const contentFactor = Math.min(1, Math.log2(node.content.length) / 10); // 内容长度因子
    
    // 时间相关因子
    const now = Date.now();
    const ageFactor = Math.min(1, (now - node.weight.lastUpdated) / (1000 * 3600 * 24 * 30)); // 节点年龄因子
    
    // 交互相关因子
    const interactionFactor = Math.min(1, node.weight.interactions / 100); // 交互次数因子
    
    return [
      linkFactor,
      contentFactor,
      ageFactor,
      interactionFactor
    ];
  }

  private async getSemanticVector(text: string): Promise<number[]> {
    return getSemanticVector(text, this.plugin.settings.apiKey);
  }
}