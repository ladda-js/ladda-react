import { createElement, Component } from 'react';

const PAGINATION = {
  TYPE: {
    OFFSET_AND_LIMIT: 'offsetAndLimit'
  },
  MODE: {
    INFINITE: 'infinite'
  },
  PRESET: {
    infiniteOffsetAndLimit: (initialSize, nextSize = initialSize) => ({
      type: PAGINATION.TYPE.OFFSET_AND_LIMIT,
      mode: PAGINATION.MODE.INFINITE,
      getNextPage: ({ limit, offset }) => {
        if (offset === null) {
          return { offset: 0, limit: initialSize };
        }
        return { offset: offset + limit, limit: nextSize };
      }
    })
  }
};


class Retriever {
  constructor({ type, name, getter, getProps, publishData, publishError }) {
    this.type = type;
    this.name = name;
    this.getter = getter;
    this.getProps = getProps;
    this.publishData = publishData;
    this.publishError = publishError;
  }

  get() {
    const promise = this.getter(this.getProps());
    if (!promise || !promise.then) {
      throw new Error(`${this.type} for ${this.name} did not return a promise!`);
    }
    return promise.then(this.publishData, this.publishError);
  }

  // eslint-disable-next-line class-methods-use-this
  mergeProps(props) {
    return props;
  }

  // eslint-disable-next-line class-methods-use-this
  onDestroy() {}
}

class ResolveRetriever extends Retriever {
  constructor({ name, getter, getProps, publishData, publishError }) {
    super({ type: 'resolve', name, getter, getProps, publishData, publishError });
  }
}

class ObserveRetriever extends Retriever {
  constructor({ name, getter, getProps, publishData, publishError }) {
    super({ type: 'observe', name, getter, getProps, publishData, publishError });

    this.subscription = null;
  }

  get() {
    const observable = this.getter(this.getProps());
    if (!observable || !observable) {
      throw new Error(`${this.type} for ${this.name} did not expose a subscribe function`);
    }
    this.subscription = observable.subscribe(this.publishData, this.publishError);
    return Promise.resolve();
  }

  onDestroy() {
    if (this.subscription && this.subscription.unsubscribe) {
      this.subscription.unsubscribe();
    }
  }
}

class PaginatedInfiniteOffsetAndLimitResolveRetriever extends Retriever {
  constructor({ name, getter, getProps, publishData, publishError, pagerConfig }) {
    super({ type: 'resolve paginated', name, getter, getProps, publishData, publishError });
    this.pagerConfig = pagerConfig;

    this.pagers = [];

    this.queueNext();
  }

  get() {
    const props = this.getProps();
    return Promise.all(this.pagers.map((pager) => this.getter(props, pager))).then(
      (lists) => this.publishData(lists.reduce((mem, list) => [...mem, ...list], [])),
      this.publishError
    );
  }

  queueNext() {
    const prevPager = this.pagers[this.pagers.length - 1] || { limit: null, offset: null };
    const nextPager = this.pagerConfig.getNextPage(prevPager);
    this.pagers.push(nextPager);
  }

  mergeProps(props) {
    return {
      ...props,
      paginate: {
        ...props.paginate,
        [this.name]: {
          getNext: () => {
            this.queueNext();
            return this.get();
          }
        }
      }
    };
  }
}

class Container extends Component {
  constructor(props) {
    super(props);

    this.resolvedData = {};
    this.resolvedDataTargetSize = 0;

    this.retrievers = {};

    this.subscriptions = [];
    this.pagers = {};

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
    this.trigger();
  }

  componentWillReceiveProps(newProps) {
    this.destroy();
    this.setupRetrievers(newProps);
    this.trigger();
  }

  componentWillUnmount() {
    this.destroy();
  }

  addResolvedData(field, data) {
    this.resolvedData[field] = data;
    if (this.resolvedDataTargetSize === Object.keys(this.resolvedData).length) {
      this.setState({
        pending: false,
        resolvedProps: { ...this.resolvedData },
        error: null
      });
    }
  }

  setError(field, error) {
    this.setState({ pending: false, error });
  }

  setupRetrievers(props) {
    const { resolve = {}, observe = {}, paginate = {}, originalProps } = props;
    const getProps = () => originalProps;
    const resolveKeys = Object.keys(resolve);
    const observeKeys = Object.keys(observe);


    const publishData = (key) => (data) => this.addResolvedData(key, data);
    const publishError = (key) => (err) => this.setError(key, err);

    resolveKeys.forEach((key) => {
      if (paginate[key]) {
        const pagerConfig = paginate[key];
        const { mode, type } = pagerConfig;
        if (mode === PAGINATION.MODE.INFINITE && type === PAGINATION.TYPE.OFFSET_AND_LIMIT) {
          this.retrievers[key] = new PaginatedInfiniteOffsetAndLimitResolveRetriever({
            name: key,
            publishData: publishData(key),
            publishError: publishError(key),
            getProps,
            getter: resolve[key],
            pagerConfig
          });
        }
      } else {
        this.retrievers[key] = new ResolveRetriever({
          name: key,
          publishData: publishData(key),
          publishError: publishError(key),
          getProps,
          getter: resolve[key]
        });
      }
    });

    observeKeys.forEach((key) => {
      this.retrievers[key] = new ObserveRetriever({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getProps,
        getter: observe[key]
      });
    });

    this.resolvedDataTargetSize = resolveKeys.length + observeKeys.length;
  }

  trigger() {
    this.setState({ pending: true, error: null });

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

export function withData(conf) {
  return component => {
    // make it pure again
    return (originalProps) => {
      const props = { ...conf, originalProps, component };
      return createElement(Container, props);
    };
  };
}

withData.PAGINATION = PAGINATION;

