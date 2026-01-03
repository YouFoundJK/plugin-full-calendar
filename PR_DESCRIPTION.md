# Fix ICS Date Parsing: Convert VALUE=DATE and YYYYMMDDTHHMMSSZ to ISO Format

## Problem

FullCalendar explicitly documents that it won't accept `19810405`-style date strings. The plugin was encountering `RangeError: Invalid time value` errors when loading ICS calendars (like Cozi) that use:
- `VALUE=DATE:YYYYMMDD` format (e.g., `VALUE=DATE:19810405`)
- `YYYYMMDDTHHMMSSZ` format (e.g., `19810405T123456Z`)

These formats need to be converted to ISO extended format (`1981-04-05` or `1981-04-05T12:34:56Z`) before being passed to FullCalendar.

## Solution

### 1. Enhanced ICS Date Parsing (`src/providers/ics/ics.ts`)
- Added `convertICalDateToISO()` function to convert iCal date strings to ISO extended format
- Improved `icalTimeToLuxon()` with validation and error handling for invalid dates
- Enhanced `icsToOFC()` to validate dates and skip invalid events gracefully
- Added `preprocessICSText()` to normalize date formats in ICS text before parsing

### 2. Fixed FullCalendar Date Conversion (`src/core/interop.ts`)
- Added comprehensive date format validation throughout the conversion pipeline
- Convert `YYYYMMDD` format dates to ISO extended format (`YYYY-MM-DD`) before parsing
- Fixed skip date handling for all-day vs timed events (was trying to combine dates with times for all-day events)
- Added defensive checks to prevent `RangeError: Invalid time value` errors
- Validate DateTime components, UTC timestamps, and Date objects before use

### 3. Fixed Scheduler License Key Warning (`src/ui/settings/sections/calendars/calendar.ts`)
- Only include `schedulerLicenseKey` option when resource-timeline plugin is actually loaded
- Prevents "Unknown option 'schedulerLicenseKey'" warning when advanced categorization is disabled

## Changes

- **src/providers/ics/ics.ts**: Enhanced date parsing and validation
- **src/core/interop.ts**: Comprehensive date format validation and conversion
- **src/ui/settings/sections/calendars/calendar.ts**: Conditional scheduler license key

## Testing

Tested with Cozi calendar ICS feed that was previously failing. The calendar now loads successfully without `RangeError: Invalid time value` errors. Invalid dates are handled gracefully with console warnings instead of crashing.

## Related Issues

Fixes issues with ICS calendars that use non-ISO date formats, particularly:
- `VALUE=DATE:YYYYMMDD` format
- `YYYYMMDDTHHMMSSZ` format

