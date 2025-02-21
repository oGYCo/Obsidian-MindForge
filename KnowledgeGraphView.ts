import { ItemView, WorkspaceLeaf } from "obsidian";
import { KnowledgeGraph, KnowledgeNode } from "./KnowledgeGraph";
import * as d3 from "d3";
import type { SimulationNodeDatum } from "d3";
import { KnowledgeNode as KnowledgeNodeType } from "./types";  // 确保导入正确类型
import type { SemanticLink } from "./types";

export const VIEW_TYPE_KNOWLEDGE_GRAPH = "knowledge-graph-view";

export class KnowledgeGraphView extends ItemView {
  private graph: KnowledgeGraph;

  constructor(leaf: WorkspaceLeaf, graph: KnowledgeGraph) {
    super(leaf);
    this.graph = graph;
  }

  getViewType(): string {
    return VIEW_TYPE_KNOWLEDGE_GRAPH;
  }

  getDisplayText(): string {
    return "知识图谱";
  }

  async onOpen() {
    console.log("D3 version:", d3.version);
    const container = this.containerEl.children[1];
    container.empty();
    const { width, height } = container.getBoundingClientRect();
    
    // 创建D3力导向图
    const nodes = this.graph.getAllNodes();
    const links = nodes.flatMap(n => 
      n.links.map(target => ({ source: n, target }))
    );

    const simulation = d3.forceSimulation<KnowledgeNode>()
      .force("charge", d3.forceManyBody<KnowledgeNode>().strength(-1000))
      .force("link", d3.forceLink<KnowledgeNode, any>(links)
        .id(d => d.id)
      )
      .force("center", d3.forceCenter(width/2, height/2));

    const svg = d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    
    // 绘制节点和连线
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999");

    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 10)
      .attr("fill", "#69b3a2");

    simulation.nodes(nodes).on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      node
        .attr("cx", d => d.x as number)
        .attr("cy", d => d.y);
    });

    simulation.force<d3.ForceLink<any, any>>("link")?.links(links);
  }
} 