// src/chrono_analyser/modules/ui.ts

import { App, Modal, Setting, TFolder, SuggestModal } from 'obsidian';

// DATA STRUCTURES
interface InsightRule {
  hierarchies: string[];
  projects: string[];
  subprojectKeywords: string[];
}
interface InsightGroups {
  [groupName: string]: { rules: InsightRule };
}
export interface InsightsConfig {
  version: number;
  lastUpdated: string;
  insightGroups: InsightGroups;
}

// INSIGHTS CONFIG MODAL - NOW WITH WORKING AUTOCOMPLETE
export class InsightConfigModal extends Modal {
  private config: InsightsConfig;
  private onSave: (newConfig: InsightsConfig) => void;
  private knownHierarchies: string[];
  private knownProjects: string[];

  constructor(
    app: App,
    existingConfig: InsightsConfig | null,
    knownHierarchies: string[],
    knownProjects: string[],
    onSaveCallback: (newConfig: InsightsConfig) => void
  ) {
    super(app);
    this.onSave = onSaveCallback;
    this.knownHierarchies = knownHierarchies;
    this.knownProjects = knownProjects;

    this.config = existingConfig || {
      version: 1,
      lastUpdated: new Date().toISOString(),
      insightGroups: {
        Work: { rules: { hierarchies: ['Work'], projects: [], subprojectKeywords: [] } },
        Personal: { rules: { hierarchies: ['Personal'], projects: [], subprojectKeywords: [] } }
      }
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chrono-analyser-modal');
    contentEl.createEl('h2', { text: 'Configure Insight Groups' });
    contentEl.createEl('p', {
      text: 'Create groups to categorize your activities. The engine will use these rules to generate personalized insights.'
    });

    const groupsContainer = contentEl.createDiv();
    this.renderGroups(groupsContainer);

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Save Configuration')
          .setCta()
          .onClick(() => {
            // Prune any empty or invalid group names before saving
            Object.keys(this.config.insightGroups).forEach(name => {
              if (!name) delete this.config.insightGroups[name];
            });
            this.config.lastUpdated = new Date().toISOString();
            this.onSave(this.config);
            this.close();
          })
      )
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  private renderGroups(container: HTMLElement) {
    container.empty();
    const groupsEl = container.createDiv('insight-groups-container');
    for (const groupName in this.config.insightGroups) {
      this.renderGroupSetting(groupsEl, groupName, this.config.insightGroups[groupName].rules);
    }
    new Setting(container).addButton(btn =>
      btn.setButtonText('Add New Insight Group').onClick(() => {
        const newGroupName = `New Group ${Object.keys(this.config.insightGroups).length + 1}`;
        this.config.insightGroups[newGroupName] = {
          rules: { hierarchies: [], projects: [], subprojectKeywords: [] }
        };
        this.renderGroupSetting(
          groupsEl,
          newGroupName,
          this.config.insightGroups[newGroupName].rules
        );
      })
    );
  }

  private renderGroupSetting(container: HTMLElement, groupName: string, rules: InsightRule) {
    const groupContainer = container.createDiv({ cls: 'insight-group-setting' });
    const nameSetting = new Setting(groupContainer)
      .setName('Group Name')
      .addText(text =>
        text.setValue(groupName).onChange(newName => {
          if (newName && newName !== groupName && !this.config.insightGroups[newName]) {
            const oldGroup = this.config.insightGroups[groupName];
            delete this.config.insightGroups[groupName];
            this.config.insightGroups[newName] = oldGroup;
          }
        })
      )
      .addExtraButton(btn =>
        btn
          .setIcon('trash')
          .setTooltip('Delete this group')
          .onClick(() => {
            const currentName =
              nameSetting.nameEl.nextElementSibling?.querySelector('input')?.value || groupName;
            delete this.config.insightGroups[currentName];
            groupContainer.remove();
          })
      );

    this.createTagInput(
      groupContainer,
      'Matching Hierarchies',
      'Press Enter or select a suggestion.',
      rules.hierarchies,
      this.knownHierarchies
    );
    this.createTagInput(
      groupContainer,
      'Matching Projects',
      'Press Enter or select a suggestion.',
      rules.projects,
      this.knownProjects
    );

    new Setting(groupContainer)
      .setName('Matching Sub-project Keywords')
      .setDesc('Add keywords that will match if found anywhere in a sub-project.')
      .addTextArea(text => {
        text.setValue(rules.subprojectKeywords.join('\n')).onChange(value => {
          rules.subprojectKeywords = value
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        });
      });
  }

  private createTagInput(
    container: HTMLElement,
    name: string,
    desc: string,
    values: string[],
    suggestions: string[]
  ) {
    const setting = new Setting(container).setName(name).setDesc(desc);
    const wrapper = setting.controlEl.createDiv({ cls: 'autocomplete-wrapper' }); // The wrapper needs this class
    const tagInputContainer = wrapper.createDiv({ cls: 'tag-input-container' });
    const tagsEl = tagInputContainer.createDiv({ cls: 'tags' });
    const inputEl = tagInputContainer.createEl('input', { type: 'text', cls: 'tag-input' });
    wrapper.createDiv({ cls: 'autocomplete-suggestions' }); // The empty container for the utility to find

    const renderTags = () => {
      tagsEl.empty();
      values.forEach((tag, index) => {
        const tagEl = tagsEl.createDiv({ cls: 'tag' });
        tagEl.setText(tag);
        const removeEl = tagEl.createSpan({ cls: 'tag-remove' });
        removeEl.setText('×');
        removeEl.onClickEvent(() => {
          values.splice(index, 1);
          renderTags();
        });
      });
    };

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inputEl.value) {
        e.preventDefault();
        const newTag = inputEl.value.trim();
        if (newTag && !values.includes(newTag)) {
          values.push(newTag);
          renderTags();
        }
        inputEl.value = '';
      }
    });

    setupAutocomplete(
      wrapper,
      value => {
        const newTag = value.trim();
        if (newTag && !values.includes(newTag)) {
          values.push(newTag);
          renderTags();
        }
        inputEl.value = '';
        inputEl.focus();
      },
      () => suggestions
    );

    renderTags();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// --- Autocomplete Utility ---
function updateActiveSuggestion(suggestions: HTMLElement[], index: number) {
  suggestions.forEach((suggestion, idx) => suggestion.classList.toggle('active', idx === index));
}

export function setupAutocomplete(
  wrapperEl: HTMLElement,
  onSelectCallback: (value: string) => void,
  getDataFunc: () => string[]
) {
  const input = wrapperEl.querySelector<HTMLInputElement>('input');
  const suggestionsContainer = wrapperEl.querySelector<HTMLElement>('.autocomplete-suggestions');
  if (!input || !suggestionsContainer) return;

  let activeSuggestionIndex = -1;

  const populateSuggestions = (items: string[]) => {
    suggestionsContainer.empty();
    activeSuggestionIndex = -1;
    if (items.length > 0) {
      items.forEach(item => {
        const div = suggestionsContainer.createDiv(); // Uses default div, no custom class needed
        div.textContent = item;
        div.addEventListener('mousedown', e => {
          // Use mousedown to prevent blur event firing first
          e.preventDefault();
          onSelectCallback(item);
          suggestionsContainer.style.display = 'none';
        });
      });
      suggestionsContainer.style.display = 'block';
    } else {
      suggestionsContainer.style.display = 'none';
    }
  };

  const updateFilteredSuggestions = () => {
    const value = input.value.toLowerCase().trim();
    const data = getDataFunc();
    populateSuggestions(
      value === '' ? data : data.filter(item => item.toLowerCase().includes(value))
    );
  };

  input.addEventListener('focus', updateFilteredSuggestions);
  input.addEventListener('input', updateFilteredSuggestions);
  input.addEventListener('blur', () =>
    setTimeout(() => {
      suggestionsContainer.style.display = 'none';
    }, 200)
  );

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    const currentSuggestions = Array.from(suggestionsContainer.children) as HTMLElement[];
    if (e.key === 'Enter') {
      e.preventDefault();
      const valueToSubmit =
        activeSuggestionIndex > -1 && currentSuggestions[activeSuggestionIndex]
          ? currentSuggestions[activeSuggestionIndex].textContent!
          : input.value;

      onSelectCallback(valueToSubmit);
      suggestionsContainer.style.display = 'none';
      input.blur(); // Lose focus after selection
    } else if (e.key === 'Escape') {
      suggestionsContainer.style.display = 'none';
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (currentSuggestions.length === 0) return;
      e.preventDefault();
      activeSuggestionIndex =
        e.key === 'ArrowDown'
          ? (activeSuggestionIndex + 1) % currentSuggestions.length
          : (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      updateActiveSuggestion(currentSuggestions, activeSuggestionIndex);
    }
  });
}

// FOLDER SUGGEST MODAL
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
