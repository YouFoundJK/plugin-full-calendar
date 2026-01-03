# Testing the Plugin on iPhone

## Method 1: Using iCloud/Dropbox Sync (Easiest)

If your Obsidian vault is synced via iCloud or Dropbox:

### Step 1: Build the Plugin

```bash
npm run dev
```

This builds the plugin to: `/Users/kp/KAPEJ Dev vault/.obsidian/plugins/full-calendar-remastered/`

### Step 2: Sync to iPhone

1. **If using iCloud:**
   - Make sure your dev vault is in iCloud Drive
   - Wait for iCloud to sync (check iCloud Drive in Finder)
   - The plugin files will automatically sync to your iPhone

2. **If using Dropbox:**
   - Your vault appears to be in Dropbox already
   - Wait for Dropbox to sync
   - The plugin files will sync to your iPhone

### Step 3: Open Obsidian on iPhone

1. Open Obsidian app on your iPhone
2. Open your vault (the one that's synced)
3. Go to Settings → Community plugins
4. The plugin should already be there (if it was installed before)
5. If not, you may need to enable it

### Step 4: Test the Monthly View

1. Open the Full Calendar view
2. Tap the "View" button (or menu)
3. You should now see "Month" as an option
4. Select "Month" to test the monthly view

---

## Method 2: Manual File Transfer via Files App

If sync isn't working or you want to test quickly:

### Step 1: Build the Plugin

```bash
npm run prod
```

This creates a production build.

### Step 2: Copy Files to iPhone

1. **On your Mac:**
   - Open Finder
   - Connect your iPhone via USB (or use AirDrop)
   - Or use the Files app on iPhone to access iCloud/Dropbox

2. **Copy these 3 files:**
   - `main.js`
   - `styles.css`
   - `manifest.json`

   From: `/Users/kp/KAPEJ Dev vault/.obsidian/plugins/full-calendar-remastered/`

3. **On iPhone:**
   - Open Files app
   - Navigate to your Obsidian vault
   - Go to `.obsidian/plugins/full-calendar-remastered/`
   - Paste the 3 files

### Step 3: Reload Plugin in Obsidian

1. Open Obsidian on iPhone
2. Go to Settings → Community plugins
3. Disable and re-enable "Full Calendar Remastered"
4. Or restart Obsidian

---

## Method 3: Using Obsidian Sync

If you're using Obsidian's official sync:

1. Build the plugin on your Mac
2. The plugin files will sync automatically via Obsidian Sync
3. Open Obsidian on iPhone and test

---

## Quick Test Checklist

After the plugin is on your iPhone:

- [ ] Open Full Calendar view
- [ ] Check Settings → General → Mobile initial view
- [ ] Verify "Month" appears in the dropdown
- [ ] Select "Month" as default mobile view
- [ ] Open calendar and verify it shows month view
- [ ] Test the view dropdown menu - "Month" should be available
- [ ] Test switching between views (Month, 3 Days, Day, List)

---

## Troubleshooting

### Plugin Not Appearing

- Check that all 3 files are in the plugin directory:
  - `main.js`
  - `styles.css`
  - `manifest.json`
- Verify the directory name matches: `full-calendar-remastered`
- Restart Obsidian on iPhone

### Changes Not Showing

- Make sure you rebuilt after making changes: `npm run dev`
- Wait for sync to complete (check iCloud/Dropbox sync status)
- Reload the plugin in Obsidian settings

### Testing Mobile View Without iPhone

You can also test on desktop by resizing your browser/desktop app window:
- The plugin detects mobile when window width < 500px
- Resize your Obsidian window to be narrow
- The mobile view options will appear

---

## Development Workflow

For active development:

1. **On Mac:** Make changes and run `npm run dev` (watches for changes)
2. **Wait for sync:** Let iCloud/Dropbox sync the updated files
3. **On iPhone:** Reload the plugin in Obsidian settings
4. **Test:** Verify the changes work on mobile

This allows you to iterate quickly between Mac and iPhone testing.

