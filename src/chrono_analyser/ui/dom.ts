// Disabling sentence casing rule which incorrectly flags many UI strings
/* eslint-disable obsidianmd/ui/sentence-case */

import { setIcon } from 'obsidian';

const setCssProps = (element: HTMLElement, props: Record<string, string>): void => {
  Object.entries(props).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
};

/**
 * Injects the HTML structure of the analysis dashboard into a given root element.
 * @param rootEl The HTML element to populate.
 */
export function createDOMStructure(rootEl: HTMLElement): void {
  rootEl.empty();

  rootEl.createDiv({ attr: { id: 'toastContainer' } });

  const container = rootEl.createDiv({ cls: 'container' });

  const header = container.createDiv({ cls: 'header' });
  header.createEl('h1', { text: '📊 Chrono analyser' });
  header.createEl('p', { text: 'Interactive analysis of your time tracking data' });

  const insightsPanel = container.createDiv({ cls: 'insights-panel' });
  insightsPanel.id = 'insightsPanel';

  const proTipsPanel = insightsPanel.createDiv({ cls: 'pro-tips-panel' });
  proTipsPanel.id = 'proTipsPanel';
  proTipsPanel.setAttribute('title', 'Click to see the next tip');

  const proTipsContent = proTipsPanel.createDiv({ cls: 'pro-tips-content' });
  proTipsContent.createEl('span', { cls: 'pro-tips-title', text: 'Pro tip' });
  proTipsContent.createEl('p', { attr: { id: 'proTipText' } });
  proTipsPanel.createDiv({ cls: 'pro-tips-nav', text: '›' });

  const insightsHeader = insightsPanel.createDiv({ cls: 'insights-header' });
  insightsHeader.createDiv({ cls: 'insights-title', text: '💡 Insights' });
  const insightsActions = insightsHeader.createDiv({ cls: 'insights-actions' });
  insightsActions.createEl('button', {
    cls: 'mod-cta',
    attr: { id: 'generateInsightsBtn' },
    text: 'Generate insights'
  });
  const configureBtn = insightsActions.createEl('button', {
    cls: 'clickable-icon',
    attr: { id: 'configureInsightsBtn', 'aria-label': 'Configure insights' }
  });
  setIcon(configureBtn, 'settings');

  const insightsBody = insightsPanel.createDiv({ cls: 'insights-body' });
  insightsBody.id = 'insightsResultContainer';
  insightsBody.createDiv({
    cls: 'insights-placeholder',
    text: 'Click "Generate insights" to analyze your data.'
  });

  const controls = container.createDiv({ cls: 'controls' });

  const filterGroup = controls.createDiv({ cls: 'control-group' });
  const hierarchyItem = filterGroup.createDiv({ cls: 'control-item' });
  hierarchyItem.createEl('label', {
    attr: { for: 'hierarchyFilterInput' },
    text: '📂 Filter by hierarchy (calendar source)'
  });
  const hierarchyWrapper = hierarchyItem.createDiv({ cls: 'autocomplete-wrapper' });
  hierarchyWrapper.createEl('input', {
    attr: {
      id: 'hierarchyFilterInput',
      type: 'text',
      placeholder: 'All hierarchies (type to filter...)'
    }
  });

  const projectItem = filterGroup.createDiv({ cls: 'control-item' });
  projectItem.createEl('label', {
    attr: { for: 'projectFilterInput' },
    text: '📋 Filter by project'
  });
  const projectWrapper = projectItem.createDiv({ cls: 'autocomplete-wrapper' });
  projectWrapper.createEl('input', {
    attr: {
      id: 'projectFilterInput',
      type: 'text',
      placeholder: 'All projects (type to filter...)'
    }
  });

  const categoryItem = filterGroup.createDiv({ cls: 'control-item' });
  categoryItem.id = 'categoryFilterContainer';
  categoryItem.createEl('label', {
    attr: { for: 'patternInput' },
    text: '🔍 Filter by category (e.g., keyword -exclude)'
  });
  categoryItem.createEl('input', {
    attr: { id: 'patternInput', type: 'text', placeholder: 'e.g., task.* -review' }
  });

  const dateGroup = controls.createDiv({ cls: 'control-group' });
  const dateItem = dateGroup.createDiv({ cls: 'control-item' });
  dateItem.createEl('label', { attr: { for: 'dateRangePicker' }, text: '📅 Date range' });
  dateItem.createEl('input', {
    attr: {
      id: 'dateRangePicker',
      type: 'text',
      placeholder: 'Select date range (YYYY-MM-DD to YYYY-MM-DD)'
    }
  });
  const presetButtons = dateItem.createDiv({ cls: 'date-preset-buttons' });
  setCssProps(presetButtons, { marginTop: '10px' });
  presetButtons.createEl('button', { attr: { id: 'setTodayBtn' }, text: 'Today' });
  presetButtons.createEl('button', { attr: { id: 'setYesterdayBtn' }, text: 'Yesterday' });
  presetButtons.createEl('button', { attr: { id: 'setThisWeekBtn' }, text: 'This week' });
  presetButtons.createEl('button', { attr: { id: 'setThisMonthBtn' }, text: 'This month' });
  presetButtons.createEl('button', {
    cls: 'clear-dates-btn',
    attr: { id: 'clearDatesBtn', title: 'Clear date filters' },
    text: '🗑️ Clear dates'
  });

  const analysisGroup = controls.createDiv({ cls: 'control-group analysis-config-group' });

  const metricItem = analysisGroup.createDiv({ cls: 'control-item' });
  metricItem.createEl('label', { attr: { for: 'metricSelect' }, text: '📏 Metric' });
  const metricSelect = metricItem.createEl('select', { attr: { id: 'metricSelect' } });
  metricSelect.createEl('option', { attr: { value: 'duration' }, text: 'Duration (hours)' });
  metricSelect.createEl('option', { attr: { value: 'count' }, text: 'Event count' });

  const analysisTypeItem = analysisGroup.createDiv({ cls: 'control-item' });
  analysisTypeItem.createEl('label', {
    attr: { for: 'analysisTypeSelect' },
    text: '🎯 Analysis type'
  });
  const analysisTypeSelect = analysisTypeItem.createEl('select', {
    attr: { id: 'analysisTypeSelect' }
  });
  analysisTypeSelect.createEl('option', {
    attr: {
      value: 'pie',
      title: 'Visualize how time is distributed across different categories.'
    },
    text: 'Categorywise (pie)'
  });
  analysisTypeSelect.createEl('option', {
    attr: {
      value: 'sunburst',
      title: 'Visualize how time is distributed across different categories.'
    },
    text: 'Categorywise (sunburst)'
  });
  analysisTypeSelect.createEl('option', {
    attr: { value: 'time-series', title: 'Visualize how time spent changes over a period.' },
    text: 'Time-series trend'
  });
  analysisTypeSelect.createEl('option', {
    attr: { value: 'activity', title: 'Identify patterns in when tasks are typically performed.' },
    text: 'Activity patterns'
  });

  const pieContainer = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  pieContainer.id = 'pieBreakdownLevelContainer';
  pieContainer.createEl('label', { attr: { for: 'levelSelect_pie' }, text: '📈 Breakdown level' });
  const pieSelect = pieContainer.createEl('select', { attr: { id: 'levelSelect_pie' } });
  pieSelect.createEl('option', { attr: { value: 'hierarchy' }, text: 'Hierarchy' });
  pieSelect.createEl('option', { attr: { value: 'project' }, text: 'Project' });
  pieSelect.createEl('option', { attr: { value: 'subproject' }, text: 'Sub-project' });

  const sunburstContainer = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  sunburstContainer.id = 'sunburstBreakdownLevelContainer';
  sunburstContainer.createEl('label', { attr: { for: 'levelSelect' }, text: '📈 Breakdown level' });
  const sunburstSelect = sunburstContainer.createEl('select', { attr: { id: 'levelSelect' } });
  sunburstSelect.createEl('option', {
    attr: { value: 'project' },
    text: 'Projects by hierarchy'
  });
  sunburstSelect.createEl('option', {
    attr: { value: 'subproject' },
    text: 'Sub-projects by project'
  });

  const timeSeriesContainer = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  timeSeriesContainer.id = 'timeSeriesGranularityContainer';
  timeSeriesContainer.createEl('label', {
    attr: { for: 'timeSeriesGranularitySelect' },
    text: '🕒 Granularity'
  });
  const timeSeriesSelect = timeSeriesContainer.createEl('select', {
    attr: { id: 'timeSeriesGranularitySelect' }
  });
  timeSeriesSelect.createEl('option', { attr: { value: 'day' }, text: 'By day' });
  timeSeriesSelect.createEl('option', { attr: { value: 'week' }, text: 'By week' });
  timeSeriesSelect.createEl('option', { attr: { value: 'month' }, text: 'By month' });

  const activityControls = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  activityControls.id = 'activityPatternControls';
  activityControls.createEl('label', {
    attr: { for: 'activityModeSelect' },
    text: '🗓️ Activity mode'
  });
  const activityModeSelect = activityControls.createEl('select', {
    attr: { id: 'activityModeSelect' }
  });
  activityModeSelect.createEl('option', { attr: { value: 'weekday' }, text: 'By weekday' });
  activityModeSelect.createEl('option', { attr: { value: 'hour' }, text: 'By hour' });

  const activityGrouping = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  activityGrouping.id = 'activityGroupingContainer';
  activityGrouping.createEl('label', {
    attr: { for: 'activityGroupingSelect' },
    text: '🧭 Grouping'
  });
  const activityGroupingSelect = activityGrouping.createEl('select', {
    attr: { id: 'activityGroupingSelect' }
  });
  activityGroupingSelect.createEl('option', { attr: { value: 'hierarchy' }, text: 'Hierarchy' });
  activityGroupingSelect.createEl('option', { attr: { value: 'project' }, text: 'Project' });
  activityGroupingSelect.createEl('option', {
    attr: { value: 'subcategory' },
    text: 'Subcategory'
  });

  const dateInterval = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  dateInterval.id = 'dateIntervalContainer';
  dateInterval.createEl('label', { attr: { for: 'dateIntervalSelect' }, text: '🗓️ Date interval' });
  const dateIntervalSelect = dateInterval.createEl('select', {
    attr: { id: 'dateIntervalSelect' }
  });
  dateIntervalSelect.createEl('option', { attr: { value: 'none' }, text: 'None' });
  dateIntervalSelect.createEl('option', { attr: { value: 'week' }, text: 'By week' });
  dateIntervalSelect.createEl('option', { attr: { value: 'month' }, text: 'By month' });
  dateIntervalSelect.createEl('option', { attr: { value: 'quarter' }, text: 'By quarter' });
  dateIntervalSelect.createEl('option', { attr: { value: 'year' }, text: 'By year' });

  const countMode = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  countMode.id = 'countModeContainer';
  countMode.createEl('label', { attr: { for: 'countModeSelect' }, text: '🔢 Count mode' });
  const countModeSelect = countMode.createEl('select', { attr: { id: 'countModeSelect' } });
  countModeSelect.createEl('option', { attr: { value: 'none' }, text: 'Duration' });
  countModeSelect.createEl('option', { attr: { value: 'count' }, text: 'Count instances' });

  const summaryMode = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  summaryMode.id = 'summaryModeContainer';
  summaryMode.createEl('label', { attr: { for: 'summaryModeSelect' }, text: '📊 Summary' });
  const summaryModeSelect = summaryMode.createEl('select', { attr: { id: 'summaryModeSelect' } });
  summaryModeSelect.createEl('option', { attr: { value: 'sum' }, text: 'Sum' });
  summaryModeSelect.createEl('option', { attr: { value: 'average' }, text: 'Average' });
  summaryModeSelect.createEl('option', { attr: { value: 'max' }, text: 'Maximum' });
  summaryModeSelect.createEl('option', { attr: { value: 'min' }, text: 'Minimum' });

  const heatmapToggle = analysisGroup.createDiv({ cls: 'control-item hidden-controls' });
  heatmapToggle.id = 'heatmapWeekendToggleContainer';
  heatmapToggle.createEl('label', {
    attr: { for: 'heatmapWeekendToggle' },
    text: '📅 Include weekends'
  });
  const heatmapToggleInput = heatmapToggle.createEl('input', {
    attr: { id: 'heatmapWeekendToggle', type: 'checkbox' }
  });
  heatmapToggleInput.checked = true;

  const chartsRow = container.createDiv({ cls: 'charts-row' });
  chartsRow.createDiv({ cls: 'chart-container', attr: { id: 'chartContainer' } });
  const detailsContainer = chartsRow.createDiv({ cls: 'details-container' });
  detailsContainer.id = 'detailsContainer';
  detailsContainer.createEl('h3', { text: 'Breakdown details' });
  detailsContainer.createDiv({ attr: { id: 'detailsTable' } });

  const detailsFooter = container.createDiv({ cls: 'details-footer' });
  detailsFooter.id = 'detailsFooter';
  const totalHours = detailsFooter.createDiv({ cls: 'details-footer-item' });
  totalHours.id = 'detailsTotalHours';
  totalHours.createSpan({ cls: 'details-footer-label', text: 'Total hours:' });
  totalHours.createSpan({ cls: 'details-footer-value', text: '0' });

  const totalEvents = detailsFooter.createDiv({ cls: 'details-footer-item' });
  totalEvents.id = 'detailsTotalEvents';
  totalEvents.createSpan({ cls: 'details-footer-label', text: 'Total events:' });
  totalEvents.createSpan({ cls: 'details-footer-value', text: '0' });

  const average = detailsFooter.createDiv({ cls: 'details-footer-item' });
  average.id = 'detailsAverage';
  average.createSpan({ cls: 'details-footer-label', text: 'Average per day:' });
  average.createSpan({ cls: 'details-footer-value', text: '0' });
}
