import { setIcon } from 'obsidian';
import { t } from '../../features/i18n/i18n';

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
  header.createEl('h1', { text: t('chrono.analyser.header') });
  header.createEl('p', { text: t('chrono.analyser.subtitle') });

  const insightsPanel = container.createDiv({
    cls: 'insights-panel',
    attr: { id: 'insightsPanel' }
  });

  const proTipsPanel = insightsPanel.createDiv({
    cls: 'pro-tips-panel',
    attr: { id: 'proTipsPanel', title: t('chrono.analyser.clickNextTip') }
  });
  const proTipsContent = proTipsPanel.createDiv({ cls: 'pro-tips-content' });
  proTipsContent.createSpan({ cls: 'pro-tips-title', text: t('chrono.analyser.proTip') });
  proTipsContent.createEl('p', { attr: { id: 'proTipText' } });
  proTipsPanel.createDiv({ cls: 'pro-tips-nav', text: '›' });

  const insightsHeader = insightsPanel.createDiv({ cls: 'insights-header' });
  insightsHeader.createDiv({ cls: 'insights-title', text: t('chrono.analyser.insights.title') });
  const insightsActions = insightsHeader.createDiv({ cls: 'insights-actions' });
  insightsActions.createEl('button', {
    cls: 'mod-cta',
    attr: { id: 'generateInsightsBtn' },
    text: t('chrono.analyser.insights.generate')
  });
  const configureBtn = insightsActions.createEl('button', {
    cls: 'clickable-icon',
    attr: { id: 'configureInsightsBtn', 'aria-label': t('chrono.analyser.insights.configure') }
  });
  setIcon(configureBtn, 'settings');

  const insightsBody = insightsPanel.createDiv({
    cls: 'insights-body',
    attr: { id: 'insightsResultContainer' }
  });
  insightsBody.createDiv({
    cls: 'insights-placeholder',
    text: t('chrono.analyser.insights.placeholder')
  });

  const controls = container.createDiv({ cls: 'controls' });

  const filterGroup = controls.createDiv({ cls: 'control-group' });
  const hierarchyItem = filterGroup.createDiv({ cls: 'control-item' });
  hierarchyItem.createEl('label', {
    attr: { for: 'hierarchyFilterInput' },
    text: t('chrono.analyser.filters.hierarchy')
  });
  const hierarchyWrapper = hierarchyItem.createDiv({ cls: 'autocomplete-wrapper' });
  hierarchyWrapper.createEl('input', {
    attr: {
      id: 'hierarchyFilterInput',
      type: 'text',
      placeholder: t('chrono.analyser.filters.hierarchyPlaceholder')
    }
  });

  const projectItem = filterGroup.createDiv({ cls: 'control-item' });
  projectItem.createEl('label', {
    attr: { for: 'projectFilterInput' },
    text: t('chrono.analyser.filters.project')
  });
  const projectWrapper = projectItem.createDiv({ cls: 'autocomplete-wrapper' });
  projectWrapper.createEl('input', {
    attr: {
      id: 'projectFilterInput',
      type: 'text',
      placeholder: t('chrono.analyser.filters.projectPlaceholder')
    }
  });

  const categoryItem = filterGroup.createDiv({
    cls: 'control-item',
    attr: { id: 'categoryFilterContainer' }
  });
  categoryItem.createEl('label', {
    attr: { for: 'patternInput' },
    text: t('chrono.analyser.filters.category')
  });
  categoryItem.createEl('input', {
    attr: {
      id: 'patternInput',
      type: 'text',
      placeholder: t('chrono.analyser.filters.categoryPlaceholder')
    }
  });

  const dateGroup = controls.createDiv({ cls: 'control-group' });
  const dateItem = dateGroup.createDiv({ cls: 'control-item' });
  dateItem.createEl('label', {
    attr: { for: 'dateRangePicker' },
    text: t('chrono.analyser.filters.dateRange')
  });
  dateItem.createEl('input', {
    attr: {
      id: 'dateRangePicker',
      type: 'text',
      placeholder: t('chrono.analyser.filters.dateRangePlaceholder')
    }
  });
  const presetButtons = dateItem.createDiv({ cls: 'date-preset-buttons' });
  setCssProps(presetButtons, { marginTop: '10px' });
  presetButtons.createEl('button', {
    attr: { id: 'setTodayBtn' },
    text: t('chrono.analyser.filters.today')
  });
  presetButtons.createEl('button', {
    attr: { id: 'setYesterdayBtn' },
    text: t('chrono.analyser.filters.yesterday')
  });
  presetButtons.createEl('button', {
    attr: { id: 'setThisWeekBtn' },
    text: t('chrono.analyser.filters.thisWeek')
  });
  presetButtons.createEl('button', {
    attr: { id: 'setThisMonthBtn' },
    text: t('chrono.analyser.filters.thisMonth')
  });
  presetButtons.createEl('button', {
    cls: 'clear-dates-btn',
    attr: { id: 'clearDatesBtn', title: t('chrono.analyser.filters.clearDatesTooltip') },
    text: t('chrono.analyser.filters.clearDates')
  });

  const analysisGroup = controls.createDiv({ cls: 'control-group analysis-config-group' });

  const metricItem = analysisGroup.createDiv({ cls: 'control-item' });
  metricItem.createEl('label', {
    attr: { for: 'metricSelect' },
    text: t('chrono.analyser.config.metric')
  });
  const metricSelect = metricItem.createEl('select', { attr: { id: 'metricSelect' } });
  metricSelect.createEl('option', {
    attr: { value: 'duration' },
    text: t('chrono.analyser.config.duration')
  });
  metricSelect.createEl('option', {
    attr: { value: 'count' },
    text: t('chrono.analyser.config.count')
  });

  const analysisTypeItem = analysisGroup.createDiv({ cls: 'control-item' });
  analysisTypeItem.createEl('label', {
    attr: { for: 'analysisTypeSelect' },
    text: t('chrono.analyser.config.analysisType')
  });
  const analysisTypeSelect = analysisTypeItem.createEl('select', {
    attr: { id: 'analysisTypeSelect' }
  });
  analysisTypeSelect.createEl('option', {
    attr: {
      value: 'pie',
      title: t('chrono.analyser.config.tooltips.categorywise')
    },
    text: t('chrono.analyser.config.pie')
  });
  analysisTypeSelect.createEl('option', {
    attr: {
      value: 'sunburst',
      title: t('chrono.analyser.config.tooltips.categorywise')
    },
    text: t('chrono.analyser.config.sunburst')
  });
  analysisTypeSelect.createEl('option', {
    attr: { value: 'time-series', title: t('chrono.analyser.config.tooltips.timeSeries') },
    text: t('chrono.analyser.config.timeSeries')
  });
  analysisTypeSelect.createEl('option', {
    attr: { value: 'activity', title: t('chrono.analyser.config.tooltips.activity') },
    text: t('chrono.analyser.config.activity')
  });

  const pieContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'pieBreakdownLevelContainer' }
  });
  pieContainer.createEl('label', {
    attr: { for: 'levelSelect_pie' },
    text: t('chrono.analyser.config.breakdownLevel')
  });
  const pieSelect = pieContainer.createEl('select', { attr: { id: 'levelSelect_pie' } });
  pieSelect.createEl('option', {
    attr: { value: 'hierarchy' },
    text: t('chrono.analyser.config.hierarchy')
  });
  pieSelect.createEl('option', {
    attr: { value: 'project' },
    text: t('chrono.analyser.config.project')
  });
  pieSelect.createEl('option', {
    attr: { value: 'subproject' },
    text: t('chrono.analyser.config.subproject')
  });

  const sunburstContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'sunburstBreakdownLevelContainer' }
  });
  sunburstContainer.createEl('label', {
    attr: { for: 'levelSelect' },
    text: t('chrono.analyser.config.breakdownLevel')
  });
  const sunburstSelect = sunburstContainer.createEl('select', { attr: { id: 'levelSelect' } });
  sunburstSelect.createEl('option', {
    attr: { value: 'project' },
    text: t('chrono.analyser.config.projectsByHierarchy')
  });
  sunburstSelect.createEl('option', {
    attr: { value: 'subproject' },
    text: t('chrono.analyser.config.subprojectsByProject')
  });

  const timeSeriesGranularityContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'timeSeriesGranularityContainer' }
  });
  timeSeriesGranularityContainer.createEl('label', {
    attr: { for: 'timeSeriesGranularitySelect' },
    text: t('chrono.analyser.config.granularity')
  });
  const timeSeriesGranularitySelect = timeSeriesGranularityContainer.createEl('select', {
    attr: { id: 'timeSeriesGranularitySelect' }
  });
  timeSeriesGranularitySelect.createEl('option', {
    attr: { value: 'daily' },
    text: t('chrono.analyser.config.daily')
  });
  timeSeriesGranularitySelect.createEl('option', {
    attr: { value: 'weekly' },
    text: t('chrono.analyser.config.weekly')
  });
  timeSeriesGranularitySelect.createEl('option', {
    attr: { value: 'monthly' },
    text: t('chrono.analyser.config.monthly')
  });

  const timeSeriesTypeContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'timeSeriesTypeContainer' }
  });
  timeSeriesTypeContainer.createEl('label', {
    attr: { for: 'timeSeriesTypeSelect' },
    text: t('chrono.analyser.config.chartType')
  });
  const timeSeriesTypeSelect = timeSeriesTypeContainer.createEl('select', {
    attr: { id: 'timeSeriesTypeSelect' }
  });
  timeSeriesTypeSelect.createEl('option', {
    attr: { value: 'line' },
    text: t('chrono.analyser.config.overallTrend')
  });
  timeSeriesTypeSelect.createEl('option', {
    attr: { value: 'stackedArea' },
    text: t('chrono.analyser.config.stackedByCategory')
  });

  const timeSeriesStackingLevelContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'timeSeriesStackingLevelContainer' }
  });
  timeSeriesStackingLevelContainer.createEl('label', {
    attr: { for: 'timeSeriesStackingLevelSelect' },
    text: t('chrono.analyser.config.stackBy')
  });
  const timeSeriesStackingLevelSelect = timeSeriesStackingLevelContainer.createEl('select', {
    attr: { id: 'timeSeriesStackingLevelSelect' }
  });
  timeSeriesStackingLevelSelect.createEl('option', {
    attr: { value: 'hierarchy' },
    text: t('chrono.analyser.config.hierarchy')
  });
  timeSeriesStackingLevelSelect.createEl('option', {
    attr: { value: 'project' },
    text: t('chrono.analyser.config.project')
  });
  timeSeriesStackingLevelSelect.createEl('option', {
    attr: { value: 'subproject' },
    text: t('chrono.analyser.config.subproject')
  });

  const activityPatternContainer = analysisGroup.createDiv({
    cls: 'control-item hidden-controls',
    attr: { id: 'activityPatternTypeContainer' }
  });
  activityPatternContainer.createEl('label', {
    attr: { for: 'activityPatternTypeSelect' },
    text: t('chrono.analyser.config.analyzeBy')
  });
  const activityPatternTypeSelect = activityPatternContainer.createEl('select', {
    attr: { id: 'activityPatternTypeSelect' }
  });
  activityPatternTypeSelect.createEl('option', {
    attr: {
      value: 'dayOfWeek',
      title: t('chrono.analyser.config.tooltips.dayOfWeek')
    },
    text: t('chrono.analyser.config.dayOfWeek')
  });
  activityPatternTypeSelect.createEl('option', {
    attr: {
      value: 'hourOfDay',
      title: t('chrono.analyser.config.tooltips.hourOfDay')
    },
    text: t('chrono.analyser.config.hourOfDay')
  });
  activityPatternTypeSelect.createEl('option', {
    attr: {
      value: 'heatmapDOWvsHOD',
      title: t('chrono.analyser.config.tooltips.heatmap')
    },
    text: t('chrono.analyser.config.heatmap')
  });

  const dashboardLayout = container.createDiv({ cls: 'dashboard-layout-container' });
  const statsGrid = dashboardLayout.createDiv({
    cls: 'stats-grid hidden-controls',
    attr: { id: 'statsGrid' }
  });
  const totalHoursCard = statsGrid.createDiv({ cls: 'stat-card' });
  totalHoursCard.createDiv({ cls: 'stat-value', attr: { id: 'totalHours' }, text: '0' });
  totalHoursCard.createDiv({ cls: 'stat-label', text: t('chrono.analyser.stats.totalHours') });

  const totalFilesCard = statsGrid.createDiv({ cls: 'stat-card' });
  totalFilesCard.createDiv({ cls: 'stat-value', attr: { id: 'totalFiles' }, text: '0' });
  totalFilesCard.createDiv({ cls: 'stat-label', text: t('chrono.analyser.stats.filesInFilter') });

  const analysisTypeCard = statsGrid.createDiv({ cls: 'stat-card' });
  analysisTypeCard.createDiv({
    cls: 'stat-value small-text',
    attr: { id: 'currentAnalysisTypeStat' },
    text: 'N/A'
  });
  analysisTypeCard.createDiv({
    cls: 'stat-label',
    text: t('chrono.analyser.stats.activeAnalysis')
  });

  const mainChartContainer = dashboardLayout.createDiv({
    cls: 'main-chart-container hidden-controls',
    attr: { id: 'mainChartContainer' }
  });
  mainChartContainer.createDiv({ attr: { id: 'mainChart' } });

  const logContainer = container.createDiv({
    cls: 'log-container hidden-controls',
    attr: { id: 'errorLogContainer' }
  });
  logContainer.createEl('h2', { text: t('chrono.analyser.log.title') });
  logContainer.createDiv({
    cls: 'log-summary hidden-controls',
    attr: { id: 'cacheStatusDisplay' }
  });
  logContainer.createDiv({
    cls: 'log-summary',
    attr: { id: 'errorLogSummary' },
    text: t('chrono.analyser.log.noIssues')
  });
  logContainer.createDiv({ attr: { id: 'errorLogEntries' } });

  container.createDiv({ cls: 'overlay', attr: { id: 'detailOverlay' } });
  const detailPopup = container.createDiv({ cls: 'detail-popup', attr: { id: 'detailPopup' } });
  const popupHeader = detailPopup.createDiv({ cls: 'popup-header' });
  popupHeader.createEl('h2', {
    cls: 'popup-title',
    attr: { id: 'popupTitle' },
    text: t('chrono.analyser.details.title')
  });
  popupHeader.createEl('button', {
    cls: 'close-btn',
    attr: { id: 'popupCloseBtn', title: t('chrono.analyser.details.close') },
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
  tableHeaderRow.createEl('th', { text: t('chrono.analyser.details.project') });
  tableHeaderRow.createEl('th', { text: t('chrono.analyser.details.subproject') });
  tableHeaderRow.createEl('th', { text: t('chrono.analyser.details.duration') });
  tableHeaderRow.createEl('th', { text: t('chrono.analyser.details.date') });
  tableHeaderRow.createEl('th', { text: t('chrono.analyser.details.filePath') });
  detailTable.createEl('tbody', { attr: { id: 'popupTableBody' } });
}
