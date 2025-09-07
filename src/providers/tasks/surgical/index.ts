/**
 * @file index.ts
 * @brief Exports for the surgical editing system.
 *
 * @description
 * This file exports all components of the surgical editing system,
 * making them easily importable as a cohesive unit.
 *
 * @license See LICENSE.md
 */

export type { TaskSurgicalEditor } from './TaskSurgicalEditor';
export { BaseSurgicalEditor } from './TaskSurgicalEditor';
export { TaskSurgicalEditorRegistry } from './TaskSurgicalEditorRegistry';
export { CompletionSurgicalEditor } from './CompletionSurgicalEditor';
export { TitleSurgicalEditor } from './TitleSurgicalEditor';
export { DateSurgicalEditor } from './DateSurgicalEditor';