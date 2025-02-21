import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting ,TFile} from 'obsidian';
import { DeepSeekSettingTab } from "./settings";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { DeepSeekPluginSettings, KnowledgeNode, RecallTest } from "./types";
import { CognitiveEngine } from "./CognitiveWeights";
import { KnowledgeGraphView, VIEW_TYPE_KNOWLEDGE_GRAPH } from "./KnowledgeGraphView";
// Remember to rename these classes and interfaces!

const DEFAULT_SETTINGS: DeepSeekPluginSettings = {
	apiKey: "",
	decayRate: 0.05,
	minSimilarity: 0.6,
	maxReviewInterval: 30
}

export default class DeepSeekPlugin extends Plugin {
	settings: DeepSeekPluginSettings;
	knowledgeGraph: KnowledgeGraph;

	async onload() {
		await this.loadSettings();
		this.knowledgeGraph = new KnowledgeGraph(this);
		CognitiveEngine.plugin = this;

		// Register file modification handler
		this.registerEvent(
			this.app.vault.on("modify", (file: TFile) => {
				if (file.path.endsWith(".md")) {
					this.processFile(file);
				}
			})
		);

		// Add main command
		this.addCommand({
			id: "run-review",
			name: "执行记忆强化",
			callback: () => this.runDailyReview()
		});

		// Add new commands
		this.addCommand({
			id: "show-graph",
			name: "显示知识图谱",
			callback: () => this.showKnowledgeGraph()
		});

		this.addCommand({
			id: "update-graph",
			name: "更新知识图谱",
			callback: () => this.forceUpdateGraph()
		});

		this.addCommand({
			id: "open-settings",
			name: "打开插件设置",
			callback: () => this.openSettings()
		});

		// Add settings tab
		this.addSettingTab(new DeepSeekSettingTab(this.app, this));

		this.registerView(
			VIEW_TYPE_KNOWLEDGE_GRAPH,
			(leaf) => new KnowledgeGraphView(leaf, this.knowledgeGraph)
		);
	}

	private async processFile(file: TFile) {
		const content = await this.app.vault.read(file);
		await this.knowledgeGraph.addNode(file.path, content);
	}

	private async runDailyReview() {
		const nodes = this.knowledgeGraph.getAllNodes().filter(n => 
			n.nextReviewDate <= new Date() && 
			n.weight.base < 0.85
		);
		
		for (const node of nodes) {
			const test = await this.knowledgeGraph.generateRecallTest(node);
			const userAnswer = await this.showTestToUser(test);
			
			if (userAnswer.isCorrect) {
				node.weight.base = Math.min(1, node.weight.base + 0.1);
			} else {
				node.weight.base *= 0.9;
			}
			
			node.nextReviewDate = this.addDays(new Date(), 
				this.calculateReviewInterval(node));
		}
	}

	private addDays(date: Date, days: number): Date {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}

	private calculateReviewInterval(node: KnowledgeNode): number {
		// Basic spaced repetition algorithm
		const baseInterval = Math.max(1, Math.round(10 * (1 - node.weight.base)));
		return Math.min(this.settings.maxReviewInterval, baseInterval);
	}

	private async showTestToUser(test: RecallTest): Promise<{ isCorrect: boolean }> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			
			// Set modal title
			modal.titleEl.setText("记忆强化测试");
			
			// Create content container
			const content = modal.contentEl;
			content.createEl("p", { text: test.question });
			
			// Create answer input
			const input = content.createEl("textarea", {
				attr: { placeholder: "输入你的答案..." }
			});
			input.style.width = "100%";
			input.style.minHeight = "100px";
			input.style.marginTop = "1rem";
			
			// Create buttons container
			const buttons = content.createDiv();
			buttons.style.display = "flex";
			buttons.style.justifyContent = "flex-end";
			buttons.style.marginTop = "1rem";
			buttons.style.gap = "0.5rem";
			
			// Add submit button
			const submitButton = buttons.createEl("button", {
				text: "提交",
				cls: "mod-cta"
			});
			
			// Add skip button
			const skipButton = buttons.createEl("button", {
				text: "跳过",
				cls: "mod-warning"
			});
			
			// Handle submit
			submitButton.onclick = () => {
				const isCorrect = this.knowledgeGraph.checkAnswer(test, input.value);
				modal.close();
				resolve({ isCorrect });
			};
			
			// Handle skip
			skipButton.onclick = () => {
				modal.close();
				resolve({ isCorrect: false });
			};
			
			// Show modal
			modal.open();
		});
	}

	private showKnowledgeGraph(): void {
		this.app.workspace.getLeaf(true).setViewState({
			type: "knowledge-graph",
			active: true
		});
	}

	private forceUpdateGraph(): void {
		this.knowledgeGraph.getAllNodes().forEach(node => {
			this.knowledgeGraph.findLinksForNode(node.id);
		});
		new Notice("已更新全部节点关联！");
	}

	private openSettings(): void {
		(this.app as any).setting.open();
		(this.app as any).setting.openTabById('deepseek-settings');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
