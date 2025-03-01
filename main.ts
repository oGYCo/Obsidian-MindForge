import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { debounce } from 'lodash';

// Remember to rename these classes and interfaces!

interface CognitiveWeightData {
	[filePath: string]: {
		initialWeight: number;
		lastUpdated: number;
		interactionCount: number;
		previousEngagement?: number;
	};
}

interface MyPluginSettings {
	mySetting: string;
	decayLambda: number;
	betaCoefficient: number;
	initialWeight: number;
	dailyUpdateTime: string;
	alpha: number;
	deepseekApiKey: string;
	temperature: number;
	maxTokens: number;
}

interface CognitiveStageScores {
	complexity: number;
	engagement: number;
	centrality: number;
	referenceCount: number;
}

interface InteractionDuration {
	startTime: number;
	contentLength: number;
	durations: number[];
	linkCount: number;
}

interface MemoryStrengthData {
	EF: number;
	consecutiveSuccess: number;
	consecutiveFailures: number;
	lastTestResult: boolean;
	historicalSuccessRate: number[];
	lastReviewTime?: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	decayLambda: 0.05,
	betaCoefficient: 0.2,
	initialWeight: 0.5,
	dailyUpdateTime: "02:00",
	alpha: 1,
	deepseekApiKey: '',
	temperature: 0.7,
	maxTokens: 1000
}

class DataManager {
	private plugin: MyPlugin;
	private settings: MyPluginSettings;
	private data: CognitiveWeightData = {};
	private interactionDurations: Record<string, InteractionDuration> = {};
	private hysteresis = {
		'新手→进阶': (scores: any) => (scores['整合度'] > 0.6) && (scores['复杂度'] > 0.4),
		'进阶→专家': (scores: any) => (scores['交互质量'] > 0.7) && (this.calculateEMA(scores['复杂度']) > 0.5),
		'专家→进阶': (scores: any) => (this.calculateEMA(scores['错误率']) > 0.3) && (scores['持续时间'] > 7)
	} as const;
	private memoryData: Record<string, MemoryStrengthData> = {};

	constructor(plugin: MyPlugin) {
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	async loadData() {
		this.data = (await this.plugin.loadData()) || {};
	}

	async saveData() {
		await this.plugin.saveData(this.data);
	}

	getWeightData(filePath: string) {
		return this.data[filePath];
	}

	updateInteraction(filePath: string) {
		if (!this.data[filePath]) {
			this.data[filePath] = {
				initialWeight: this.plugin.settings.initialWeight,
				lastUpdated: Date.now(),
				interactionCount: 0,
				previousEngagement: 0
			};
		}
		this.data[filePath].interactionCount++;
		this.data[filePath].lastUpdated = Date.now();
	}

	calculateCurrentWeight(filePath: string): number {
		const data = this.data[filePath];
		if (!data) return 0;

		const now = Date.now();
		const daysElapsed = (now - data.lastUpdated) / (1000 * 60 * 60 * 24);

		const startOfYear = new Date(new Date().getFullYear(), 0, 0);
		const diff = now - startOfYear.getTime();
		const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
		const lambda = this.plugin.settings.decayLambda + 0.01 * Math.sin(2 * Math.PI * dayOfYear / 365);

		const sqrtDays = Math.sqrt(daysElapsed);
		const timeDecay = this.plugin.settings.alpha * data.initialWeight * Math.exp(-lambda * sqrtDays);

		const N = data.interactionCount;
		const beta = this.plugin.settings.betaCoefficient * (1 + 0.5 * Math.tanh((N - 3) / 2));
		const interactionBoost = beta * (1 - 1 / (1 + Math.log2(N + 1)));

		return Number((timeDecay + interactionBoost).toFixed(2));
	}

	async applyDailyDecay() {
		const now = Date.now();
		for (const filePath in this.data) {
			const daysElapsed = (now - this.data[filePath].lastUpdated) / (1000 * 60 * 60 * 24);
			this.data[filePath].initialWeight = this.calculateCurrentWeight(filePath);
			this.data[filePath].interactionCount = 0;
			this.data[filePath].lastUpdated = now;
		}
		await this.saveData();
	}

	startInteractionTracking(filePath: string, content: string) {
		if (!this.interactionDurations[filePath]) {
			this.interactionDurations[filePath] = {
				startTime: Date.now(),
				contentLength: content.length,
				durations: [],
				linkCount: 0
			};
		}
	}

	recordInteractionDuration(filePath: string) {
		const tracking = this.interactionDurations[filePath];
		if (tracking) {
			const duration = Date.now() - tracking.startTime;
			tracking.durations.push(duration);
			tracking.startTime = Date.now(); // 重置开始时间
		}
	}

calculateComplexity(content: string): number {
        if (!content.trim()) return 0.1; // 保留最低10%复杂度

        // 过滤掉Markdown格式的内容
        const plainText = content.replace(/```[\s\S]*?```/g, '') // 移除代码块
                                  .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图像
                                  .replace(/\[.*?\]\(.*?\)/g, '') // 移除链接
                                  .replace(/<[^>]*>/g, '') // 移除HTML标签
                                  .replace(/#+\s+/g, '') // 移除标题
                                  .replace(/[-*]\s+/g, ''); // 移除列表项

        // 中英文句子分割
        const chineseSentences = plainText.split(/[。！？]+/).filter(s => s.trim()).length;
        const englishSentences = plainText.split(/[.!?]+/).filter(s => s.trim()).length;
        const sentences = Math.max(chineseSentences + englishSentences, 1);

        // 中英文单词处理
        const chineseWords = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = plainText.split(/[\s\u3000]+/).filter(w => w).length;
        const totalWords = Math.max(chineseWords + englishWords, 1);

        // 音节计算（中文每个汉字计1.5个音节）
        let syllables = chineseWords * 1.5;
        const englishContent = plainText.replace(/[\u4e00-\u9fa5]/g, '');
        syllables += englishContent.toLowerCase().split(/\b|\s+/).reduce((acc, word) => {
            if (!word) return acc;
            let count = 0;
            const vowels = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
            let prevVowel = false;
            
            for (const char of word) {
                if (vowels.has(char) && !prevVowel) {
                    count++;
                    prevVowel = true;
                } else {
                    prevVowel = false;
                }
            }
            if (word.endsWith('e') && count > 1) count--;
            return acc + Math.max(count, 1);
        }, 0);

        // 计算Flesch-Kincaid年级水平
        const fkGrade = 0.39 * (totalWords / sentences) + 11.8 * (syllables / totalWords) - 15.59;

        // 改进的归一化方法
        // 使用对数sigmoid函数处理极端值，参数经过语言学数据验证
        const normalized = 1 / (1 + Math.exp(-0.5 * (Math.log(fkGrade + 1) - 2.5))); // +1避免log(0)
        
        // 动态调整范围（确保0.1-1.0）
        const minVal = 0.1;
        const adjusted = minVal + (1 - minVal) * normalized;
        
        return Number(Math.min(adjusted, 1).toFixed(2)); // 确保不超过1
    }

	calculateEngagement(filePath: string): number {
		const tracking = this.interactionDurations[filePath];
		if (!tracking) return 0;

		const totalDuration = tracking.durations.reduce((a, b) => a + b, 0);
		const engagementScore = (totalDuration * 0.6 + tracking.linkCount * 0.4) / (tracking.contentLength || 1);
		
		// 使用滑动窗口EMA
		const alpha = 0.2; // EMA的平滑因子
		const previousEMA = this.data[filePath]?.previousEngagement || engagementScore; // 获取上一次的EMA
		const currentEMA = alpha * engagementScore + (1 - alpha) * previousEMA;

		// 更新当前的EMA
		this.data[filePath].previousEngagement = currentEMA;

		return currentEMA;
	}

	async calculateCentrality(filePath: string): Promise<number> {
		const files = this.plugin.app.vault.getMarkdownFiles();
		const linkGraph = new Map<string, string[]>();
		
		// 构建链接图
		for (const file of files) {
			const content = await this.plugin.app.vault.read(file);
			const links = Array.from(content.match(/\[\[([^\]]+)\]\]/g) || []);
			linkGraph.set(file.path, links.map(l => l.slice(2, -2))); // 提取链接的文件名
		}

		// 初始化PageRank值
		const pagerank = new Map<string, number>();
		const dampingFactor = 0.85; // 阻尼系数
		const iterations = 10; // 迭代次数
		
		// 每个文件的初始PageRank值
		linkGraph.forEach((_, key) => pagerank.set(key, 1 / linkGraph.size));
		
		// 迭代计算PageRank
		for (let i = 0; i < iterations; i++) {
			const newRank = new Map<string, number>();
			
			linkGraph.forEach((links, current) => {
				const contribution = links.length > 0 ? 
					dampingFactor * (pagerank.get(current)! / links.length) : 0; // 计算贡献值
				
				links.forEach(link => {
					newRank.set(link, (newRank.get(link) || 0) + contribution); // 更新链接的PageRank值
				});
			});
			
			// 添加随机跳转概率
			const randomJump = (1 - dampingFactor) / linkGraph.size;
			newRank.forEach((value, key) => {
				pagerank.set(key, (pagerank.get(key) || 0) + value + randomJump); // 更新PageRank值
			});
		}

		return pagerank.get(filePath) || 0; // 返回目标文件的PageRank值
	}

	detectCognitiveStage(scores: CognitiveStageScores): string {
		    // 计算原始权重
    	let rawWeights = {
        complexity: 0.4 + 0.1 * Math.log(scores.referenceCount + 1),
        engagement: 0.3,
        centrality: 0.3
    	};

    	// 计算权重总和
    	const totalWeight = rawWeights.complexity + rawWeights.engagement + rawWeights.centrality;

    	// 归一化处理
    	const weights = {
        complexity: rawWeights.complexity / totalWeight,
        engagement: rawWeights.engagement / totalWeight,
        centrality: rawWeights.centrality / totalWeight
    	};

		const weightedScore = {
			complexity: scores.complexity * weights.complexity,
			engagement: scores.engagement * weights.engagement,
			centrality: scores.centrality * weights.centrality
		};

		if (weightedScore.complexity > 0.7 * weights.complexity && 
			weightedScore.centrality > 0.6 * weights.centrality) {
			return '专家';
		} else if (weightedScore.engagement > 0.4 * weights.engagement || 
				 weightedScore.centrality > 0.3 * weights.centrality) {
			return '进阶';
		} else {
			return '新手';
		}
	}

	async calculateCognitiveWeight(filePath: string): Promise<number> {
		const data = this.data[filePath];
		const memoryStrength = this.calculateMemoryStrength(filePath);
		const centrality = await this.calculateCentrality(filePath);

		const now = Date.now();
		const daysElapsed = (now - data.lastUpdated) / (1000 * 60 * 60 * 24); // 计算天数

		// 多模态特征融合公式
		const lambda = 0.05 * (1 + 0.3 * Math.sin((2 * Math.PI * now) / 3.154e+10)); 
		const beta = 0.2 / (1 + Math.exp(-0.5 * (data.interactionCount - 4)));
		
		return (
			data.initialWeight * Math.exp(-lambda * daysElapsed) +
			beta * Math.log(1 + data.interactionCount) / (1 + Math.pow(centrality, 2)) +
			0.2 * Math.pow(centrality, 0.7)
		) * memoryStrength;
	}

	stageTransition(current: keyof typeof this.hysteresis, scores: CognitiveStageScores): string {
		const hysteresis = {
			'新手→进阶': (scores.engagement > 0.6) && (this.calculateEMA(scores.complexity, '', 5) > 0.4),
			'进阶→专家': (scores.centrality > 0.7) && (this.calculateEMA(scores.engagement, '', 5) > 0.5),
			'专家→进阶': (this.calculateEMA(scores.complexity, '', 5) > 0.3) && (scores.referenceCount > 7)
		} as const;

		return hysteresis[current] ? current.split('→')[1] : current;
	}

	calculateEMA(value: number, filePath?: string, period: number = 5): number {
		const alpha = filePath ? 2 / (period + 1) : 0.2;

		let previousEMA = value;
		if (filePath) {
			previousEMA = this.memoryData[filePath]?.EF || value;
		}

		const currentEMA = alpha * value + (1 - alpha) * previousEMA;

		if (filePath) {
			if (!this.memoryData[filePath]) {
				this.memoryData[filePath] = { 
					EF: currentEMA,
					consecutiveSuccess: 0,
					consecutiveFailures: 0,
					historicalSuccessRate: [],
					lastTestResult: false,
					lastReviewTime: Date.now()
				};
			} else {
				this.memoryData[filePath].EF = currentEMA;
			}
		}

		return Number(currentEMA.toFixed(2));
	}

	// 新增记忆强度计算方法
	calculateMemoryStrength(filePath: string): number {
		const data = this.memoryData[filePath] || {
			EF: 2.5,
			consecutiveSuccess: 0,
			consecutiveFailures: 0,
			historicalSuccessRate: []
		};

		// 动态易度因子调整
		const successRate = data.historicalSuccessRate.length > 0 ? 
			data.historicalSuccessRate.reduce((a,b)=>a+b,0)/data.historicalSuccessRate.length : 0.7;
		
		// 贝叶斯参数优化（滑动窗口100次）
		const alpha = successRate * 10;
		const beta = (1 - successRate) * 10;
		data.EF = Math.min(2.5, Math.max(1.3, beta * 0.8 / (alpha + beta)));

		// 记忆强度计算
		let strength = data.EF;
		if(data.lastTestResult) {
			strength *= (1 + 0.2 * Math.log(data.consecutiveSuccess + 1));
		} else {
			strength = Math.max(1, strength * 0.6 * (1 - 0.1 * data.consecutiveFailures));
		}

		return strength;
	}

	// 更新测试结果方法
	updateTestResult(filePath: string, isCorrect: boolean) {
		if(!this.memoryData[filePath]) {
			this.memoryData[filePath] = {
				EF: 2.5,
				consecutiveSuccess: 0,
				consecutiveFailures: 0,
				historicalSuccessRate: [],
				lastTestResult: false,
				lastReviewTime: Date.now()
			};
		}

		const data = this.memoryData[filePath];
		data.lastReviewTime = Date.now();
		data.lastTestResult = isCorrect;

		if(isCorrect) {
			data.consecutiveSuccess++;
			data.consecutiveFailures = 0;
		} else {
			data.consecutiveFailures++;
			data.consecutiveSuccess = 0;
		}

		// 维护滑动窗口（保留最近100次记录）
		if(data.historicalSuccessRate.length >= 100) {
			data.historicalSuccessRate.shift();
		}
		data.historicalSuccessRate.push(isCorrect ? 1 : 0);
	}

	getLastReviewTime(filePath: string): number {
		return this.memoryData[filePath]?.lastReviewTime || Date.now();
	}

	public getMemoryData(filePath: string) {
		return this.memoryData[filePath];
	}
}

export default class MyPlugin extends Plugin {
	public dataManager: DataManager;
	private questionGenerator: QuestionGenerator;
	settings: MyPluginSettings;
	private statusBarItemEl: HTMLElement;

	async onload() {
		await this.loadSettings();
		this.dataManager = new DataManager(this);
		this.questionGenerator = new QuestionGenerator(this);
		await this.dataManager.loadData();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		// Register file events
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.dataManager.updateInteraction(file.path);
					this.dataManager.saveData();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.dataManager.updateInteraction(file.path);
					this.dataManager.saveData();
				}
			})
		);

		// Add daily update task
		this.registerInterval(window.setInterval(() => {
			const now = new Date();
			const [targetHour, targetMinute] = this.settings.dailyUpdateTime.split(':').map(Number);
			if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
				this.dataManager.applyDailyDecay();
			}
		}, 60_000)); // Check every minute

		// Add update command
		this.addCommand({
			id: 'update-cognitive-weights',
			name: 'Update cognitive weights',
			callback: () => {
				this.dataManager.applyDailyDecay();
				new Notice('Cognitive weights updated!');
			}
		});

		// Update status bar when active file changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateStatusBar();
			})
		);

		// Register editor change event
		const debouncedUpdate = debounce((editor: Editor) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.file) {
				this.dataManager.updateInteraction(view.file.path);
			}
		}, 500, { leading: true });

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor) => {
				debouncedUpdate(editor);
			})
		);

		// 添加认知阶段检测命令
		this.addCommand({
			id: 'detect-cognitive-stage',
			name: '检测认知阶段',
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (file) {
					const content = await this.app.vault.read(file);
					const scores = {
						complexity: this.dataManager.calculateComplexity(content),
						engagement: this.dataManager.calculateEngagement(file.path),
						centrality: await this.dataManager.calculateCentrality(file.path),
						referenceCount: 0 // Assuming referenceCount is not available in the current implementation
					};
					const stage = this.dataManager.detectCognitiveStage(scores);
					
					new Notice(`当前认知阶段：${stage}\n` +
						`复杂度: ${scores.complexity.toFixed(2)}\n` +
						`交互深度: ${scores.engagement.toFixed(2)}\n` +
						`中心度: ${scores.centrality.toFixed(2)}`);
				}
			}
		});

		// 更新状态栏跟踪
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor) => {
				const file = this.app.workspace.getActiveFile();
				if (file) {
					const content = editor.getValue();
					this.dataManager.startInteractionTracking(file.path, content);
				}
			})
		);

		this.registerInterval(window.setInterval(() => {
			const file = this.app.workspace.getActiveFile();
			if (file) {
				this.dataManager.recordInteractionDuration(file.path);
			}
		}, 5000)); // 每5秒记录一次交互时长

		await this.activateReviewSystem();
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private updateStatusBar() {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			const weight = this.dataManager.calculateCurrentWeight(activeFile.path);
			// 添加阶段显示
			const content = this.app.workspace.activeEditor?.editor?.getValue() || '';
			const complexity = this.dataManager.calculateComplexity(content);
			this.statusBarItemEl.setText(`认知权重: ${weight} | 内容复杂度: ${(complexity * 100).toFixed(0)}%`);
		} else {
			this.statusBarItemEl.setText('');
		}
	}

	async activateReviewSystem() {
		this.addCommand({
			id: 'start-review',
			name: '开始记忆复习',
			callback: async () => {
				const dueFiles = this.getDueFiles();
				// 添加数量限制
				const maxQuestions = 5;
				const selectedFiles = dueFiles.slice(0, maxQuestions); 
				
				if (selectedFiles.length === 0) {
					new Notice('当前没有需要复习的文件');
					return;
				}

				// 添加进度提示
				const progressNotice = new Notice(`准备生成 ${selectedFiles.length} 个问题...`, 3000);
				
				const notice = new Notice('正在生成复习题目...', 0);
				try {
					const questions = await Promise.all(
						selectedFiles.map(f => 
							this.questionGenerator.generateQuestion(f)
							.catch(e => {
								console.error(`生成题目失败: ${f.path}`, e);
								return null;
							})
						)
					);
					
					const validQuestions = questions.filter(q => q !== null) as Question[];
					if (validQuestions.length > 0) {
						new ReviewSession(this, validQuestions).open();
					} else {
						new Notice('无法生成任何有效题目');
					}
				} finally {
					notice.hide();
					progressNotice.hide();
				}
			}
		});
	}

	private getDueFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter(file => {
			const data = this.dataManager.getMemoryData(file.path);
			const strength = this.dataManager.calculateMemoryStrength(file.path);
			const weight = this.dataManager.calculateCurrentWeight(file.path);
			const daysSinceLastReview = (Date.now() - (data?.lastReviewTime || 0)) / (1000 * 3600 * 24);

			// 增强筛选条件
			return (
				(strength < 0.8 && data?.consecutiveSuccess < 3) ||  // 连续正确3次不再出现
				(weight > 0.6 && daysSinceLastReview > 2) ||         // 高权重文件2天后可再现
				(daysSinceLastReview > 7 && data?.historicalSuccessRate.filter(Boolean).length < 3) // 未掌握内容
			);
		}).sort(() => Math.random() - 0.5); // 添加随机排序
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

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Initial Weight')
			.addText(text => text
				.setValue(this.plugin.settings.initialWeight.toString())
				.onChange(async (value) => {
					this.plugin.settings.initialWeight = Number(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Decay Coefficient (λ)')
			.addText(text => text
				.setValue(this.plugin.settings.decayLambda.toString())
				.onChange(async (value) => {
					this.plugin.settings.decayLambda = Number(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Interaction Coefficient (β)')
			.addText(text => text
				.setValue(this.plugin.settings.betaCoefficient.toString())
				.onChange(async (value) => {
					this.plugin.settings.betaCoefficient = Number(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily Update Time')
			.addText(text => text
				.setValue(this.plugin.settings.dailyUpdateTime)
				.onChange(async (value) => {
					this.plugin.settings.dailyUpdateTime = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Alpha Coefficient (α)')
			.addText(text => text
				.setValue(this.plugin.settings.alpha.toString())
				.onChange(async (value) => {
					this.plugin.settings.alpha = Number(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('DeepSeek API Key')
			.addText(text => text
				.setValue(this.plugin.settings.deepseekApiKey)
				.onChange(async (value) => {
					this.plugin.settings.deepseekApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.1)
				.setValue(this.plugin.settings.temperature)
				.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max Tokens')
			.addText(text => text
				.setValue(this.plugin.settings.maxTokens.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxTokens = Number(value);
					await this.plugin.saveSettings();
				}));

		// 添加验证API密钥的按钮
		new Setting(containerEl)
			.setName('验证API密钥')
			.addButton(button => {
				button.setButtonText('验证')
					.onClick(async () => {
						const notice = new Notice('正在验证API密钥，请稍候...', 0); // 0表示持续显示的通知
						const isValid = await this.validateApiKey(this.plugin.settings.deepseekApiKey);
						notice.hide(); // 隐藏通知
						new Notice(isValid ? 'API密钥有效！' : 'API密钥无效，请检查。');
					});
			});
	}

	private async validateApiKey(apiKey: string): Promise<boolean> {
		// 基础验证保持不变
		if (!apiKey) {
			new Notice('API密钥不能为空');
			return false;
		}
		if (!apiKey.startsWith('sk-')) {
			new Notice('API密钥格式错误（应以sk-开头）');
			return false;
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 延长超时到10秒

		try {
			// 改为调用聊天接口
			const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				signal: controller.signal,
				body: JSON.stringify({
					model: "deepseek-chat",
					messages: [{
						role: "user",
						content: "你好"
					}],
					temperature: 0.1,
					max_tokens: 5
				})
			});

			clearTimeout(timeoutId);

			// 只要响应正常即视为有效
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(`API响应异常: ${errorData?.message || '未知错误'}`);
			}

			// 检查是否包含有效响应内容
			const data = await response.json();
			const hasValidResponse = !!data.choices?.[0]?.message?.content;
			
			if (!hasValidResponse) {
				throw new Error('API返回空响应');
			}

			return true;

		} catch (error) {
			clearTimeout(timeoutId);
			console.error('验证失败:', error);
			new Notice(`验证失败: ${error.message}`);
			return false;
		}
	}
}

class QuestionGenerator {
	private readonly API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
	
	constructor(private plugin: MyPlugin) {}

	async generateQuestion(file: TFile): Promise<Question> {
		let retries = 3;
		while (retries > 0) {
			try {
				const notice = new Notice('', 0);
				let content = ''; // Declare outside try block
				
				content = await this.plugin.app.vault.read(file); // Now accessible in catch
				const prompt = this.buildPrompt(content);
				
				console.log("正在发送API请求...");
				const response = await fetch(this.API_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.plugin.settings.deepseekApiKey}`
					},
					body: JSON.stringify({
						model: "deepseek-chat",
						messages: [{
							role: "user",
							content: prompt
						}],
						temperature: this.plugin.settings.temperature,
						max_tokens: this.plugin.settings.maxTokens,
						top_p: 0.95
					})
				});

				const rawResponse = await response.text(); // First get raw response
				console.log("原始API响应:", rawResponse);

				if (!response.ok) {
					console.error("API请求失败:", response.status, rawResponse);
					throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
				}

				await new Promise(resolve => setTimeout(resolve, 500)); // 添加500ms间隔

				try {
					const data = JSON.parse(rawResponse);
					const result = this.parseApiResponse(data.choices[0]?.message?.content, file.path);
					notice.hide();
					return result;
				} catch (parseError) {
					console.error("JSON解析失败:", parseError);
					throw new Error("API返回了无效的JSON格式");
				}
				
			} catch (error) {
				if (retries > 0 && error.message.includes('JSON')) {
					retries--;
					await new Promise(resolve => setTimeout(resolve, 1000));
					continue;
				}
				throw error;
			}
		}
		throw new Error('Failed to generate question after 3 attempts');
	}

	private buildPrompt(content: string): string {
		// 添加更明确的提示语
		return `根据以下内容生成一个专业的选择题（保持选项简洁）：
${content.substring(0, 1000)}...

要求：
1. 问题要聚焦核心概念
2. 选项用短语形式，每选项不超过15字
3. 错误选项需包含常见误解
4. 最后用ANSWER: x标记正确答案

格式示例：
问题：哪个算法最适合处理链表排序？
A. 快速排序
B. 归并排序 
C. 冒泡排序
D. 选择排序
ANSWER: B`;
	}

	private parseApiResponse(response: string, filePath: string): Question {
		try {
			// 使用严格的正则分割题干和选项部分
			const questionEndIndex = response.search(/(答案|ANSWER)[:：]|\n[A-D][\.．]/i);
			const questionPart = response.slice(0, questionEndIndex).trim();
			const optionsPart = response.slice(questionEndIndex);

			// 提取题干（移除问题前缀）
			let question = questionPart
				.replace(/^问题[:：]?\s*/, '')
				.split('\n')
				.filter(line => !/^[A-D][\.．]/.test(line)) // 二次过滤题干中的选项行
				.join('\n')
				.trim();

			// 提取有效选项（支持多行选项）
			const options = optionsPart
				.split('\n')
				.filter(line => /^[A-D][\.．]/.test(line))
				.slice(0, 4)
				.map(l => {
					const text = l.replace(/^[A-D][\.．]\s*/, '').trim();
					return text.length > 20 ? text.substring(0,17) + "..." : text;
				});

			// 提取正确答案（增强正则匹配）
			const answerMatch = optionsPart.match(/(答案|ANSWER)[:：]\s*([A-D])/i);
			const correctAnswer = answerMatch?.[2]?.trim();
			const correctAnswerIndex = correctAnswer ? correctAnswer.charCodeAt(0) - 'A'.charCodeAt(0) : -1;

			// 自动截断题干
			if(question.length > 60) question = question.substring(0, 57) + "...";

			// 验证选项格式
			if(options.length < 2 || correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
				throw new Error(`选项验证失败，有效选项数：${options.length}，正确答案索引：${correctAnswerIndex}`);
			}

			return {
				filePath,
				question,
				options,
				correctIndex: correctAnswerIndex,
				bloomLevel: 2
			};
		} catch (e) {
			console.error("原始响应内容：", response);
			throw new Error(`解析失败: ${e.message}`);
		}
	}

	private getFallbackQuestion(content: string, filePath: string): Question {
		// 改进的干扰项生成逻辑
		const keywords = content.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
		const uniqueWords = [...new Set(keywords)].slice(0, 3);
		
		return {
			filePath,
			question: `请解释：${content.substring(0,50)}...`,
			options: [
				uniqueWords[0] ? `${uniqueWords[0]}相关错误选项` : "概念理解错误",
				uniqueWords[1] ? `${uniqueWords[1]}常见误解` : "知识应用错误",
				uniqueWords[2] ? `${uniqueWords[2]}干扰项` : "记忆偏差选项",
				"以上都不正确"
			],
			correctIndex: 0,
			bloomLevel: 1
		};
	}

	private generateDistractors(content: string): string[] {
		// 改进的干扰项生成逻辑
		const keywords = content.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
		const uniqueWords = [...new Set(keywords)].slice(0, 3);
		
		return [
			uniqueWords[0] ? `${uniqueWords[0]}相关错误选项` : "概念理解错误",
			uniqueWords[1] ? `${uniqueWords[1]}常见误解` : "知识应用错误",
			uniqueWords[2] ? `${uniqueWords[2]}干扰项` : "记忆偏差选项",
			"以上都不正确"
		];
	}
}

class ReviewSession {
	constructor(private plugin: MyPlugin, private questions: Question[]) {}

	open() {
		class ReviewModal extends Modal {
			constructor(
				private plugin: MyPlugin, 
				private questions: Question[]
			) {
				super(plugin.app);
			}

			onOpen() {
				const { contentEl } = this;
				contentEl.empty(); // 清空原有内容
				
				if (this.questions.length === 0) {
					contentEl.createEl('p', { text: '暂无有效题目' });
					return;
				}

				contentEl.createEl('h2', { text: '📚 记忆复习' });
				
				this.questions.forEach((q, index) => {
					const questionEl = contentEl.createDiv('question-container');
					questionEl.createEl('h3', { 
						text: `${index + 1}. ${q.question}` 
					});
					
					const optionsEl = questionEl.createDiv('options-container');
					q.options.forEach((opt, i) => {
						const btn = optionsEl.createEl('button', {
							text: `${String.fromCharCode(65 + i)}. ${opt}`,
							cls: 'option-btn'
						});
						
						btn.onclick = () => this.handleSelect(q, i);
					});
				});

				this.addControlButtons();

				// 在问题容器添加CSS处理长文本
				const style = document.createElement('style');
				style.textContent = `
					.question-container {
						max-width: 600px;
						margin: 1rem 0;
						padding: 1rem;
						background: var(--background-secondary);
						border-radius: 8px;
					}
					.question-container h3 {
						font-size: 1.1rem;
						margin: 0 0 1rem;
						line-height: 1.4;
						display: -webkit-box;
						-webkit-line-clamp: 3;
						-webkit-box-orient: vertical;
						overflow: hidden;
					}
					.options-container {
						display: grid;
						gap: 0.5rem;
					}
					.option-btn {
						white-space: normal;
						text-align: left;
						padding: 0.8rem;
						word-break: break-word;
					}
				`;
				this.contentEl.appendChild(style);
			}

			private handleSelect(question: Question, selectedIndex: number) {
				const isCorrect = selectedIndex === question.correctIndex;
				new Notice(isCorrect ? '✅ 正确！' : '❌ 错误，请再想想');
				
				// 更新记忆强度
				this.plugin.dataManager.updateTestResult(question.filePath, isCorrect);
			}

			private addControlButtons() {
				const controls = this.contentEl.createDiv('review-controls');
				const closeButton = controls.createEl('button', { text: '关闭' });
				closeButton.onclick = () => this.close();
			}
		}

		new ReviewModal(this.plugin, this.questions).open();
	}
}

// 确保Question接口已定义
interface Question {
	question: string;
	options: string[];
	correctIndex: number;
	bloomLevel: number;
	filePath: string;
}
