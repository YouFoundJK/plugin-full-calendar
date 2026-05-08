import { ViewContext } from './ViewContext';

export const VIEW_ZOOM_CONFIG: {
  [viewPrefix: string]: {
    defaultIndex: number;
    levels: { slotDuration: string; slotLabelInterval: string }[];
  };
} = {
  timeGrid: {
    defaultIndex: 1,
    levels: [
      { slotDuration: '01:00:00', slotLabelInterval: '01:00:00' },
      { slotDuration: '00:30:00', slotLabelInterval: '01:00:00' }, // Default
      { slotDuration: '00:15:00', slotLabelInterval: '00:30:00' },
      { slotDuration: '00:05:00', slotLabelInterval: '00:15:00' }
    ]
  },
  resourceTimelineWeek: {
    defaultIndex: 2, // Start more zoomed out
    levels: [
      { slotDuration: '06:00:00', slotLabelInterval: '06:00:00' },
      { slotDuration: '04:00:00', slotLabelInterval: '04:00:00' },
      { slotDuration: '02:00:00', slotLabelInterval: '02:00:00' }, // Default
      { slotDuration: '01:00:00', slotLabelInterval: '01:00:00' }
    ]
  },
  resourceTimeline: {
    defaultIndex: 1, // Same as timeGrid, for resourceTimelineDay
    levels: [
      { slotDuration: '01:00:00', slotLabelInterval: '01:00:00' },
      { slotDuration: '00:30:00', slotLabelInterval: '01:00:00' }, // Default
      { slotDuration: '00:15:00', slotLabelInterval: '00:30:00' },
      { slotDuration: '00:05:00', slotLabelInterval: '00:15:00' }
    ]
  }
};

export class ViewZoomHandler {
  public zoomIndexByView: { [viewType: string]: number } = {};

  constructor(private ctx: ViewContext) {}

  public findBestZoomConfigKey(viewType: string): string | null {
    let bestMatchKey: string | null = null;
    for (const key in VIEW_ZOOM_CONFIG) {
      if (viewType.startsWith(key)) {
        if (!bestMatchKey || key.length > bestMatchKey.length) {
          bestMatchKey = key;
        }
      }
    }
    return bestMatchKey;
  }

  public handleWheelZoom(event: WheelEvent): void {
    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView || !(event.ctrlKey || event.metaKey)) {
      return;
    }

    const viewType = fullCalendarView.view.type;
    const configKey = this.findBestZoomConfigKey(viewType);

    if (!configKey) {
      return; // This view type doesn't support zooming.
    }

    event.preventDefault();

    const config = VIEW_ZOOM_CONFIG[configKey];
    const maxZoom = config.levels.length - 1;
    const currentZoom = this.zoomIndexByView[configKey] ?? config.defaultIndex;

    const direction = event.deltaY < 0 ? 'in' : 'out';

    let newIndex = currentZoom;
    if (direction === 'in' && currentZoom < maxZoom) {
      newIndex++;
    } else if (direction === 'out' && currentZoom > 0) {
      newIndex--;
    }

    if (newIndex !== currentZoom) {
      this.zoomIndexByView[configKey] = newIndex;
      const newZoomLevels = config.levels[newIndex];
      fullCalendarView.setOption('slotDuration', newZoomLevels.slotDuration);
      fullCalendarView.setOption('slotLabelInterval', newZoomLevels.slotLabelInterval);
    }
  }

  public applyZoomForView(viewType: string): void {
    const configKey = this.findBestZoomConfigKey(viewType);
    if (configKey) {
      const config = VIEW_ZOOM_CONFIG[configKey];
      const zoomIndex = this.zoomIndexByView[configKey] ?? config.defaultIndex;
      const zoomLevels = config.levels[zoomIndex];

      this.ctx.fullCalendarView?.setOption('slotDuration', zoomLevels.slotDuration);
      this.ctx.fullCalendarView?.setOption('slotLabelInterval', zoomLevels.slotLabelInterval);
    }
  }
}
