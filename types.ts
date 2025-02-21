import type { SimulationNodeDatum } from "d3";

export interface CognitiveWeight {
  base: number;
  decayRate: number;
  interactions: number;
  lastUpdated: number;
  nextReview?: number;
}

export interface KnowledgeNode extends SimulationNodeDatum {
  id: string;
  content: string;
  weight: CognitiveWeight;
  vector?: number[];
  links: KnowledgeNode[];
  nextReviewDate: Date;
  x: number;
  y: number;
  fx: number | null;
  fy: number | null;
}

export interface DeepSeekPluginSettings {
  apiKey: string;
  decayRate: number;
  minSimilarity: number;
  maxReviewInterval: number;
}

export interface RecallTest {
  question: string;
  correctAnswer: string;
}

export interface SemanticLink {
  source: KnowledgeNode;
  target: KnowledgeNode;
  confidence: number;
}