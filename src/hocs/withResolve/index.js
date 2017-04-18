import { createElement, Component } from 'react';

class Container extends Component {
  constructor(props) {
    super(props);

    this.resolvedData = {};
    this.resolvedDataTargetSize = 0;

    this.observables = [];

    this.state = {
      pending: false,
      error: null,
      resolvedProps: null
    };
  }

  destroyObservers() {
    while (this.observables.length) {
      this.observables.pop().destroy();
    }
  }

  componentWillMount() {
    this.trigger(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.destroyObservers();
    this.trigger(newProps);
  }

  componentWillUnmount() {
    this.destroyObservers();
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
    const { resolve = {}, observe = {}, originalProps } = props;
    const resolveKeys = Object.keys(resolve);
    const observeKeys = Object.keys(observe);

    this.resolvedDataTargetSize = resolveKeys.length + observeKeys.length;

    resolveKeys.forEach((key) => {
      const promise = resolve[key](originalProps);
      // make sure we have a promise, otherwise throw with a clear message
      promise.then(
        (data) => this.addResolvedData(key, data),
        (err) => this.setError(err)
      );
    });

    this.observables = observeKeys.map((key) => {
      const observable = observe[key](originalProps);
      // validate observable, throw meaningful error otherwise
      observable.subscribe(
        (data) => this.addResolvedData(key, data),
        (err) => this.setError(err)
      );
      return observable;
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

