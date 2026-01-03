# Add Monthly View Option for Mobile Devices

## Problem

Mobile users were unable to access the monthly calendar view. The mobile view options only included:
- 3 Days view
- Day view  
- List view

The monthly view (`dayGridMonth`) was only available on desktop, limiting mobile users' ability to see an overview of their calendar.

## Solution

Added `dayGridMonth` (monthly view) to all mobile view configurations:

1. **Settings** - Mobile initial view dropdown now includes "Month" option
2. **View Menu** - Mobile view dropdown menu now includes "Month" option  
3. **Workspace Settings** - Workspace mobile view configuration now includes "Month" option

## Changes

- **src/ui/settings/sections/renderGeneral.ts**: Added `dayGridMonth` to `INITIAL_VIEW_OPTIONS.MOBILE`
- **src/ui/settings/sections/calendars/calendar.ts**: Added "Month" to mobile view dropdown menu
- **src/features/workspaces/ui/WorkspaceModal.ts**: Added monthly view option to workspace mobile view settings

## Testing

Tested by:
- Resizing browser window to mobile width (< 500px) to verify mobile view options appear
- Verifying "Month" appears in mobile view dropdown
- Confirming monthly view can be set as default mobile view in settings
- Testing workspace configuration with monthly view for mobile

## Benefits

- Mobile users can now access monthly calendar overview
- Consistent view options across desktop and mobile (where appropriate)
- Better calendar navigation for mobile users who prefer month view

