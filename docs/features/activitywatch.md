# ActivityWatch Integration

Full Calendar Remastered features an out-of-the-box integration with [ActivityWatch](https://activitywatch.net/), an automatic open-source time tracking software. This allows you to effortlessly pull your device usage data, web browsing history, and specific editor telemetry natively into your Obsidian calendar, providing an accurate, automated timeline of how you spent your day.

## Initial Setup

To begin, ensure you have ActivityWatch installed and running locally on your machine (the `aw-server` usually binds to `localhost:5600`).

1. Open Full Calendar Settings.
2. Under the **ActivityWatch** section, toggle the integration on.
3. Click the gear icon next to the toggle to open the configuration modal.
4. Set the **Target Calendar**. The plugin will inject all matching ActivityWatch events directly into this calendar source (e.g., your Daily Note Provider is heavily recommended for journaling).

## Sync Strategies

The integration offers two ways to fetch data:

- **Sync from Last Checked (Auto)**: Automatically runs incrementally. When you run the sync command, it queries the ActivityWatch API for any events created since the very last time data was successfully synced, acting as an append-only sequence.
- **Custom Date Range**: Use the provided date picker to specify exact Start and End dates to pull data from, ignoring the historical `lastChecked` timestamp. Useful for recovering missed data or back-populating old days.

## Categorization Rules & JSON Matching

By default, ActivityWatch telemetry contains thousands of raw technical events. To transform these raw payloads into structured, color-coded calendar blocks, you define regex categorization **Rules**. ActivityWatch records events in different "Buckets" based on the system watcher that produced them (e.g., `aw-watcher-web-chrome`, `aw-watcher-window`, `aw-watcher-vscode`).

Each rule targets a specific Bucket, tests its payload against a regex expression, and translates matched events into an Obsidian Category and Title format.

### Anatomy of a Rule

- **Bucket ID or 'window'/'web'**: Enter the exact ID of the target ActivityWatch Bucket, or a substring (like `vscode`). For ease of use, entering exactly `window` or `web` automatically targets the default `currentwindow` and `web.tab.current` buckets.
- **Match Field**: Payloads organically differ by watcher. A web browser watcher might use `url` or `title`, while `aw-watcher-vscode` stores file paths in `file` or `project`.
  - Enter the exact JSON key you want to apply regex against (e.g., `url`).
  - **Leave this blank** to allow the plugin to automatically scan the most common keys (`app`, `url`, `project`, `file`, `title`) for a match.
- **Match Format**: Specify a substring or Regex Pattern to evaluate against the Match Field. For example, if Match Field is `url`, configuring Match Format `youtube\.com` will identify video-watching sessions. Check **Use Regex** if the format string acts as a regular expression.
- **Category & Sub-Category**: Standard mapping parameters corresponding exactly to your calendar categories.
- **Title Template**: Reconstructs the final title written to Obsidian.
  - You can inject **Dynamic properties** from the raw ActivityWatch JSON payload directly into your title by surrounding the key with curly braces. For example, `Browsing {url}` or `Working on {file} in {app}`. The plugin will natively swap the properties before insertion.

## Merging Tolerance

Often, time-tracking events rapidly fluctuate (e.g., quickly swapping back and forth between two tabs). To prevent infinite calendar clutter consisting of 30-second blocks, you can configure **Merge Tolerance**. 

This groups adjacent events into a single, contiguous calendar block if they are identical in Category, Sub-Category, and Title, and occur within the specified minute gap threshold. Small, isolated events lasting less than 60 seconds are also pruned to further preserve the aesthetic of your calendar timeline.

## Running the Sync

To execute the sync algorithm, run the Obsidian command `Full Calendar: Sync ActivityWatch data` through the Command Palette. All valid matches from the telemetry will be grouped according to your threshold and saved natively into your target calendar!
