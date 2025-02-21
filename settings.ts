import { PluginSettingTab, App, Setting } from "obsidian";
import type DeepSeekPlugin from "./main";

export class DeepSeekSettingTab extends PluginSettingTab {
  plugin: DeepSeekPlugin;

  constructor(app: App, plugin: DeepSeekPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("DeepSeek API Key")
      .setDesc("从DeepSeek控制台获取的API密钥")
      .addText(text => text
        .setPlaceholder("输入API密钥")
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        }));

    // 认知衰减率设置
    new Setting(containerEl)
      .setName("认知衰减率")
      .setDesc("每日知识权重自然衰减率 (默认0.05)")
      .addSlider(slider => slider
        .setLimits(0.01, 0.2, 0.01)
        .setValue(this.plugin.settings.decayRate)
        .onChange(async (value) => {
          this.plugin.settings.decayRate = Number(value.toFixed(2));
          await this.plugin.saveSettings();
        })
        .setDynamicTooltip()
      );

    // 关联相似度阈值
    new Setting(containerEl)
      .setName("最小关联相似度")
      .setDesc("自动建立链接的最小置信度 (0-1)")
      .addSlider(slider => slider
        .setLimits(0.1, 0.9, 0.05)
        .setValue(this.plugin.settings.minSimilarity)
        .onChange(async (value) => {
          this.plugin.settings.minSimilarity = Number(value.toFixed(2));
          await this.plugin.saveSettings();
        })
        .setDynamicTooltip()
      );

    // 最大复习间隔
    new Setting(containerEl)
      .setName("最大复习间隔")
      .setDesc("记忆强化的最大间隔天数")
      .addText(text => text
        .setPlaceholder("30")
        .setValue(this.plugin.settings.maxReviewInterval.toString())
        .onChange(async (value) => {
          this.plugin.settings.maxReviewInterval = Math.max(1, Number(value));
          await this.plugin.saveSettings();
        })
      );
  }
}