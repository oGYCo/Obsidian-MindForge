import { Notice } from "obsidian";

export function daysBetween(date1: number, date2: number): number {
  return Math.abs(date1 - date2) / (1000 * 3600 * 24);
}

export function safeJsonParse<T>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch (e) {
    new Notice("JSON 解析失败");
    return null;
  }
}

export function getNodeIdFromFile(filePath: string): string {
  return filePath.replace(/\//g, '_').replace('.md', '');
}