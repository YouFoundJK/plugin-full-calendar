// src/ui/chrono_analyser/modules/parser.ts

/**
 * @file Contains the logic for parsing a single markdown file into a structured TimeRecord object.
 * It handles both filename and YAML frontmatter parsing to extract all relevant event data.
 */

import { App, TFile } from 'obsidian';
import * as yaml from 'js-yaml';
import { TimeRecord, FileMetadata } from './types';
import { calculateDuration } from './utils';

/**
 * Parses a TFile to extract time tracking information from its filename and YAML frontmatter.
 *
 * @async
 * @param app - The Obsidian App instance, used for reading file content.
 * @param file - The TFile object to be parsed.
 * @param baseFolderPath - The path of the root folder selected for analysis. This is crucial for calculating the correct relative hierarchy.
 * @returns A promise that resolves to a structured TimeRecord object.
 * @throws An error object with `message`, `fileName`, and `filePath` if parsing fails at any step.
 */
export async function parseFile(
  app: App,
  file: TFile,
  baseFolderPath: string
): Promise<TimeRecord> {
  try {
    const fileContent = await app.vault.read(file);

    // --- FIX: Calculate hierarchy relative to the selected base folder ---
    // Normalize base path to ensure it has a trailing slash for clean slicing (unless it's the root).
    const normalizedBasePath = baseFolderPath === '/' ? '' : `${baseFolderPath}/`;
    const relativePath = file.path.startsWith(normalizedBasePath)
      ? file.path.substring(normalizedBasePath.length)
      : file.path;

    const relativePathParts = relativePath.split('/');

    // The hierarchy is the first directory in the relative path.
    // If the file is directly inside the base folder, its length will be 1 (just the filename).
    const hierarchy = relativePathParts.length > 1 ? relativePathParts[0] : '(root)';
    // --- END OF FIX ---

    const filenameRegex =
      /^(?:(\d{4}-\d{2}-\d{2})\s+(.+?)\s+-\s+(.+?)(?:\s+([IVXLCDM\d]+))?|(?:\(([^)]+)\)\s*)(.+?)(?:\s*-\s*(.+?))?(?:\s+([IVXLCDM\d]+))?)\.md$/i;
    const filenameMatch = file.name.match(filenameRegex);
    if (!filenameMatch) throw new Error('Filename pattern mismatch.');

    let dateStr, projectFromFile, subprojectRaw, serialFromFile;
    if (filenameMatch[1]) {
      dateStr = filenameMatch[1];
      projectFromFile = filenameMatch[2];
      subprojectRaw = filenameMatch[3];
      serialFromFile = filenameMatch[4];
    } else {
      projectFromFile = filenameMatch[6];
      subprojectRaw = filenameMatch[7];
      serialFromFile = filenameMatch[8];
    }

    const yamlMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!yamlMatch) throw new Error('No YAML front matter found.');

    const metadata = yaml.load(yamlMatch[1]) as FileMetadata;
    if (!metadata || typeof metadata !== 'object')
      throw new Error('YAML front matter empty or not an object.');

    const eventDuration =
      metadata.type === 'recurring'
        ? metadata.startTime && metadata.endTime
          ? calculateDuration(metadata.startTime, metadata.endTime, 1)
          : 0
        : calculateDuration(metadata.startTime, metadata.endTime, metadata.days);

    let recordDate: Date | null = null;
    if (dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number);
      recordDate = new Date(Date.UTC(year, month - 1, day));
    } else if (metadata.date) {
      const metaDateVal = metadata.date;
      if (metaDateVal instanceof Date && !isNaN(metaDateVal.getTime())) {
        recordDate = new Date(
          Date.UTC(metaDateVal.getFullYear(), metaDateVal.getMonth(), metaDateVal.getDate())
        );
      } else {
        const metaDateStr = String(metaDateVal);
        const datePartsMatch = metaDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (datePartsMatch) {
          const [year, month, day] = datePartsMatch.slice(1, 4).map(Number);
          recordDate = new Date(Date.UTC(year, month - 1, day));
        } else {
          const parsedFallbackDate = new Date(metaDateStr);
          if (!isNaN(parsedFallbackDate.getTime())) {
            recordDate = new Date(
              Date.UTC(
                parsedFallbackDate.getFullYear(),
                parsedFallbackDate.getMonth(),
                parsedFallbackDate.getDate()
              )
            );
          }
        }
      }
    }
    if (recordDate && isNaN(recordDate.getTime()))
      throw new Error(`Invalid date parsed: ${dateStr || metadata.date}`);

    const finalProject = projectFromFile ? projectFromFile.trim() : 'Unknown Project';
    let baseSubproject = 'none',
      fullSubproject = 'none';
    if (subprojectRaw) {
      subprojectRaw = subprojectRaw.trim();
      const subprojectSerialMatch = subprojectRaw.match(/^(.*?)\s+([IVXLCDM\d]+)$/);
      if (subprojectSerialMatch) {
        baseSubproject = subprojectSerialMatch[1].trim();
        serialFromFile = serialFromFile || subprojectSerialMatch[2];
      } else {
        baseSubproject = subprojectRaw;
      }
      fullSubproject = baseSubproject;
      if (serialFromFile) fullSubproject += ` ${serialFromFile.trim()}`;
    }
    if (baseSubproject === '') baseSubproject = 'none';
    fullSubproject = fullSubproject.trim();
    if (fullSubproject === '') fullSubproject = 'none';

    return {
      path: file.path,
      hierarchy,
      project: finalProject,
      subproject: baseSubproject,
      subprojectFull: fullSubproject,
      duration: eventDuration,
      file: file.name,
      date: recordDate,
      metadata
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred during parsing.';
    throw { message: errorMessage, fileName: file.name, filePath: file.path };
  }
}
