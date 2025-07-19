/**
 * @file Manages all data sourcing, caching, and real-time updates for the Chrono Analyser.
 * This service is the single point of contact for file system operations, data persistence,
 * and live updates from the vault.
 */

import { App, Notice, TFile, TFolder } from 'obsidian';
import FullCalendarPlugin from 'src/main';
import * as Parser from './parser';
import { DataManager } from './DataManager';
import { ChronoAnalyserData, ChronoCache, ProcessingError } from './types';

const CACHE_NAMESPACE = 'chronoAnalyserCache';

export class DataService {
  public lastFolderPath: string | null = null;
  public processingErrors: ProcessingError[] = [];
  private cache: ChronoCache = {};

  constructor(
    private app: App,
    private plugin: FullCalendarPlugin,
    private dataManager: DataManager,
    private onDataReady: () => void // Callback to trigger UI update
  ) {}

  /**
   * Loads persisted data and registers vault events.
   */
  public async initialize(): Promise<void> {
    await this.loadCacheAndSettings();
    this.registerVaultEvents();
  }

  /**
   * Determines which folder to load on startup (last used or default) and processes it.
   */
  public async loadInitialFolder(): Promise<void> {
    const defaultPath = 'Calender';
    let folderToLoad: TFolder | null = null;
    let noticeMessage = '';

    if (this.lastFolderPath) {
      const abstractFile = this.app.vault.getAbstractFileByPath(this.lastFolderPath);
      if (abstractFile instanceof TFolder) {
        folderToLoad = abstractFile;
        noticeMessage = `Loading last used folder: "${this.lastFolderPath}"`;
      }
    }

    if (!folderToLoad) {
      const abstractFile = this.app.vault.getAbstractFileByPath(defaultPath);
      if (abstractFile instanceof TFolder) {
        folderToLoad = abstractFile;
        noticeMessage = `Loading default folder: "${defaultPath}"`;
      }
    }

    if (folderToLoad) {
      new Notice(noticeMessage, 2000);
      await this.loadAndProcessFolder(folderToLoad);
    } else {
      new Notice('Please select a folder to analyze.', 5000);
      // Trigger a render to show the empty state and prompt
      this.onDataReady();
    }
  }

  /**
   * Scans a folder, processes its files using the cache, and updates the DataManager.
   * @param folder - The TFolder to process.
   */
  public async loadAndProcessFolder(folder: TFolder): Promise<void> {
    const notice = new Notice(`Scanning folder: "${folder.path}"...`, 0);
    try {
      const allMarkdownFiles = this.app.vault.getMarkdownFiles();
      const folderPathWithSlash = folder.isRoot()
        ? ''
        : folder.path.endsWith('/')
          ? folder.path
          : `${folder.path}/`;
      const filesToProcess = folder.isRoot()
        ? allMarkdownFiles
        : allMarkdownFiles.filter(file => file.path.startsWith(folderPathWithSlash));

      if (filesToProcess.length === 0) {
        notice.setMessage('No .md files found in the selected folder.');
        this.dataManager.clear();
        this.processingErrors = [];
        this.onDataReady(); // Inform controller that data is ready (empty)
        return;
      }

      await this.processFiles(filesToProcess, folder.path, notice);
      this.lastFolderPath = folder.path;
      await this.saveCacheAndSettings();
    } catch (e) {
      console.error('Chrono Analyser: Failed to process folder.', e);
      notice.setMessage('An error occurred. Check console for details.');
    } finally {
      setTimeout(() => notice.hide(), 4000);
    }
  }

  /**
   * Handles the "Clear Cache" action by wiping persisted data and in-memory state.
   */
  public async clearCache(): Promise<void> {
    this.cache = {};
    this.lastFolderPath = null;
    await this.saveCacheAndSettings();
    this.dataManager.clear();
    new Notice('Cache cleared.', 2000);
  }

  private async loadCacheAndSettings(): Promise<void> {
    const allData = (await this.plugin.loadData()) || {};
    const analyserData: Partial<ChronoAnalyserData> = allData[CACHE_NAMESPACE] || {};
    this.cache = analyserData.cache ?? {};
    this.lastFolderPath = analyserData.lastFolderPath ?? null;
  }

  private async saveCacheAndSettings(): Promise<void> {
    const allData = (await this.plugin.loadData()) || {};
    const analyserData: ChronoAnalyserData = {
      cache: this.cache,
      lastFolderPath: this.lastFolderPath ?? undefined
    };
    allData[CACHE_NAMESPACE] = analyserData;
    await this.plugin.saveData(allData);
  }

  private async processFiles(
    files: TFile[],
    baseFolderPath: string,
    notice: Notice
  ): Promise<void> {
    this.dataManager.clear();
    this.processingErrors = [];
    let filesParsed = 0;
    let filesFromCache = 0;

    for (const file of files) {
      const cachedEntry = this.cache[file.path];
      if (cachedEntry && cachedEntry.mtime === file.stat.mtime) {
        const recordFromCache = cachedEntry.record;
        if (recordFromCache.date && typeof recordFromCache.date === 'string')
          recordFromCache.date = new Date(recordFromCache.date);
        if (
          recordFromCache.metadata.startRecur &&
          typeof recordFromCache.metadata.startRecur === 'string'
        )
          recordFromCache.metadata.startRecur = new Date(recordFromCache.metadata.startRecur);
        if (
          recordFromCache.metadata.endRecur &&
          typeof recordFromCache.metadata.endRecur === 'string'
        )
          recordFromCache.metadata.endRecur = new Date(recordFromCache.metadata.endRecur);
        this.dataManager.addRecord(recordFromCache);
        filesFromCache++;
      } else {
        try {
          const record = await Parser.parseFile(this.app, file, baseFolderPath);
          this.dataManager.addRecord(record);
          this.cache[file.path] = { mtime: file.stat.mtime, record };
          filesParsed++;
        } catch (error: any) {
          this.processingErrors.push({
            file: error.fileName,
            path: error.filePath,
            reason: error.message
          });
        }
      }
    }

    this.dataManager.finalize();
    notice.setMessage(`Analysis complete. Parsed: ${filesParsed}, From cache: ${filesFromCache}.`);
    if (filesParsed > 0) await this.saveCacheAndSettings();
    this.onDataReady();
  }

  private registerVaultEvents(): void {
    const handleFileChange = async (file: TFile) => {
      if (this.lastFolderPath && file.path.startsWith(this.lastFolderPath)) {
        try {
          const record = await Parser.parseFile(this.app, file, this.lastFolderPath);
          this.dataManager.addRecord(record);
          this.dataManager.finalize();
          this.cache[file.path] = { mtime: file.stat.mtime, record };
          await this.saveCacheAndSettings();
          this.onDataReady();
        } catch (e) {}
      }
    };

    this.plugin.registerEvent(
      this.app.vault.on('modify', file => {
        if (file instanceof TFile) handleFileChange(file);
      })
    );

    this.plugin.registerEvent(
      this.app.vault.on('delete', file => {
        if (this.lastFolderPath && file.path in this.cache) {
          delete this.cache[file.path];
          this.dataManager.removeRecord(file.path);
          this.dataManager.finalize();
          this.saveCacheAndSettings();
          this.onDataReady();
        }
      })
    );

    this.plugin.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (file instanceof TFile && this.lastFolderPath && oldPath in this.cache) {
          await handleFileChange(file); // Re-parsing the new file is simplest
          delete this.cache[oldPath]; // Clean up the old path
          this.dataManager.removeRecord(oldPath);
          this.dataManager.finalize();
          await this.saveCacheAndSettings();
        }
      })
    );
  }
}
