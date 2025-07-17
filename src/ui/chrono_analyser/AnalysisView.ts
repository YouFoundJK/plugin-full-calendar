import { ItemView, TFolder, Notice, App, WorkspaceLeaf } from "obsidian";
import { createDOMStructure } from "./dom";
import { AnalysisController } from "./controller";
import FullCalendarPlugin from "../../main";

// Importing styles for the AnalysisView
import "flatpickr/dist/flatpickr.min.css";
import "./styles.css";

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
    private controller: AnalysisController | null = null;

    // The constructor now requires the `app` instance.
    constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin) {
        super(leaf);
        plugin: FullCalendarPlugin;
    }

    getViewType(): string {
        return ANALYSIS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Chrono Analyser";
    }

    getIcon(): string {
        return "bar-chart-horizontal";
    }

    protected async onOpen() {
        // Get the view's content container
        const container = this.containerEl.children[1];
        container.empty();

        // 3. Add our unique scoping class to the root element
        container.addClass("chrono-analyser-view");

        // 4. Build the HTML structure
        createDOMStructure(container as HTMLElement);

        // 5. Initialize the controller to bring the view to life
        this.controller = new AnalysisController(
            this.app,
            container as HTMLElement,
        );
        this.controller.initialize();
    }

    protected async onClose() {
        // 6. Clean up when the view is closed to prevent memory leaks
        this.controller?.destroy();
        this.controller = null;
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
