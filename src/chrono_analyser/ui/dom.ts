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
  header.createEl('h1', { text: '📊 ChronoAnalyser' });
  header.createEl('p', { text: 'Interactive analysis of your time tracking data' });

  const insightsPanel = container.createDiv({
    cls: 'insights-panel',
    attr: { id: 'insightsPanel' }
  });

  const proTipsPanel = insightsPanel.createDiv({
    cls: 'pro-tips-panel',
    attr: { id: 'proTipsPanel', title: 'Click to see the next tip' }
  });
  const proTipsContent = proTipsPanel.createDiv({ cls: 'pro-tips-content' });
  proTipsContent.createEl('span', { cls: 'pro-tips-title', text: 'PRO TIP' });
  proTipsContent.createEl('p', { attr: { id: 'proTipText' } });
  proTipsPanel.createDiv({ cls: 'pro-tips-nav', text: '›' });

  const insightsHeader = insightsPanel.createDiv({ cls: 'insights-header' });
  insightsHeader.createDiv({ cls: 'insights-title', text: '💡 Insights' });
  const insightsActions = insightsHeader.createDiv({ cls: 'insights-actions' });
  insightsActions.createEl('button', {
    cls: 'mod-cta',
    attr: { id: 'generateInsightsBtn' },
    text: 'Generate Insights'
  });
  const configureBtn = insightsActions.createEl('button', {
    cls: 'clickable-icon',
    attr: { id: 'configureInsightsBtn', 'aria-label': 'Configure Insights' }
  });
  setIcon(configureBtn, 'settings');

  const insightsBody = insightsPanel.createDiv({
    cls: 'insights-body',
    attr: { id: 'insightsResultContainer' }
  });
  insightsBody.createDiv({
    cls: 'insights-placeholder',
    text: 'Click "Generate Insights" to analyze your data.'
  });

  const controls = container.createDiv({ cls: 'controls' });

  const filterGroup = controls.createDiv({ cls: 'control-group' });
  const hierarchyItem = filterGroup.createDiv({ cls: 'control-item' });
  hierarchyItem.createEl('label', {
    attr: { for: 'hierarchyFilterInput' },
    text: '📂 Filter by Hierarchy (Calendar Source)'
  });
  const hierarchyWrapper = hierarchyItem.createDiv({ cls: 'autocomplete-wrapper' });
  hierarchyWrapper.createEl('input', {
    attr: {
      id: 'hierarchyFilterInput',
      type: 'text',
      placeholder: 'All Hierarchies (type to filter...)'
    }
  });

  const projectItem = filterGroup.createDiv({ cls: 'control-item' });
  projectItem.createEl('label', {
    attr: { for: 'projectFilterInput' },
    text: '📋 Filter by Project'
  });
  const projectWrapper = projectItem.createDiv({ cls: 'autocomplete-wrapper' });
  projectWrapper.createEl('input', {
    attr: {
      id: 'projectFilterInput',
      type: 'text',
      placeholder: 'All Projects (type to filter...)'
    }
  });

  const categoryItem = filterGroup.createDiv({
    cls: 'control-item',
    attr: { id: 'categoryFilterContainer' }
  });
  categoryItem.createEl('label', {
    attr: { for: 'patternInput' },
    text: '🔍 Filter by Category (e.g., keyword -exclude)'
  });
  categoryItem.createEl('input', {
    attr: { id: 'patternInput', type: 'text', placeholder: 'e.g., Task.* -review' }
  });

  const dateGroup = controls.createDiv({ cls: 'control-group' });
  const dateItem = dateGroup.createDiv({ cls: 'control-item' });
  dateItem.createEl('label', { attr: { for: 'dateRangePicker' }, text: '📅 Date Range' });
  dateItem.createEl('input', {
    attr: {
      id: 'dateRangePicker',
      type: 'text',
      placeholder: 'Select Date Range (YYYY-MM-DD to YYYY-MM-DD)'
    }
  });
  const presetButtons = dateItem.createDiv({ cls: 'date-preset-buttons' });
  setCssProps(presetButtons, { marginTop: '10px' });
  presetButtons.createEl('button', { attr: { id: 'setTodayBtn' }, text: 'Today' });
  presetButtons.createEl('button', { attr: { id: 'setYesterdayBtn' }, text: 'Yesterday' });
  presetButtons.createEl('button', { attr: { id: 'setThisWeekBtn' }, text: 'This Week' });
  presetButtons.createEl('button', { attr: { id: 'setThisMonthBtn' }, text: 'This Month' });
  presetButtons.createEl('button', {
    cls: 'clear-dates-btn',
    attr: { id: 'clearDatesBtn', title: 'Clear date filters' },
    text: '🗑️ Clear Dates'
  });

  const analysisGroup = controls.createDiv({ cls: 'control-group analysis-config-group' });

  const metricItem = analysisGroup.createDiv({ cls: 'control-item' });
  metricItem.createEl('label', { attr: { for: 'metricSelect' }, text: '📏 Metric' });
  const metricSelect = metricItem.createEl('select', { attr: { id: 'metricSelect' } });
  metricSelect.createEl('option', { attr: { value: 'duration' }, text: 'Duration (Hours)' });
  metricSelect.createEl('option', { attr: { value: 'count' }, text: 'Event Count' });

  const analysisTypeItem = analysisGroup.createDiv({ cls: 'control-item' });
  analysisTypeItem.createEl('label', {
    attr: { for: 'analysisTypeSelect' },
    text: '🎯 Analysis Type'
  });
  const analysisTypeSelect = analysisTypeItem.createEl('select', {
    attr: { id: 'analysisTypeSelect' }
  });
  analysisTypeSelect.createEl('option', {
    attr: {
      value: 'pie',
      title: 'Visualize how time is distributed across different categories.'
    },
    text: 'Categorywise (Pie)'
  });
  analysisTypeSelect.createEl('option', {
    attr: {
      value: 'sunburst',
      title: 'Visualize how time is distributed across different categories.'
    },
    text: 'Categorywise (Sunburst)'
  });
  analysisTypeSelect.createEl('option', {
    attr: { value: 'time-series', title: 'Visualize how time spent changes over a period.' },
    text: 'Time-Series Trend'
  });
  analysisTypeSelect.createEl('option', {
    attr: { value: 'activity', title: 'Identify patterns in when tasks are typically performed.' },
    text: 'Activity Patterns'
  });

  const pieContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'pieBreakdownLevelContainer' }
  });
  pieContainer.createEl('label', { attr: { for: 'levelSelect_pie' }, text: '📈 Breakdown Level' });
  const pieSelect = pieContainer.createEl('select', { attr: { id: 'levelSelect_pie' } });
  pieSelect.createEl('option', { attr: { value: 'hierarchy' }, text: 'Hierarchy' });
  pieSelect.createEl('option', { attr: { value: 'project' }, text: 'Project' });
  pieSelect.createEl('option', { attr: { value: 'subproject' }, text: 'Sub-project' });

  const sunburstContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'sunburstBreakdownLevelContainer' }
  });
  sunburstContainer.createEl('label', { attr: { for: 'levelSelect' }, text: '📈 Breakdown Level' });
  const sunburstSelect = sunburstContainer.createEl('select', { attr: { id: 'levelSelect' } });
  sunburstSelect.createEl('option', {
    attr: { value: 'project' },
    text: 'Projects by Hierarchy'
  });
  sunburstSelect.createEl('option', {
    attr: { value: 'subproject' },
    text: 'Sub-projects by Project'
  });

  const timeSeriesGranularityContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'timeSeriesGranularityContainer' }
  });
  timeSeriesGranularityContainer.createEl('label', {
    attr: { for: 'timeSeriesGranularitySelect' },
    text: '🕒 Granularity'
  });
  const timeSeriesGranularitySelect = timeSeriesGranularityContainer.createEl('select', {
    attr: { id: 'timeSeriesGranularitySelect' }
  });
  timeSeriesGranularitySelect.createEl('option', { attr: { value: 'daily' }, text: 'Daily' });
  timeSeriesGranularitySelect.createEl('option', { attr: { value: 'weekly' }, text: 'Weekly' });
  timeSeriesGranularitySelect.createEl('option', { attr: { value: 'monthly' }, text: 'Monthly' });

  const timeSeriesTypeContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'timeSeriesTypeContainer' }
  });
  timeSeriesTypeContainer.createEl('label', {
    attr: { for: 'timeSeriesTypeSelect' },
    text: '📊 Chart Type'
  });
  const timeSeriesTypeSelect = timeSeriesTypeContainer.createEl('select', {
    attr: { id: 'timeSeriesTypeSelect' }
  });
  timeSeriesTypeSelect.createEl('option', { attr: { value: 'line' }, text: 'Overall Trend' });
  timeSeriesTypeSelect.createEl('option', {
    attr: { value: 'stackedArea' },
    text: 'Stacked by Category'
  });

  const timeSeriesStackingLevelContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'timeSeriesStackingLevelContainer' }
  });
  timeSeriesStackingLevelContainer.createEl('label', {
    attr: { for: 'timeSeriesStackingLevelSelect' },
    text: '📚 Stack By'
  });
  const timeSeriesStackingLevelSelect = timeSeriesStackingLevelContainer.createEl('select', {
    attr: { id: 'timeSeriesStackingLevelSelect' }
  });
  timeSeriesStackingLevelSelect.createEl('option', {
    attr: { value: 'hierarchy' },
    text: 'Hierarchy'
  });
  timeSeriesStackingLevelSelect.createEl('option', { attr: { value: 'project' }, text: 'Project' });
  timeSeriesStackingLevelSelect.createEl('option', {
    attr: { value: 'subproject' },
    text: 'Sub-project'
  });

  const activityPatternContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'activityPatternTypeContainer' }
  });
  activityPatternContainer.createEl('label', {
    attr: { for: 'activityPatternTypeSelect' },
    text: '📅 Analyze by'
  });
  const activityPatternTypeSelect = activityPatternContainer.createEl('select', {
    attr: { id: 'activityPatternTypeSelect' }
  });
  activityPatternTypeSelect.createEl('option', {
    attr: {
      value: 'dayOfWeek',
      title: 'Displays a bar chart showing the total hours spent on each day of the week.'
    },
    text: 'Day of Week'
  });
  activityPatternTypeSelect.createEl('option', {
    attr: {
      value: 'hourOfDay',
      title:
        'Displays a bar chart showing the total hours associated with tasks that start in each hour of the day.'
    },
    text: 'Hour of Day (Task Start)'
  });
  activityPatternTypeSelect.createEl('option', {
    attr: {
      value: 'heatmapDOWvsHOD',
      title:
        'Displays a heatmap where rows are days of the week, columns are hours of the day, and the color intensity of each cell represents the total hours for tasks starting at that specific day/hour combination.'
    },
    text: 'Heatmap (Day vs Hour)'
  });

  const dashboardLayout = container.createDiv({ cls: 'dashboard-layout-container' });
  const statsGrid = dashboardLayout.createDiv({
    cls: 'stats-grid hidden-controls',
    attr: { id: 'statsGrid' }
  });
  const totalHoursCard = statsGrid.createDiv({ cls: 'stat-card' });
  totalHoursCard.createDiv({ cls: 'stat-value', attr: { id: 'totalHours' }, text: '0' });
  totalHoursCard.createDiv({ cls: 'stat-label', text: 'Total Hours (Filtered)' });

  const totalFilesCard = statsGrid.createDiv({ cls: 'stat-card' });
  totalFilesCard.createDiv({ cls: 'stat-value', attr: { id: 'totalFiles' }, text: '0' });
  totalFilesCard.createDiv({ cls: 'stat-label', text: 'Files in Filter' });

  const analysisTypeCard = statsGrid.createDiv({ cls: 'stat-card' });
  analysisTypeCard.createDiv({
    cls: 'stat-value small-text',
    attr: { id: 'currentAnalysisTypeStat' },
    text: 'N/A'
  });
  analysisTypeCard.createDiv({ cls: 'stat-label', text: 'Active Analysis' });

  const mainChartContainer = dashboardLayout.createDiv({
    cls: 'main-chart-container hidden-controls',
    attr: { id: 'mainChartContainer' }
  });
  mainChartContainer.createDiv({ attr: { id: 'mainChart' } });

  const logContainer = container.createDiv({
    cls: 'log-container hidden-controls',
    attr: { id: 'errorLogContainer' }
  });
  logContainer.createEl('h2', { text: '📋 Processing Log & Issues' });
  logContainer.createDiv({
    cls: 'log-summary hidden-controls',
    attr: { id: 'cacheStatusDisplay' }
  });
  logContainer.createDiv({
    cls: 'log-summary',
    attr: { id: 'errorLogSummary' },
    text: 'No issues found.'
  });
  logContainer.createDiv({ attr: { id: 'errorLogEntries' } });

  container.createDiv({ cls: 'overlay', attr: { id: 'detailOverlay' } });
  const detailPopup = container.createDiv({ cls: 'detail-popup', attr: { id: 'detailPopup' } });
  const popupHeader = detailPopup.createDiv({ cls: 'popup-header' });
  popupHeader.createEl('h2', {
    cls: 'popup-title',
    attr: { id: 'popupTitle' },
    text: 'Category Details'
  });
  popupHeader.createEl('button', {
    cls: 'close-btn',
    attr: { id: 'popupCloseBtn', title: 'Close' },
    text: '×'
  });
  const popupBody = detailPopup.createDiv({ cls: 'popup-body' });
  popupBody.createDiv({ cls: 'summary-stats', attr: { id: 'popupSummaryStats' } });
  const detailTableContainer = popupBody.createDiv({ cls: 'detail-table-container' });
  const detailTable = detailTableContainer.createEl('table', {
    cls: 'detail-table',
    attr: { id: 'popupDetailTable' }
  });
  const tableHead = detailTable.createEl('thead');
  const tableHeaderRow = tableHead.createEl('tr');
  tableHeaderRow.createEl('th', { text: 'Project' });
  tableHeaderRow.createEl('th', { text: 'Sub-project (Full)' });
  tableHeaderRow.createEl('th', { text: 'Duration (hrs)' });
  tableHeaderRow.createEl('th', { text: 'Date' });
  tableHeaderRow.createEl('th', { text: 'File Path' });
  detailTable.createEl('tbody', { attr: { id: 'popupTableBody' } });
}
