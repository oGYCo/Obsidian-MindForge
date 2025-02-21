import { Notice } from "obsidian";
import type DeepSeekPlugin from "./main";
import { SemanticLink } from "./types";

export async function getSemanticVector(text: string, apiKey: string) {
  const response = await fetch("https://api.deepseek.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-large"
    })
  });

  if (!response.ok) throw new Error("API请求失败");
  const data = await response.json();
  return data.data[0].embedding;
}

export async function findSemanticLinks(
  source: string,
  targets: string[],
  apiKey: string
): Promise<SemanticLink[]> {
  const prompt = `分析概念关联：\n源概念：${source}\n候选概念：${targets.join(",")}\n输出JSON数组：[{targetId, relation, confidence}]`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-chat",
      response_format: { type: "json_object" }
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}