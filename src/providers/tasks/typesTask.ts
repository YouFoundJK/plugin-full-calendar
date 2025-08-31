/**
 * @file typesTask.ts
 * @brief Type definitions for Tasks plugin provider
 * 
 * @description
 * Defines the configuration types and parsed task result types for the
 * Tasks plugin integration provider.
 * 
 * @license See LICENSE.md
 */

export interface TasksPluginProviderConfig {
  id: string;
  type: 'tasks';
  displayName: string;
}

export interface ParsedDatedTask {
  content: string;
  date: string;
  time?: string;
  completed?: boolean | string;
  filePath: string;
  lineNumber: number;
}

export interface ParsedUndatedTask {
  content: string;
  completed?: boolean | string;
  filePath: string;
  lineNumber: number;
}

export type ParsedTaskResult =
  | { type: 'dated'; task: ParsedDatedTask }
  | { type: 'undated'; task: ParsedUndatedTask }
  | { type: 'none' };