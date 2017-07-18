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

const mergePaginateProps = (props, name, obj) => ({
  ...props,
  paginate: {
    ...props.paginate,
    [name]: obj
  }
});

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
    return mergePaginateProps(props, this.name, {
      getNext: () => {
        this.queueNext();
        return this.get();
      }
    });
  }
}

class PaginatedInfiniteOffsetAndLimitObserveRetriever extends Retriever {
  constructor({ name, getter, getProps, publishData, publishError, pagerConfig }) {
    super({ type: 'observe paginated', name, getter, getProps, publishData, publishError });
    this.pagerConfig = pagerConfig;

    this.pagerSubscriptions = [];

    this.queueNext();
  }

  get() {
    const props = this.getProps();
    const tryToPublish = () => {
      const result = [];
      for (let i = 0; i < this.pagerSubscriptions.length; i++) {
        const p = this.pagerSubscriptions[i];
        if (!p.data) {
          return;
        }
        result.push(...p.data);
      }
      this.publishData(result);
    };
    this.pagerSubscriptions = this.pagerSubscriptions.map((p) => {
      if (!p.subscription) {
        p.subscription = this.getter(props, p.pager).subscribe(
          (data) => { p.data = data; tryToPublish(); },
          this.publishError
        );
      }
      return p;
    });
    return Promise.resolve();
  }

  // add pager object, without subscription
  queueNext() {
    const pagers = this.pagerSubscriptions.map((p) => p.pager);
    const prevPager = pagers[pagers.length - 1] || { limit: null, offset: null };
    const nextPager = this.pagerConfig.getNextPage(prevPager);
    const p = {
      pager: nextPager,
      subscription: null,
      data: null,
      error: null
    };
    this.pagerSubscriptions.push(p);
  }

  mergeProps(props) {
    return mergePaginateProps(props, this.name, {
      getNext: () => {
        this.queueNext();
        return this.get();
      }
    });
  }

  onDestroy() {
    this.pagerSubscriptions.forEach((p) => {
      if (p.subscription && p.subscription.unsubscribe) {
        p.subscription.unsubscribe();
      }
    });
  }
}

const isInfiniteOffsetAndLimitPager = ({ mode, type }) => {
  return mode === PAGINATION.MODE.INFINITE && type === PAGINATION.TYPE.OFFSET_AND_LIMIT;
};

const getResolveRetriever = (pagerConfig) => {
  if (pagerConfig) {
    if (isInfiniteOffsetAndLimitPager(pagerConfig)) {
      return PaginatedInfiniteOffsetAndLimitResolveRetriever;
    }
  }
  return ResolveRetriever;
};

const getObserveRetriever = (pagerConfig) => {
  if (pagerConfig) {
    if (isInfiniteOffsetAndLimitPager(pagerConfig)) {
      return PaginatedInfiniteOffsetAndLimitObserveRetriever;
    }
  }
  return ObserveRetriever;
};

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
    const resolveKeys = Object.keys(resolve);
    const observeKeys = Object.keys(observe);

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

