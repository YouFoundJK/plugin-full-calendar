// src/chrono_analyser/modules/ui.ts

/**
 * @file Provides reusable UI components and logic for the Chrono Analyser.
 * This includes custom modals, autocomplete functionality, and other DOM-interactive elements.
 */

import { App, TFolder, SuggestModal, Modal, Setting } from 'obsidian';
import FullCalendarPlugin from '../../main'; // We need the plugin type for saving data

// --- NEW DATA STRUCTURE FOR CONFIG ---
interface InsightRule {
  hierarchies: string[];
  projects: string[];
  subprojectKeywords: string[];
}

interface InsightGroups {
  [groupName: string]: {
    rules: InsightRule;
  };
}

export interface InsightsConfig {
  version: number;
  lastUpdated: string;
  insightGroups: InsightGroups;
}
// --- END NEW DATA STRUCTURE ---

// --- NEW INSIGHTS WIZARD MODAL ---
export class InsightConfigModal extends Modal {
  private config: InsightsConfig;
  private onSave: (newConfig: InsightsConfig) => void;

  constructor(
    app: App,
    private plugin: FullCalendarPlugin,
    existingConfig: InsightsConfig | null,
    onSaveCallback: (newConfig: InsightsConfig) => void
  ) {
    super(app);
    this.onSave = onSaveCallback;

    // Initialize with default structure if no config exists
    this.config = existingConfig || {
      version: 1,
      lastUpdated: new Date().toISOString(),
      insightGroups: {
        'Sample Work Group': {
          rules: {
            hierarchies: ['Work'],
            projects: ['Project A'],
            subprojectKeywords: ['meeting']
          }
        },
        'Sample Personal Group': {
          rules: {
            hierarchies: ['Personal'],
            projects: ['Gym'],
            subprojectKeywords: ['hobby', 'workout']
          }
        }
      }
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chrono-analyser-modal');
    contentEl.createEl('h2', { text: 'Configure Insight Groups' });
    contentEl.createEl('p', {
      text: 'Create groups to categorize your activities. The engine will use these rules to generate personalized insights. Changes are saved only when you click the "Save" button.'
    });

    this.renderGroups(contentEl.createDiv());

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Save Configuration')
          .setCta()
          .onClick(() => {
            this.config.lastUpdated = new Date().toISOString();
            this.onSave(this.config);
            this.close();
          })
      )
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  private renderGroups(container: HTMLElement) {
    container.empty();

    for (const groupName in this.config.insightGroups) {
      const details = this.contentEl.createEl('details');
      details.addClass('log-entry');
      details.open = true;

      const summary = details.createEl('summary');
      new Setting(summary).setName(groupName).addExtraButton(btn => {
        btn
          .setIcon('trash')
          .setTooltip('Delete this group')
          .onClick(() => {
            delete this.config.insightGroups[groupName];
            this.renderGroups(container); // Re-render the list
          });
      });

      this.renderRuleInputs(details, this.config.insightGroups[groupName].rules);
    }

    new Setting(container).addButton(btn =>
      btn.setButtonText('Add New Insight Group').onClick(() => {
        const newGroupName = `New Group ${Object.keys(this.config.insightGroups).length + 1}`;
        this.config.insightGroups[newGroupName] = {
          rules: { hierarchies: [], projects: [], subprojectKeywords: [] }
        };
        this.renderGroups(container);
      })
    );
  }

  private renderRuleInputs(container: HTMLElement, rules: InsightRule) {
    new Setting(container)
      .setName('Matching Hierarchies')
      .setDesc('Add hierarchy names that belong to this group.')
      .addTextArea(text =>
        text
          .setValue(rules.hierarchies.join('\n'))
          .setPlaceholder('Work\nPersonal/Clients...')
          .onChange(value => {
            rules.hierarchies = value
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
          })
      );

    new Setting(container)
      .setName('Matching Projects')
      .setDesc('Add project names that belong to this group.')
      .addTextArea(text =>
        text
          .setValue(rules.projects.join('\n'))
          .setPlaceholder('Project Titan\nGym...')
          .onChange(value => {
            rules.projects = value
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
          })
      );

    new Setting(container)
      .setName('Matching Sub-project Keywords')
      .setDesc('Add keywords that, if found in a sub-project, will match this group.')
      .addTextArea(text =>
        text
          .setValue(rules.subprojectKeywords.join('\n'))
          .setPlaceholder('meeting\nresearch\nworkout...')
          .onChange(value => {
            rules.subprojectKeywords = value
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
// --- END NEW MODAL ---

// ... (FolderSuggestModal and setupAutocomplete are unchanged) ...

export class FolderSuggestModal extends SuggestModal<TFolder> {
  constructor(
    app: App,
    private onChoose: (folder: TFolder) => void
  ) {
    super(app);
    this.setPlaceholder('Select a folder with your time tracking files...');
  }

  getSuggestions(query: string): TFolder[] {
    const queryLower = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter(
        (file): file is TFolder =>
          file instanceof TFolder && file.path.toLowerCase().includes(queryLower)
      );
  }

  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.createEl('div', { text: folder.path });
  }

  onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(folder);
  }
}

function updateActiveSuggestion(suggestions: HTMLElement[], index: number) {
  suggestions.forEach((suggestion, idx) => suggestion.classList.toggle('active', idx === index));
}

export function setupAutocomplete(
  rootEl: HTMLElement,
  inputId: string,
  suggestionsId: string,
  getDataFunc: () => string[],
  onSelectCallback: () => void
) {
  const input = rootEl.querySelector<HTMLInputElement>(`#${inputId}`);
  const suggestionsContainer = rootEl.querySelector<HTMLElement>(`#${suggestionsId}`);
  if (!input || !suggestionsContainer) return;

  let activeSuggestionIndex = -1;

  const populateSuggestions = (items: string[]) => {
    suggestionsContainer.innerHTML = '';
    activeSuggestionIndex = -1;
    if (items.length > 0) {
      items.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item;
        div.addEventListener('click', () => {
          input.value = item;
          suggestionsContainer.innerHTML = '';
          suggestionsContainer.style.display = 'none';
          if (onSelectCallback) onSelectCallback();
        });
        suggestionsContainer.appendChild(div);
      });
      suggestionsContainer.style.display = 'block';
    } else {
      suggestionsContainer.style.display = 'none';
    }
  };

  input.addEventListener('focus', () => {
    const value = input.value.toLowerCase().trim();
    const data = getDataFunc();
    populateSuggestions(
      value === '' ? data : data.filter(item => item.toLowerCase().includes(value))
    );
  });
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase().trim();
    const data = getDataFunc();
    populateSuggestions(
      value === ''
        ? (onSelectCallback(), data)
        : data.filter(item => item.toLowerCase().includes(value))
    );
  });
  input.addEventListener('blur', () =>
    setTimeout(() => (suggestionsContainer.style.display = 'none'), 150)
  );
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    let currentSuggestions = Array.from(suggestionsContainer.children) as HTMLElement[];
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex > -1 && currentSuggestions[activeSuggestionIndex]) {
        currentSuggestions[activeSuggestionIndex].click();
      } else {
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';
        if (onSelectCallback) onSelectCallback();
      }
    } else if (e.key === 'Escape') {
      suggestionsContainer.innerHTML = '';
      suggestionsContainer.style.display = 'none';
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestionsContainer.style.display === 'none' || currentSuggestions.length === 0) return;
      e.preventDefault();
      activeSuggestionIndex =
        e.key === 'ArrowDown'
          ? (activeSuggestionIndex + 1) % currentSuggestions.length
          : (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      updateActiveSuggestion(currentSuggestions, activeSuggestionIndex);
    }
  });
}
