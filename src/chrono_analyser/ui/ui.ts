// src/chrono_analyser/modules/ui.ts

import { App, Modal, Setting, TFolder, SuggestModal } from 'obsidian';

// DATA STRUCTURES
interface InsightRule {
  hierarchies: string[];
  projects: string[];
  subprojectKeywords: string[];
  mutedSubprojectKeywords: string[]; // Correct property name
  mutedProjects: string[]; // Correct property name
}
interface InsightGroups {
  [groupName: string]: { rules: InsightRule };
}
export interface InsightsConfig {
  version: number;
  lastUpdated: string;
  insightGroups: InsightGroups;
}

// --- Autocomplete Component Class ---
class AutocompleteComponent {
  private inputEl: HTMLInputElement;
  private wrapperEl: HTMLElement;
  private suggestionsEl: HTMLElement;
  private onSelectCallback: (value: string) => void;
  private getDataFunc: () => string[];
  private activeSuggestionIndex = -1;

  constructor(
    wrapperEl: HTMLElement,
    onSelectCallback: (value: string) => void,
    getDataFunc: () => string[]
  ) {
    this.wrapperEl = wrapperEl;
    this.inputEl = wrapperEl.querySelector('input')!;
    this.onSelectCallback = onSelectCallback;
    this.getDataFunc = getDataFunc;

    this.suggestionsEl = this.wrapperEl.createDiv({ cls: 'autocomplete-suggestions' });

    this.bindEvents();
  }

  private bindEvents() {
    this.inputEl.addEventListener('focus', this.updateFilteredSuggestions);
    this.inputEl.addEventListener('input', this.updateFilteredSuggestions);
    this.inputEl.addEventListener('blur', this.onBlur);
    this.inputEl.addEventListener('keydown', this.onKeyDown);
  }

  private onBlur = () => {
    // Delay hiding to allow click events on suggestions to fire
    setTimeout(() => {
      this.suggestionsEl.style.display = 'none';
    }, 200);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const suggestions = Array.from(this.suggestionsEl.children) as HTMLElement[];
    if (suggestions.length === 0 && e.key !== 'Enter' && e.key !== 'Escape') return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        const valueToSubmit =
          this.activeSuggestionIndex > -1 && suggestions[this.activeSuggestionIndex]
            ? suggestions[this.activeSuggestionIndex].textContent!
            : this.inputEl.value;
        this.onSelectCallback(valueToSubmit);
        this.suggestionsEl.style.display = 'none';
        this.inputEl.blur();
        break;
      case 'Escape':
        this.suggestionsEl.style.display = 'none';
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        this.activeSuggestionIndex =
          e.key === 'ArrowDown'
            ? (this.activeSuggestionIndex + 1) % suggestions.length
            : (this.activeSuggestionIndex - 1 + suggestions.length) % suggestions.length;
        this.updateActiveSuggestion(suggestions, this.activeSuggestionIndex);
        break;
    }
  };

  private populateSuggestions = (items: string[]) => {
    this.suggestionsEl.empty();
    this.activeSuggestionIndex = -1;

    if (items.length > 0) {
      items.forEach(item => {
        const div = this.suggestionsEl.createDiv({ cls: 'autocomplete-suggestion-item' });
        div.textContent = item;
        div.addEventListener('mousedown', e => {
          e.preventDefault(); // Prevent blur event from firing first
          this.onSelectCallback(item);
          this.suggestionsEl.style.display = 'none';
        });
      });
      this.suggestionsEl.style.display = 'block';
    } else {
      this.suggestionsEl.style.display = 'none';
    }
  };

  private updateFilteredSuggestions = () => {
    const value = this.inputEl.value.toLowerCase().trim();
    const allData = this.getDataFunc();
    const filteredData =
      value === '' ? allData : allData.filter(item => item.toLowerCase().includes(value));
    this.populateSuggestions(filteredData);
  };

  private updateActiveSuggestion(suggestions: HTMLElement[], index: number) {
    suggestions.forEach((suggestion, idx) => {
      suggestion.classList.toggle('is-active', idx === index);
    });
  }
}

// --- NEW simplified setup function ---
export function setupAutocomplete(
  wrapperEl: HTMLElement,
  onSelectCallback: (value: string) => void,
  getDataFunc: () => string[]
) {
  if (wrapperEl.querySelector('input')) {
    new AutocompleteComponent(wrapperEl, onSelectCallback, getDataFunc);
  }
}

// INSIGHTS CONFIG MODAL - NOW WITH WORKING AUTOCOMPLETE
export class InsightConfigModal extends Modal {
  private config: InsightsConfig;
  private onSave: (newConfig: InsightsConfig) => void;
  private knownHierarchies: string[];
  private knownProjects: string[];
  private expandedGroupName: string | null = null; // Collapsible state

  // --- Unsaved changes tracking ---
  private originalConfigString: string = '';
  private hasUnsavedChanges: boolean = false;
  private isSaving: boolean = false;

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

    const defaultConfig: InsightsConfig = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      insightGroups: {
        Work: {
          rules: {
            hierarchies: ['Work'],
            projects: [],
            subprojectKeywords: [],
            mutedSubprojectKeywords: [],
            mutedProjects: []
          }
        },
        Personal: {
          rules: {
            hierarchies: ['Personal'],
            projects: [],
            subprojectKeywords: [],
            mutedSubprojectKeywords: [],
            mutedProjects: []
          }
        }
      }
    };

    // --- START OF THE NEW MIGRATION LOGIC ---
    let loadedConfig = existingConfig || defaultConfig;

    // Perform migration on the loaded config
    if (loadedConfig && loadedConfig.insightGroups) {
      Object.values(loadedConfig.insightGroups).forEach(group => {
        if (group && group.rules) {
          // Ensure the new fields exist
          if (group.rules.mutedProjects === undefined) {
            group.rules.mutedProjects = [];
          }
          if (group.rules.mutedSubprojectKeywords === undefined) {
            // Check if there's an old field to migrate from
            if ((group.rules as any).subprojectKeywords_exclude) {
              group.rules.mutedSubprojectKeywords = (group.rules as any).subprojectKeywords_exclude;
            } else {
              group.rules.mutedSubprojectKeywords = [];
            }
          }
          // Delete the old, incorrect field if it exists
          delete (group.rules as any).subprojectKeywords_exclude;
        }
      });
    }

    this.config = loadedConfig;
    // --- END OF THE NEW MIGRATION LOGIC ---
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

            this.isSaving = true;
            this.close();
          })
      )
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));

    // Track original config for unsaved changes
    this.originalConfigString = JSON.stringify(this.config);
    this.hasUnsavedChanges = false;
    this.isSaving = false;
  }

  private renderGroups(container: HTMLElement) {
    container.empty();
    const groupsEl = container.createDiv('insight-groups-container');
    for (const groupName in this.config.insightGroups) {
      const groupData = this.config.insightGroups[groupName];
      // Defensive check to prevent crash on corrupt data
      if (groupData && groupData.rules) {
        this.renderGroupSetting(groupsEl, groupName, groupData.rules);
      } else {
        // Clean up corrupt group
        console.warn(`[Chrono Analyser] Found and removed corrupt insight group: "${groupName}"`);
        delete this.config.insightGroups[groupName];
      }
    }
    new Setting(container).addButton(btn =>
      btn.setButtonText('Add New Insight Group').onClick(() => {
        const newGroupName = `New Group ${Object.keys(this.config.insightGroups).length + 1}`;
        // --- FIX 3: Correct the creation of new groups ---
        this.config.insightGroups[newGroupName] = {
          rules: {
            hierarchies: [],
            projects: [],
            subprojectKeywords: [],
            mutedSubprojectKeywords: [], // ENSURE THIS IS THE NAME USED
            mutedProjects: [] // ENSURE THIS IS THE NAME USED
          }
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
    let currentGroupName = groupName;
    const isExpanded = this.expandedGroupName === currentGroupName;

    const groupContainer = container.createDiv({ cls: 'insight-group-setting' });
    groupContainer.toggleClass('is-expanded', isExpanded);

    const nameSetting = new Setting(groupContainer)
      .setName('Group Name')
      .addText(text =>
        text
          .setValue(currentGroupName)
          .setPlaceholder('e.g., Work')
          .setDisabled(!isExpanded)
          .onChange(newName => {
            const newNameTrimmed = newName.trim();
            if (
              newNameTrimmed &&
              newNameTrimmed !== currentGroupName &&
              !this.config.insightGroups[newNameTrimmed]
            ) {
              const groupData = this.config.insightGroups[currentGroupName];
              if (groupData) {
                delete this.config.insightGroups[currentGroupName];
                this.config.insightGroups[newNameTrimmed] = groupData;
                currentGroupName = newNameTrimmed;
                this.expandedGroupName = newNameTrimmed;
                this.checkForUnsavedChanges();
                this.renderGroups(container.parentElement!);
              }
            }
            this.checkForUnsavedChanges();
          })
      )
      .addExtraButton(btn => {
        btn
          .setIcon('trash')
          .setTooltip('Delete this group')
          .setDisabled(!isExpanded)
          .onClick(() => {
            const currentName =
              nameSetting.nameEl.nextElementSibling?.querySelector('input')?.value ||
              currentGroupName;
            delete this.config.insightGroups[currentName];
            this.renderGroups(container.parentElement!);
          });
      });

    // --- NEW, SMARTER EVENT LISTENER ---
    groupContainer.addEventListener('click', evt => {
      const target = evt.target as HTMLElement;

      // If the group is collapsed, any click should expand it.
      if (!isExpanded) {
        this.expandedGroupName = currentGroupName;
        this.renderGroups(container.parentElement!);
        return;
      }

      // If the group is expanded, only a click on the "header" should collapse it.
      // Our header is the `nameSetting.settingEl`.
      const clickedOnHeader = nameSetting.settingEl.contains(target);
      const clickedOnInteractive = target.closest('input, textarea, button, .tag-remove');

      if (clickedOnHeader && !clickedOnInteractive) {
        this.expandedGroupName = null; // Collapse
        this.renderGroups(container.parentElement!);
      }
      // Otherwise, if expanded, do nothing. This prevents collapsing when clicking on content.
    });

    // Foldable content container
    const foldableContent = groupContainer.createDiv('foldable-content');

    // All settings inside foldableContent
    this.createTagInput(
      foldableContent,
      'Matching Hierarchies',
      'e.g., Work Calendar, Personal Calendar',
      'Add hierarchy...',
      rules.hierarchies || [],
      this.knownHierarchies,
      () => this.checkForUnsavedChanges()
    );
    this.createTagInput(
      foldableContent,
      'Matching Projects',
      'e.g., Project Phoenix, Q4 Report',
      'Add project...',
      rules.projects || [],
      this.knownProjects,
      () => this.checkForUnsavedChanges()
    );
    // --- FIX 4: Make sure `renderGroupSetting` is accessing the correct property ---
    this.createTagInput(
      foldableContent,
      'Muted Projects',
      'Mute specific projects (case-sensitive, exact match) to exclude them from Habit Consistency checks.',
      'Add muted project...',
      rules.mutedProjects || [], // THIS MUST BE `mutedProjects`
      this.knownProjects,
      () => this.checkForUnsavedChanges()
    );

    new Setting(foldableContent)
      .setName('Matching Sub-project Keywords')
      .setDesc('Add keywords that will match if found anywhere in a sub-project.')
      .addTextArea(text => {
        text
          .setValue((rules.subprojectKeywords || []).join('\n'))
          .setPlaceholder('eg., design\nresearch\nmeeting')
          .setDisabled(!isExpanded)
          .onChange(value => {
            rules.subprojectKeywords = value
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
            this.checkForUnsavedChanges();
          });
      });

    new Setting(foldableContent)
      .setName('Muted Sub-project Keywords')
      .setDesc(
        'Mute activities by keyword. If a sub-project contains any of these (case-insensitive) keywords, it will be excluded from Habit Consistency checks.'
      )
      .addTextArea(text => {
        text
          .setValue((rules.mutedSubprojectKeywords || []).join('\n')) // THIS MUST BE `mutedSubprojectKeywords`
          .setPlaceholder('e.g., completed\narchive\nold')
          .setDisabled(!isExpanded)
          .onChange(value => {
            rules.mutedSubprojectKeywords = value // THIS MUST BE `mutedSubprojectKeywords`
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
            this.checkForUnsavedChanges();
          });
      });
  }

  private createTagInput(
    container: HTMLElement,
    name: string,
    desc: string,
    placeholder: string,
    values: string[],
    suggestions: string[],
    onChange?: () => void
  ) {
    const setting = new Setting(container).setName(name).setDesc(desc);
    const wrapper = setting.controlEl.createDiv({ cls: 'autocomplete-wrapper' });
    const tagInputContainer = wrapper.createDiv({ cls: 'tag-input-container' });
    const tagsEl = tagInputContainer.createDiv({ cls: 'tags' });
    const inputEl = tagInputContainer.createEl('input', {
      type: 'text',
      cls: 'tag-input',
      placeholder
    });

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
          if (onChange) onChange();
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
          if (onChange) onChange();
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
          if (onChange) onChange();
        }
        inputEl.value = '';
        inputEl.focus();
      },
      () => suggestions
    );

    renderTags();
  }

  private checkForUnsavedChanges() {
    const currentConfigString = JSON.stringify(this.config);
    this.hasUnsavedChanges = currentConfigString !== this.originalConfigString;
  }

  close() {
    this.checkForUnsavedChanges();
    if (this.hasUnsavedChanges && !this.isSaving) {
      this.showConfirmationModal();
    } else {
      super.close();
    }
  }

  private showConfirmationModal() {
    const confirmationModal = new Modal(this.app);
    confirmationModal.contentEl.addClass('chrono-analyser-modal');
    confirmationModal.contentEl.createEl('h2', { text: 'Unsaved Changes' });
    confirmationModal.contentEl.createEl('p', {
      text: 'You have unsaved changes. Would you like to save them before closing?'
    });

    new Setting(confirmationModal.contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Save and Close')
          .setCta()
          .onClick(() => {
            this.isSaving = true;
            const saveButton = this.modalEl.querySelector('.mod-cta') as HTMLButtonElement;
            saveButton?.click();
            confirmationModal.close();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Discard Changes').onClick(() => {
          this.isSaving = true;
          confirmationModal.close();
          this.close();
        })
      );

    confirmationModal.open();
  }

  onClose() {
    this.contentEl.empty();
  }
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
