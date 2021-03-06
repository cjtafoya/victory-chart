import React, {Component, PropTypes} from "react";
import { assign, groupBy, isEqual } from "lodash";
import ChartHelpers from "../victory-chart/helper-methods";
import ZoomHelpers from "./helper-methods";
import {VictoryClipContainer, Helpers, PropTypes as CustomPropTypes, Timer} from "victory-core";

const fallbackProps = {
  width: 450,
  height: 300,
  padding: 50
};

class VictoryZoom extends Component {
  static displayName = "VictoryZoom";
  static role = "zoom";

  static propTypes = {
    children: PropTypes.node,
    zoomDomain: PropTypes.shape({
      x: CustomPropTypes.domain,
      y: CustomPropTypes.domain
    }),
    onDomainChange: PropTypes.func,
    clipContainerComponent: PropTypes.element.isRequired,
    allowZoom: PropTypes.bool
  }

  static childContextTypes = {
    getTimer: React.PropTypes.func
  }

  static defaultProps = {
    clipContainerComponent: <VictoryClipContainer/>,
    allowZoom: true
  }

  constructor(props) {
    super(props);

    const chart = React.Children.only(this.props.children);
    const [rangex1, rangex0] = Helpers.getRange(
      Helpers.modifyProps(chart.props, {}, "chart"), // TODO: Don't presume chart role
      "x"
    );

    this.plottableWidth = rangex0 - rangex1;
    this.width = chart.props.width || fallbackProps.width;
    this.state = { domain: props.zoomDomain || this.getDataDomain() };

    this.events = this.getEvents(props.allowZoom);
    this.clipDataComponents = this.clipDataComponents.bind(this);
    this.getTimer = this.getTimer.bind(this);
  }

  getChildContext() {
    return {
      getTimer: this.getTimer
    };
  }

  getTimer() {
    if (!this.timer) {
      this.timer = new Timer();
    }
    return this.timer;
  }

  componentWillMount() {
    this.getChartRef = (chart) => { this.chartRef = chart; };
  }

 componentWillUnmount() {
   this.getTimer().stop();
 }

 componentWillReceiveProps({allowZoom: nextAllowZoom, zoomDomain: nextDomain}) {
   const {allowZoom, zoomDomain} = this.props;
   if (!isEqual(zoomDomain, nextDomain)) {
     this.setState({domain: nextDomain});
   }

   if (allowZoom !== nextAllowZoom) {
     this.events = this.getEvents(nextAllowZoom);
   }
 }

  getDataDomain() {
    const chart = React.Children.only(this.props.children);
    const chartChildren = React.Children.toArray(chart);

    return {
      x: ChartHelpers.getDomain(chart.props, "x", chartChildren)
    };
  }

  getEvents(allowZoom) {
    return [{
      target: "parent",
      eventHandlers: {
        onMouseDown: (evt) => {
          this.targetBounds = this.chartRef.getSvgBounds();
          const x = evt.clientX - this.targetBounds.left;
          this.isPanning = true;
          this.startX = x;
          this.lastDomain = this.state.domain;
        },
        onMouseUp: () => { this.isPanning = false; },
        onMouseLeave: () => { this.isPanning = false; },
        onMouseMove: (evt) => {
          const clientX = evt.clientX;
          if (this.isPanning) {
            requestAnimationFrame(() => { // eslint-disable-line no-undef
              const domain = this.getDataDomain();
              const delta = this.startX - (clientX - this.targetBounds.left);
              const calculatedDx = delta / this.getDomainScale();
              const nextXDomain = ZoomHelpers.pan(this.lastDomain.x, domain.x, calculatedDx);
              this.setDomain({x: nextXDomain});
              this.setState({domain: {x: nextXDomain}});
            });
          }
        },
        ...allowZoom && {onWheel: (evt) => {
          evt.preventDefault();
          const deltaY = evt.deltaY;
          requestAnimationFrame(() => { // eslint-disable-line no-undef
            const {x} = this.state.domain;
            const xBounds = this.getDataDomain().x;

            // TODO: Check scale factor
            const nextXDomain = ZoomHelpers.scale(x, xBounds, 1 + (deltaY / 300));
            this.setDomain({x: nextXDomain});
          });
        }}
      }
    }];
  }

  setDomain(domain) {
    const {onDomainChange} = this.props;
    this.getTimer().bypassAnimation();
    this.setState({domain}, () => this.getTimer().resumeAnimation());
    if (onDomainChange) { onDomainChange(domain); }
  }

  getDomainScale() {
    const {x: [from, to]} = this.lastDomain;
    const ratio = this.targetBounds.width / this.width;
    const absoluteAxisWidth = ratio * this.plottableWidth;
    return absoluteAxisWidth / (to - from);
  }

  clipDataComponents(children, props) {
    const {data, axes = []} = groupBy(children, (child) => {
      return child.type.displayName === "VictoryAxis"
      ? "axes"
      : "data";
    });

    const [rangex0, rangex1] = Helpers.getRange(props, "x");

    return [
      React.cloneElement(this.props.clipContainerComponent, {
        key: "ZoomClipContainer",
        clipWidth: rangex1 - rangex0,
        clipHeight: fallbackProps.height,
        translateX: rangex0,
        children: data
      }),
      ...axes
    ];
  }

  renderChart(chartElement, props) {
    return React.cloneElement(chartElement, props);
  }

  render() {
    const chart = React.Children.only(this.props.children);
    const nextProps = assign({}, chart.props, {
      events: chart.props.events ? chart.props.events.unshift(...this.events) : this.events,
      domain: this.state.domain,
      ref: this.getChartRef,
      modifyChildren: this.clipDataComponents
    });

    return this.renderChart(chart, nextProps);
  }

}
export default VictoryZoom;
