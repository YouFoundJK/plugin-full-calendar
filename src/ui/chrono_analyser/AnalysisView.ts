import { ItemView, TFolder, Notice, App, WorkspaceLeaf } from "obsidian";

/**
 * 
 * @param app Dummy Obsidian App instance. DELETE later
 * @returns 
 */
export async function revealAnalysisFolder(app: App) {
    const target = app.vault.getAbstractFileByPath("Calender");
    if (!target || !(target instanceof TFolder)) {
        new Notice("Folder “Calender” not found");
        return;
    }

    let leaf: WorkspaceLeaf | null =
        app.workspace.getLeavesOfType("file-explorer")[0] ?? null;
    if (!leaf) {
        leaf = app.workspace.getLeftLeaf(false);
        if (!leaf) {
            new Notice("Unable to open file explorer.");
            return;
        }
        await leaf.setViewState({ type: "file-explorer" });
    }

    app.workspace.revealLeaf(leaf);
    const view = leaf.view as {
        revealInFolder?: (folder: TFolder) => void;
        reveal?: (folder: TFolder) => void;
    };
    if (typeof view.revealInFolder === "function") {
        view.revealInFolder(target);
    } else if (typeof view.reveal === "function") {
        view.reveal(target);
    } else {
        new Notice("Unable to reveal folder in this version of Obsidian.");
    }
}

// --- ChronoAnalyser View Type ---
export const ANALYSIS_VIEW_TYPE = "full-calendar-analysis-view";

export class AnalysisView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return ANALYSIS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Calendar Analysis";
    }

    getIcon(): string {
        return "beaker";
    }

    protected async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();  // Clear any existing content

        // Add your new content. For now, we'll just add a placeholder.
        container.createEl("h2", { text: "Analysis View" });
        container.createEl("p", {
            text: "This is a placeholder for the calendar analysis addon. Future content will be rendered here.",
        });
    }

    protected async onClose() {
        // Clean up if necessary
    }
}

/**
 * Activates the AnalysisView.
 * If the view is already open, it reveals it.
 * If not, it opens it in a new tab.
 * @param app The Obsidian App instance.
 */
export async function activateAnalysisView(app: App): Promise<void> {
    app.workspace.detachLeavesOfType(ANALYSIS_VIEW_TYPE);

    const existingLeaves = app.workspace.getLeavesOfType(ANALYSIS_VIEW_TYPE);
    if (existingLeaves.length > 0) {
        app.workspace.revealLeaf(existingLeaves[0]);
        return;
    }

    const newLeaf = app.workspace.getLeaf("tab");
    await newLeaf.setViewState({
        type: ANALYSIS_VIEW_TYPE,
        active: true,
    });
}