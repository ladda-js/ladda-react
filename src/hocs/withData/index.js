import { createElement, Component, PureComponent } from 'react';
import {
  getResolveRetriever,
  getObserveRetriever,
  getPollRetriever,
  PAGINATION
} from './retrievers';

const TRUE_FN = () => true;
const NULL_FN = () => null;

class Container extends Component {
  constructor(props) {
    super(props);

    this.resolvedData = {};
    this.resolvedDataTargetSize = 0;

    this.timeouts = {
      pendingScheduled: null,
      minimumPendingTime: null
    };

    this.retrievers = {};

    this.subscriptions = [];
    this.pagers = {};

    this.isUnmounting = false;

    this.state = {
      pending: false,
      error: null,
      resolvedProps: null
    };
  }

  destroy() {
    Object.keys(this.retrievers).forEach((key) => {
      this.retrievers[key].onDestroy();
      delete this.retrievers[key];
    });
  }

  componentWillMount() {
    this.setupRetrievers(this.props);
    this.trigger({});
  }

  componentWillReceiveProps(newProps) {
    const { shouldRefetch = TRUE_FN } = newProps;
    if (!shouldRefetch(this.props.originalProps, newProps.originalProps)) {
      return;
    }
    this.destroy();
    this.setupRetrievers(newProps);
    this.trigger(newProps.delays);
  }

  componentWillUnmount() {
    this.isUnmounting = true;
    this.destroy();
  }

  shouldComponentUpdate() {
    return this.rerender;
  }

  safeSetState(...args) {
    if (!this.isUnmounting) {
      this.setState(...args);
    }
  }

  addResolvedData(field, data) {
    this.resolvedData[field] = data;
    if (this.resolvedDataTargetSize === Object.keys(this.resolvedData).length) {
      this.publish();
    }
  }

  withMinimumPendingTime(fn) {
    const { minimumPendingTime } = this.props.delays;
    if (this.state.pending && minimumPendingTime) {
      this.setTimeout('minimumPendingTime', () => {
        this.clearTimeout('minimumPendingTime');
        fn();
      }, minimumPendingTime);
    } else {
      fn();
    }
  }

  publish() {
    this.withMinimumPendingTime(() => {
      this.clearTimeout('pendingScheduled');
      this.rerender = true;
      this.safeSetState({
        pending: false,
        resolvedProps: { ...this.resolvedData },
        error: null
      });
    });
  }

  setError(field, error) {
    this.withMinimumPendingTime(() => {
      this.clearTimeout('pendingScheduled');
      this.safeSetState({
        pending: false,
        error
      });
    });
  }

  hasTimeout(type) {
    return !!this.timeouts[type];
  }

  setTimeout(type, ...args) {
    this.clearTimeout(type);
    this.timeouts[type] = setTimeout(...args);
  }

  clearTimeout(type) {
    const { timeouts } = this;
    if (timeouts[type]) {
      clearTimeout(timeouts[type]);
      timeouts[type] = null;
    }
  }

  setupRetrievers(props) {
    const { resolve = {}, observe = {}, poll = {}, paginate = {}, originalProps } = props;
    const resolveKeys = Object.keys(resolve);
    const observeKeys = Object.keys(observe);
    const pollKeys = Object.keys(poll);

    const getProps = () => originalProps;
    const publishData = (key) => (data) => this.addResolvedData(key, data);
    const publishError = (key) => (err) => this.setError(key, err);

    resolveKeys.forEach((key) => {
      const pagerConfig = paginate[key];
      const Constructor = getResolveRetriever(pagerConfig);
      this.retrievers[key] = new Constructor({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getProps,
        getter: resolve[key],
        pagerConfig
      });
    });

    observeKeys.forEach((key) => {
      const pagerConfig = paginate[key];
      const Constructor = getObserveRetriever(pagerConfig);
      this.retrievers[key] = new Constructor({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getProps,
        getter: observe[key],
        pagerConfig
      });
    });

    pollKeys.forEach((key) => {
      const pagerConfig = paginate[key];
      const Constructor = getPollRetriever(pagerConfig);
      this.retrievers[key] = new Constructor({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getProps,
        getter: poll[key].resolve,
        interval: (poll[key].interval || NULL_FN)(originalProps)
      });
    });

    this.resolvedDataTargetSize = resolveKeys.length + observeKeys.length + pollKeys.length;
  }

  trigger(delays) {
    this.rerender = false;
    const update = () => {
      this.rerender = true;
      this.resolvedData = {};
      this.safeSetState({ pending: true, pendingScheduled: false, error: null });
    };
    if (delays.refetch) {
      this.setTimeout('pendingScheduled', () => {
        if (this.hasTimeout('pendingScheduled')) {
          update();
          this.clearTimeout('pendingScheduled');
        }
      }, delays.refetch);
    } else {
      update();
    }

    Object.keys(this.retrievers).forEach((key) => {
      this.retrievers[key].get();
    });
  }

  render() {
    const { pending, error, resolvedProps } = this.state;
    const { originalProps, errorComponent, pendingComponent, component } = this.props;

    if (pending) {
      return pendingComponent ? createElement(pendingComponent, originalProps) : null;
    }

    if (error) {
      return errorComponent ? createElement(errorComponent, { ...originalProps, error }) : null;
    }

    const nextProps = Object.keys(this.retrievers).reduce(
      (props, key) => this.retrievers[key].mergeProps(props),
      { ...originalProps, ...resolvedProps }
    );
    return createElement(component, nextProps);
  }
}

const DEFAULT_DELAYS = {
  refetch: 0,
  minimumPendingTime: 0
};

export function withData(conf) {
  return component => {
    const delays = { ...DEFAULT_DELAYS, ...(conf.delays || {}) };
    class WithDataWrapper extends PureComponent {
      render() {
        const props = {
          ...conf,
          delays,
          originalProps: this.props,
          component
        };
        return createElement(Container, props);
      }
    }
    return WithDataWrapper;
  };
}

withData.PAGINATION = PAGINATION;

