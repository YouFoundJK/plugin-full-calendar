# Workspace Feature Testing Guide

## Manual Testing Checklist for Customizable Calendar Workspaces

### Prerequisites
1. Build the plugin: `npm run build`
2. Copy manifest: `cp manifest.json obsidian-dev-vault/.obsidian/plugins/Full-Calender/`
3. Open Obsidian with the development vault
4. Ensure the Full Calendar plugin is enabled

### Test Cases

#### 1. Workspace Management in Settings
- [ ] Open Obsidian Settings → Full Calendar
- [ ] Verify "Workspaces" section appears after "Appearance" section
- [ ] Click "New Workspace" button
- [ ] Verify workspace modal opens with proper sections:
  - [ ] General (Name, Icon)
  - [ ] View Configuration (Desktop/Mobile views, Default date)
  - [ ] Calendar Filters (Visible/Hidden calendars)
  - [ ] Category Filters (if categorization enabled)
  - [ ] Appearance Overrides (Business hours, Timeline settings)

#### 2. Workspace Creation
- [ ] Create a workspace named "Work Focus"
- [ ] Set Desktop view to "Week"
- [ ] Set icon to "briefcase" (optional)
- [ ] Save the workspace
- [ ] Verify workspace appears in the workspace list
- [ ] Verify workspace has proper description showing settings

#### 3. Workspace Editing
- [ ] Click "Edit" on an existing workspace
- [ ] Modify the name and settings
- [ ] Save changes
- [ ] Verify changes are reflected in the workspace list

#### 4. Workspace Duplication
- [ ] Click "Duplicate" on an existing workspace
- [ ] Verify modal opens with copied settings and " Copy" suffix
- [ ] Modify the name
- [ ] Save the duplicated workspace
- [ ] Verify both workspaces exist

#### 5. Workspace Deletion
- [ ] Click "Delete" on a workspace
- [ ] Verify workspace is removed from the list
- [ ] If workspace was active, verify default view is restored

#### 6. Workspace Switcher in Calendar View
- [ ] Open the Full Calendar view
- [ ] Verify "Workspace ▾" button appears in the header toolbar (desktop only)
- [ ] Click the workspace switcher
- [ ] Verify dropdown shows:
  - [ ] "Default View" option (with check if active)
  - [ ] List of available workspaces (with check mark for active)
  - [ ] "Manage Workspaces..." option

#### 7. Workspace Switching
- [ ] Select a workspace from the switcher
- [ ] Verify calendar view updates to use workspace settings:
  - [ ] View type changes if configured
  - [ ] Calendar sources are filtered if configured
  - [ ] Business hours show/hide if overridden
- [ ] Verify workspace switcher button text updates to show active workspace
- [ ] Switch to "Default View"
- [ ] Verify calendar returns to global settings

#### 8. Calendar Source Filtering
- [ ] Create a workspace with specific visible calendars
- [ ] Activate the workspace
- [ ] Verify only specified calendars show events
- [ ] Create a workspace with hidden calendars
- [ ] Verify hidden calendars don't show events

#### 9. Category Filtering (if Advanced Categorization enabled)
- [ ] Enable Advanced Categorization in settings
- [ ] Configure some categories
- [ ] Create a workspace with category filters
- [ ] Set to "Show only" specific categories
- [ ] Verify only events from those categories appear
- [ ] Switch to "Hide" mode
- [ ] Verify specified categories are hidden

#### 10. Business Hours Override
- [ ] Create a workspace with business hours override
- [ ] Set to show business hours when global setting is hidden (or vice versa)
- [ ] Activate workspace
- [ ] Verify business hours display matches workspace setting

#### 11. Settings Persistence
- [ ] Create and configure multiple workspaces
- [ ] Restart Obsidian
- [ ] Verify all workspaces are preserved
- [ ] Verify active workspace is maintained across restarts

#### 12. Integration with Existing Features
- [ ] Test workspace switching with timeline views
- [ ] Test event creation/editing with active workspace
- [ ] Test drag and drop with filtered calendars
- [ ] Verify all existing calendar functionality works unchanged

#### 13. Mobile Compatibility (if testing on mobile)
- [ ] Verify workspace settings work on mobile
- [ ] Note: Workspace switcher only appears on desktop views

#### 14. Error Handling
- [ ] Try to create workspace with empty name (should not save)
- [ ] Test with invalid workspace configurations
- [ ] Verify graceful degradation when workspaces reference non-existent calendars

### Expected UI Locations

1. **Settings Tab**: Workspaces section appears between Appearance and Categorization
2. **Calendar Header**: Workspace switcher appears on the left side of the header toolbar (desktop only)
3. **Workspace Modal**: Comprehensive configuration dialog with tabbed sections

### Success Criteria

- [ ] All workspace CRUD operations work correctly
- [ ] Workspace switching immediately updates calendar view
- [ ] All filtering options work as expected
- [ ] Settings persist across Obsidian restarts
- [ ] No existing functionality is broken
- [ ] UI is intuitive and follows Obsidian design patterns

### Troubleshooting

If workspace button doesn't appear:
- Ensure you're on desktop (not mobile)
- Verify the plugin built correctly
- Check browser console for any errors

If workspaces don't save:
- Check if plugin has write permissions
- Look for validation errors in console

If filtering doesn't work:
- Verify calendar IDs match exactly
- Check category names are spelled correctly
- Ensure Advanced Categorization is enabled for category filters