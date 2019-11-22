var template = `
<div class="graph-panel" ng-class="{'graph-panel--legend-right': ctrl.panel.legend.rightSide}">
  <div class="graph-panel__chart" something-else-graph ng-dblclick="ctrl.zoomOut()">
  </div>

  <div class="graph-legend" something-else-legend></div>
</div>
`;

export default template;
