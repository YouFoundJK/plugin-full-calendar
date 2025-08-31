export type TasksPluginProviderConfig = {
  id: string; // The settings-level ID, e.g., "tasks_1"
  name: string; // Display name for the tasks calendar
};

export type ParsedDatedTask = {
  title: string;
  completed: boolean | string; // false for unchecked, string timestamp for completed
  dueDate: string; // ISO date string
  startDate?: string; // Optional start date
  scheduledDate?: string; // Optional scheduled date
  filePath: string;
  lineNumber: number;
  originalLine: string;
};

export type ParsedUndatedTask = {
  title: string;
  completed: boolean | string;
  filePath: string;
  lineNumber: number;
  originalLine: string;
};

export type TaskParseResult = 
  | { type: 'dated'; task: ParsedDatedTask }
  | { type: 'undated'; task: ParsedUndatedTask }
  | { type: 'none' };