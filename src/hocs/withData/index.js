import { createElement, Component } from 'react';

class Retriever {
  constructor({ type, name, getter, publishData, publishError }) {
    this.type = type;
    this.name = name;
    this.getter = getter;
    this.publishData = publishData;
    this.publishError = publishError;
  }

  get(props) {
    const promise = this.getter(props);
    if (!promise || !promise.then) {
      throw new Error(`${this.type} for ${this.name} did not return a promise!`);
    }
    promise.then(this.publishData, this.publishError);
  }

  // eslint-disable-next-line class-methods-use-this
  mergeProps(props) {
    return props;
  }

  // eslint-disable-next-line class-methods-use-this
  onDestroy() {}
}

class ResolveRetriever extends Retriever {
  constructor({ name, getter, publishData, publishError }) {
    super({ type: 'resolve', name, getter, publishData, publishError });
  }
}

class ObserveRetriever extends Retriever {
  constructor({ name, getter, publishData, publishError }) {
    super({ type: 'observe', name, getter, publishData, publishError });

    this.subscription = null;
  }

  get(props) {
    const observable = this.getter(props);
    if (!observable || !observable) {
      throw new Error(`${this.type} for ${this.name} did not expose a subscribe function`);
    }
    this.subscription = observable.subscribe(this.publishData, this.publishError);
  }

  onDestroy() {
    if (this.subscription && this.subscription.unsubscribe) {
      this.subscription.unsubscribe();
    }
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
    this.trigger(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.destroy();
    this.setupRetrievers(newProps);
    this.trigger(newProps);
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
    const { resolve = {}, observe = {} } = props;
    const resolveKeys = Object.keys(resolve);
    const observeKeys = Object.keys(observe);


    const publishData = (key) => (data) => this.addResolvedData(key, data);
    const publishError = (key) => (err) => this.setError(key, err);

    resolveKeys.forEach((key) => {
      this.retrievers[key] = new ResolveRetriever({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getter: resolve[key]
      });
    });

    observeKeys.forEach((key) => {
      this.retrievers[key] = new ObserveRetriever({
        name: key,
        publishData: publishData(key),
        publishError: publishError(key),
        getter: observe[key]
      });
    });

    this.resolvedDataTargetSize = resolveKeys.length + observeKeys.length;
  }

  trigger(props) {
    this.setState({ pending: true, error: null });
    const { originalProps } = props;

    Object.keys(this.retrievers).forEach((key) => {
      this.retrievers[key].get(originalProps);
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

    return createElement(component, { ...originalProps, ...resolvedProps });
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

