# Business Hours and Background Events - Feature Demo

## Overview

This implementation adds two key visual enhancements to the FullCalendar plugin:

### 1. Business Hours
Visual highlighting of working hours in time-grid views to distinguish work time from personal time.

**Configuration:**
- Enable/disable business hours highlighting
- Choose business days (Monday-Friday, Every day, etc.)
- Set start/end times (e.g., 09:00 - 17:00)

**User Stories Addressed:**
- ✅ Professionals can define 9-5 working hours with visual highlighting
- ✅ Clear visual distinction between work time and personal time
- ✅ Configurable for different work schedules

### 2. Background Events
Events that render "in the background" of the calendar grid, perfect for multi-day periods like vacations, conferences, or non-interactive time blocks.

**Features:**
- Display options: Normal, Background, Inverse Background, Hidden
- Perfect for vacation weeks, class schedules, focus time
- Non-intrusive visual representation

**User Stories Addressed:**
- ✅ Students can block class schedules as background events
- ✅ Deep-work practitioners can create focus time blocks
- ✅ Planners can mark vacation weeks as background events

## Technical Implementation

### Settings Structure
```typescript
// Business Hours Configuration
interface BusinessHoursSettings {
  enabled: boolean;
  daysOfWeek: number[]; // 0=Sunday, 1=Monday, etc.
  startTime: string; // Format: 'HH:mm'
  endTime: string; // Format: 'HH:mm'
}

// Background Events Support
enableBackgroundEvents: boolean;
```

### Event Schema Extension
```typescript
// Events now support display property
display?: 'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none'
```

## Usage Examples

### Business Hours
1. Go to Plugin Settings → Full Calendar
2. Find "Business Hours" section
3. Toggle "Enable business hours"
4. Configure days and times (e.g., Monday-Friday, 09:00-17:00)
5. Business hours will be visually highlighted in time-grid views

### Background Events
1. Create a new event or edit existing event
2. In the event modal, find "Display" dropdown
3. Select "Background event" for vacation, focus time, etc.
4. Event will render as a subtle background element

## Benefits

1. **Visual Context**: Clear understanding of availability at a glance
2. **Professional Use**: Easy meeting scheduling within business hours
3. **Personal Organization**: Better work-life balance visualization
4. **Flexible Configuration**: Adapts to different work schedules
5. **Non-intrusive**: Background events don't clutter the calendar view

## Integration with FullCalendar

This implementation leverages FullCalendar.js built-in features:
- `businessHours` option for highlighting working hours
- `display: 'background'` property for background events
- Maintains full compatibility with existing functionality
- Minimal changes to codebase for maximum reliability