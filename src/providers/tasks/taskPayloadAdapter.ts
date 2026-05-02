export interface CalendarTask {
  id: string;
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  scheduledDate: Date | null;
  originalMarkdown: string;
  filePath: string;
  lineNumber: number;
  isDone: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface TasksPluginTaskDate {
  toDate(): Date;
}

export interface TasksPluginTask {
  path: string;
  description: string;
  descriptionWithoutTags?: string;
  taskLocation: { lineNumber: number };
  startDate?: TasksPluginTaskDate;
  dueDate?: TasksPluginTaskDate;
  scheduledDate?: TasksPluginTaskDate;
  doneDate?: TasksPluginTaskDate;
  originalMarkdown: string;
  isDone?: boolean;
  doneDatez?: unknown;
  statusCharacter?: string;
  _startDate?: TasksPluginTaskDate | null;
  _dueDate?: TasksPluginTaskDate | null;
  _scheduledDate?: TasksPluginTaskDate | null;
  _doneDate?: TasksPluginTaskDate | null;
}

export interface TasksCacheData {
  state?: { name?: string } | string;
  tasks?: TasksPluginTask[];
}

const TASK_TAG_PATTERN = /(?:^|\s)#task(?:\/[^\s#]+)?/g;
const TASKS_DATE_METADATA_PATTERN =
  /\s*(?:\u2795|\uD83D\uDEEB|\u23F3|\uD83D\uDCC5|\u2705|\u274C|\u26D4)\s*\d{4}-\d{2}-\d{2}/gu;
const TASKS_PRIORITY_PATTERN =
  /\s*(?:\uD83D\uDD3A|\u23EB|\uD83D\uDD3C|\uD83D\uDD3D|\u23EC)(?=\s|$)/gu;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts a time or time range from a task title.
 * Matches patterns like (18:00) or (18:00-20:00) anywhere in the title.
 * Returns { startTime, endTime, cleanTitle } where cleanTitle has the pattern removed.
 */
export function extractTimeFromTitle(title: string): {
  startTime: string | null;
  endTime: string | null;
  cleanTitle: string;
} {
  const TIME_TOKEN = String.raw`\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?`;
  const timeRangePattern = new RegExp(`\\((${TIME_TOKEN})-(${TIME_TOKEN})\\)`);
  const timePattern = new RegExp(`\\((${TIME_TOKEN})\\)`);

  const normalise = (t: string) =>
    t.replace(/\s*([AaPp][Mm])$/, (_, m: string) => ` ${m.toUpperCase()}`);

  const rangeMatch = title.match(timeRangePattern);
  if (rangeMatch) {
    return {
      startTime: normalise(rangeMatch[1]),
      endTime: normalise(rangeMatch[2]),
      cleanTitle: collapseSpaces(title.replace(rangeMatch[0], ''))
    };
  }

  const singleMatch = title.match(timePattern);
  if (singleMatch) {
    return {
      startTime: normalise(singleMatch[1]),
      endTime: null,
      cleanTitle: collapseSpaces(title.replace(singleMatch[0], ''))
    };
  }

  return { startTime: null, endTime: null, cleanTitle: collapseSpaces(title) };
}

function dateFromTasksValue(value: TasksPluginTaskDate | null | undefined): Date | null {
  if (!value || typeof value.toDate !== 'function') {
    return null;
  }

  const date = value.toDate();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function getTaskDate(
  task: TasksPluginTask,
  publicKey: 'startDate' | 'dueDate' | 'scheduledDate' | 'doneDate',
  privateKey: '_startDate' | '_dueDate' | '_scheduledDate' | '_doneDate'
): Date | null {
  return dateFromTasksValue(task[publicKey]) ?? dateFromTasksValue(task[privateKey]);
}

function getTaskDescription(task: TasksPluginTask): string {
  const withoutTags = task.descriptionWithoutTags;
  if (typeof withoutTags === 'string' && withoutTags.trim()) {
    return withoutTags;
  }
  return task.description || '';
}

export function getCleanTaskTitle(task: TasksPluginTask): {
  title: string;
  startTime: string | null;
  endTime: string | null;
} {
  const minimallyCleanedDescription = collapseSpaces(
    getTaskDescription(task)
      .replace(TASK_TAG_PATTERN, ' ')
      .replace(TASKS_DATE_METADATA_PATTERN, ' ')
      .replace(TASKS_PRIORITY_PATTERN, ' ')
  );
  const { cleanTitle, startTime, endTime } = extractTimeFromTitle(minimallyCleanedDescription);

  return {
    title: cleanTitle || task.description || task.originalMarkdown,
    startTime,
    endTime
  };
}

export function taskToCalendarTask(task: TasksPluginTask): CalendarTask {
  const oneBasedLineNumber = task.taskLocation.lineNumber + 1;
  const { title, startTime, endTime } = getCleanTaskTitle(task);
  const doneDate = getTaskDate(task, 'doneDate', '_doneDate');

  return {
    id: `${task.path}::${task.taskLocation.lineNumber}`,
    title,
    startDate: getTaskDate(task, 'startDate', '_startDate'),
    dueDate: getTaskDate(task, 'dueDate', '_dueDate'),
    scheduledDate: getTaskDate(task, 'scheduledDate', '_scheduledDate'),
    originalMarkdown: task.originalMarkdown,
    filePath: task.path,
    lineNumber: oneBasedLineNumber,
    isDone: task.isDone || task.statusCharacter === 'x' || !!task.doneDatez || !!doneDate,
    startTime,
    endTime
  };
}

export function tasksToCalendarTasks(tasks: TasksPluginTask[] | undefined): CalendarTask[] {
  return tasks?.map(taskToCalendarTask) ?? [];
}
