import { createElement, Component } from 'react';

class Container extends Component {
  constructor(props) {
    super(props);

    this.resolvedData = {};
    this.resolvedDataTargetSize = 0;

    this.subscribers = [];

    this.state = {
      pending: false,
      error: null,
      resolvedProps: null
    };
  }

  unsubscribe() {
    while (this.subscribers.length) {
      this.subscribers.pop().destroy();
    }
  }

  componentWillMount() {
    this.trigger(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.unsubscribe();
    this.trigger(newProps);
  }

  componentWillUnmount() {
    this.unsubscribe();
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

  setError(error) {
    this.setState({ pending: false, error });
  }

  trigger(props) {
    this.setState({ pending: true, error: null });
    const { resolve = {}, subscribe = {}, originalProps } = props;
    const resolveKeys = Object.keys(resolve);
    const subscribeKeys = Object.keys(subscribe);

    this.resolvedDataTargetSize = resolveKeys.length + subscribeKeys.length;

    resolveKeys.forEach((key) => {
      const promise = resolve[key](originalProps);
      // make sure we have a promise, otherwise throw with a clear message
      promise.then(
        (data) => this.addResolvedData(key, data),
        (err) => this.setError(err)
      );
    });

    this.subscribers = subscribeKeys.map((key) => {
      const subscriber = subscribe[key](originalProps);
      // validate subscriber, throw meaningful error otherwise
      subscriber.subscribe(
        (data) => this.addResolvedData(key, data),
        (err) => this.setError(err)
      );
      return subscriber;
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

export function withResolve(conf) {
  return component => {
    // make it pure again
    return (originalProps) => {
      const props = { ...conf, originalProps, component };
      return createElement(Container, props);
    };
  };
}

