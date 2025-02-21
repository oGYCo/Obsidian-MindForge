import { KnowledgeNode, SemanticLink, RecallTest } from "./types";
import { CognitiveEngine } from "./CognitiveWeights";
import { FeatureMatrix } from "./FeatureMatrix";
import { findSemanticLinks } from "./api";
import { getNodeIdFromFile } from "./utils";
import type DeepSeekPlugin from "./main";

export enum LearningStage {
  NOVICE,
  INTERMEDIATE,
  EXPERT
}

export class StageDetector {
  static determineStage(node: KnowledgeNode): LearningStage {
    const score = this.calculateStageScore(node);
    return score < 0.5 ? LearningStage.NOVICE :
           score < 0.8 ? LearningStage.INTERMEDIATE :
           LearningStage.EXPERT;
  }

  private static calculateStageScore(node: KnowledgeNode): number {
    const complexity = (node.content.length / 500) * 0.7 + (node.links.length / 10) * 0.3;
    const interaction = Math.log(1 + node.weight.interactions);
    return 0.6 * complexity + 0.4 * interaction;
  }
}

export class KnowledgeGraph {
  private nodes = new Map<string, KnowledgeNode>();
  private featureMatrix: FeatureMatrix;

  constructor(private plugin: DeepSeekPlugin) {
    this.featureMatrix = new FeatureMatrix(plugin);
  }

  async addNode(filePath: string, content: string): Promise<void> {
    const id = getNodeIdFromFile(filePath);
    const newNode: KnowledgeNode = {
      id,
      content,
      weight: { base: 0.5, decayRate: 0.05, interactions: 0, lastUpdated: Date.now() },
      links: [],
      nextReviewDate: new Date(),
      x: Math.random() * 1000,
      y: Math.random() * 1000,
      fx: null,
      fy: null
    };

    const updatedNode = CognitiveEngine.updateWeight(newNode);
    const withFeatures = await this.featureMatrix.updateNodeVector(updatedNode);
    
    this.nodes.set(id, withFeatures);
    await this.findLinksForNode(id);
  }

  public async findLinksForNode(sourceId: string): Promise<void> {
    const source = this.nodes.get(sourceId);
    if (!source) return;

    const candidates = Array.from(this.nodes.values())
      .filter(n => n.id !== sourceId)
      .slice(0, 50); // 限制候选数量

    const links = await findSemanticLinks(
      source.content, 
      candidates.map(n => n.content),
      this.plugin.settings.apiKey
    );
    
    links.forEach((link: SemanticLink) => {
      if (link.confidence > 0.6) {
        source.links.push(link.target);
      }
    });
  }

  getAllNodes(): KnowledgeNode[] {
    return Array.from(this.nodes.values());
  }

  generateRecallTest(node: KnowledgeNode): RecallTest {
    return {
      question: `请回忆关于 ${node.id} 的内容:`,
      correctAnswer: node.content
    };
  }

  checkAnswer(test: RecallTest, answer: string): boolean {
    return answer.trim().toLowerCase() === test.correctAnswer.toLowerCase();
  }

  private calculateSimilarity(a: KnowledgeNode, b: KnowledgeNode): number {
    // 三维混合相似度
    const semanticSim = this.cosineSimilarity(a.vector!, b.vector!);
    const structuralSim = this.jaccardSimilarity(a.links, b.links);
    const temporalSim = 1 - Math.abs(a.weight.lastUpdated - b.weight.lastUpdated) / (30 * 86400000);
    
    return 0.6 * semanticSim + 0.3 * structuralSim + 0.1 * temporalSim;
  }

  private jaccardSimilarity(a: KnowledgeNode[], b: KnowledgeNode[]): number {
    const aIds = a.map(n => n.id);
    const bIds = b.map(n => n.id);
    const intersection = aIds.filter(x => bIds.includes(x)).length;
    const union = new Set([...aIds, ...bIds]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private calculateReviewInterval(node: KnowledgeNode): number {
    const baseInterval = Math.pow(2, 5 * node.weight.base);
    return Math.min(this.plugin.settings.maxReviewInterval, Math.max(1, baseInterval));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}

export type { KnowledgeNode } from "./types";