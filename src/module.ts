
import { GraphRenderer } from './graph_renderer';
import { GraphLegend } from './graph_legend';
import './series_overrides_ctrl';
import './thresholds_form';

import template from './template';
import _ from 'lodash';
import config from 'grafana/app/core/config';
import { MetricsPanelCtrl, alertTab } from 'grafana/app/plugins/sdk';
import { DataProcessor } from './data_processor';
import { axesEditorComponent } from './axes_editor';

import $ from 'jquery';

class GraphCtrl extends MetricsPanelCtrl {
  static template = template;

  hiddenSeries: any = {};
  seriesList: any = [];
  dataList: any = [];
  annotations: any = [];
  alertState: any;

  _panelPath: any;

  annotationsPromise: any;
  dataWarning: any;
  colors: any = [];
  subTabIndex: number;
  processor: DataProcessor;

  private _graphRenderer: GraphRenderer;
  private _graphLegend: GraphLegend;

  panelDefaults = {
    // datasource name, null = default datasource
    datasource: null,
    // sets client side (flot) or native graphite png renderer (png)
    renderer: 'flot',
    yaxes: [
      {
        label: null,
        show: true,
        logBase: 1,
        min: null,
        max: null,
        format: 'short',
      },
      {
        label: null,
        show: true,
        logBase: 1,
        min: null,
        max: null,
        format: 'short',
      },
    ],
    xaxis: {
      show: true,
      mode: 'time',
      name: null,
      values: [],
      buckets: null,
      customDateFormatShow: false,
      customDateFormat: ''
    },
    // show/hide lines
    lines: true,
    // fill factor
    fill: 1,
    // line width in pixels
    linewidth: 1,
    // show/hide dashed line
    dashes: false,
    // length of a dash
    dashLength: 10,
    // length of space between two dashes
    spaceLength: 10,
    // show hide points
    points: false,
    // point radius in pixels
    pointradius: 5,
    // show hide bars
    bars: false,
    // enable/disable stacking
    stack: false,
    // stack percentage mode
    percentage: false,
    // legend options
    legend: {
      show: true, // disable/enable legend
      values: false, // disable/enable legend values
      min: false,
      max: false,
      current: false,
      total: false,
      avg: false,
    },
    // how null points should be handled
    nullPointMode: 'null',
    // staircase line mode
    steppedLine: false,
    // tooltip options
    tooltip: {
      value_type: 'individual',
      shared: true,
      sort: 0,
    },
    // time overrides
    timeFrom: null,
    timeShift: null,
    // metric queries
    targets: [{}],
    // series color overrides
    aliasColors: {},
    // other style overrides
    seriesOverrides: [],
    thresholds: [],
    displayBarsSideBySide: false,
    labelAlign: 'left',
    calcul: {
      operation: '%',
      color: 'FFFFFF',
      name: 'Calcul-series',
      show: true
    }
  };

  /** @ngInject */
  constructor($scope, $injector, private annotationsSrv, private popoverSrv, private contextSrv) {
    super($scope, $injector);

    // hack to show alert threshold
    // visit link to find out why
    // https://github.com/grafana/grafana/blob/master/public/app/features/alerting/threshold_mapper.ts#L3
    // should make it 'corpglory-multibar-graph-panel' before save
    // https://github.com/CorpGlory/grafana-multibar-graph-panel/issues/6#issuecomment-377238048
    // this.panel.type='graph';

    _.defaults(this.panel, this.panelDefaults);
    _.defaults(this.panel.tooltip, this.panelDefaults.tooltip);
    _.defaults(this.panel.legend, this.panelDefaults.legend);
    _.defaults(this.panel.xaxis, this.panelDefaults.xaxis);
    _.defaults(this.panel.calcul, this.panelDefaults.calcul);

    this.processor = new DataProcessor(this.panel);

    this.events.on('render', this.onRender.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
    this.events.on('data-snapshot-load', this.onDataSnapshotLoad.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('init-panel-actions', this.onInitPanelActions.bind(this));
  }

  link(scope, elem, attrs, ctrl) {
    var $graphElem = $(elem[0]).find('#multibar-graph-panel');
    var $legendElem = $(elem[0]).find('#multibar-graph-legend');
    this._graphRenderer = new GraphRenderer(
      $graphElem, this.timeSrv, this.contextSrv, this.$scope
    );
    this._graphLegend = new GraphLegend($legendElem, this.popoverSrv, this.$scope);
  }

  onInitEditMode() {
    var partialPath = this.panelPath + 'partials';
    this.addEditorTab('Axes', axesEditorComponent, 2);
    this.addEditorTab('Legend', `${partialPath}/tab_legend.html`, 3);
    this.addEditorTab('Display', `${partialPath}/tab_display.html`, 4);

    if (config.alertingEnabled) {
      this.addEditorTab('Alert', alertTab, 5);
    }

    this.subTabIndex = 0;
  }

  onInitPanelActions(actions) {
    actions.push({ text: 'Export CSV', click: 'ctrl.exportCsv()' });
    actions.push({ text: 'Toggle legend', click: 'ctrl.toggleLegend()' });
  }

  issueQueries(datasource) {
    this.annotationsPromise = this.annotationsSrv.getAnnotations({
      dashboard: this.dashboard,
      panel: this.panel,
      range: this.range,
    });
    return super.issueQueries(datasource);
  }

  zoomOut(evt) {
    this.publishAppEvent('zoom-out', 2);
  }

  onDataSnapshotLoad(snapshotData) {
    this.annotationsPromise = this.annotationsSrv.getAnnotations({
      dashboard: this.dashboard,
      panel: this.panel,
      range: this.range,
    });
    this.onDataReceived(snapshotData);
  }

  onDataError(err) {
    this.seriesList = [];
    this.annotations = [];
    this.render([]);
  }

  onDataReceived(dataList) {
    this.dataList = dataList;
    this.seriesList = this.processor.getSeriesList({
      dataList: dataList,
      range: this.range,
    });

    this.dataWarning = null;
    const datapointsCount = this.seriesList.reduce((prev, series) => {
      return prev + series.datapoints.length;
    }, 0);

    if (datapointsCount === 0) {
      this.dataWarning = {
        title: 'No data points',
        tip: 'No datapoints returned from data query',
      };
    } else {
      for (let series of this.seriesList) {
        if (series.isOutsideRange) {
          this.dataWarning = {
            title: 'Data points outside time range',
            tip: 'Can be caused by timezone mismatch or missing time filter in query',
          };
          break;
        }
      }
    }

    this.annotationsPromise.then(
      result => {
        this.loading = false;
        this.alertState = result.alertState;
        this.annotations = result.annotations;
        this.render(this.seriesList);
      },
      () => {
        this.loading = false;
        this.render(this.seriesList);
      }
    );
  }

  onRender(data) {
    if (!this.seriesList) {
      return;
    }

    for (let series of this.seriesList) {
      series.applySeriesOverrides(this.panel.seriesOverrides);

      if (series.unit) {
        this.panel.yaxes[series.yaxis - 1].format = series.unit;
      }
    }

    this._graphRenderer.render(data);
    this._graphLegend.render();

    this._graphRenderer.renderPanel();
  }

  changeSeriesColor(series, color) {
    series.color = color;
    this.panel.aliasColors[series.alias] = series.color;
    this.render();
  }

  toggleSeries(serie, event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      if (this.hiddenSeries[serie.alias]) {
        delete this.hiddenSeries[serie.alias];
      } else {
        this.hiddenSeries[serie.alias] = true;
      }
    } else {
      this.toggleSeriesExclusiveMode(serie);
    }
    this.render();
  }

  toggleSeriesExclusiveMode(serie) {
    var hidden = this.hiddenSeries;

    if (hidden[serie.alias]) {
      delete hidden[serie.alias];
    }

    // check if every other series is hidden
    var alreadyExclusive = _.every(this.seriesList, value => {
      if (value.alias === serie.alias) {
        return true;
      }

      return hidden[value.alias];
    });

    if (alreadyExclusive) {
      // remove all hidden series
      _.each(this.seriesList, value => {
        delete this.hiddenSeries[value.alias];
      });
    } else {
      // hide all but this serie
      _.each(this.seriesList, value => {
        if (value.alias === serie.alias) {
          return;
        }

        this.hiddenSeries[value.alias] = true;
      });
    }
  }

  toggleAxis(info) {
    var override: any = _.find(this.panel.seriesOverrides, { alias: info.alias });
    if (!override) {
      override = { alias: info.alias };
      this.panel.seriesOverrides.push(override);
    }
    info.yaxis = override.yaxis = info.yaxis === 2 ? 1 : 2;
    this.render();
  }

  addSeriesOverride(override) {
    this.panel.seriesOverrides.push(override || {});
  }

  removeSeriesOverride(override) {
    this.panel.seriesOverrides = _.without(this.panel.seriesOverrides, override);
    this.render();
  }

  toggleLegend() {
    this.panel.legend.show = !this.panel.legend.show;
    this.refresh();
  }

  legendValuesOptionChanged() {
    var legend = this.panel.legend;
    legend.values = legend.min || legend.max || legend.avg || legend.current || legend.total;
    this.render();
  }

  exportCsv() {
    var scope = this.$scope.$new(true);
    scope.seriesList = this.seriesList;
    this.publishAppEvent('show-modal', {
      templateHtml: '<export-data-modal data="seriesList"></export-data-modal>',
      scope,
      modalClass: 'modal--narrow',
    });
  }

  get panelPath() {
    if (this._panelPath === undefined) {
      this._panelPath = './public/plugins/' + this.pluginId + '/';
    }
    return this._panelPath;
  }
}

export { GraphCtrl, GraphCtrl as PanelCtrl };
