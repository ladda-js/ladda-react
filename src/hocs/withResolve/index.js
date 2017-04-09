import { createElement, Component } from 'react';

const zip = (xs, ys) => {
  const toTake = Math.min(xs.length, ys.length);
  const zs = [];
  for (let i = 0; i < toTake; i++) {
    zs.push([xs[i], ys[i]]);
  }
  return zs;
};


class Container extends Component {
  constructor(props) {
    super(props);

    this.state = {
      pending: false,
      error: null,
      resolvedProps: null
    };
  }

  componentWillMount() {
    this.trigger(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.trigger(newProps);
  }

  trigger(props) {
    this.setState({ pending: true, error: null });
    const { resolve, originalProps } = props;
    const asList = Object.keys(resolve).map((key) => [key, resolve[key]]);
    const promises = Promise.all(asList.map(el => el[1](originalProps)));
    promises.then(
      (results) => {
        const resolvedProps = zip(asList, results).reduce(
          (mem, el) => {
            mem[el[0][0]] = el[1];
            return mem;
          },
          {}
        );
        this.setState({ pending: false, resolvedProps, error: null });
      },
      error => this.setState({ pending: false, error })
    );
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

