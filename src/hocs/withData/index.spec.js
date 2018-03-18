/* eslint-disable no-unused-expressions */
import { Component, createElement } from 'react';
import ReactTestUtils from 'react-dom/test-utils'; // ES6
import { build } from 'ladda-cache';
import { observable } from 'ladda-observable';
import sinon from 'sinon';

import { withData } from '.';

const delay = (t = 1) => new Promise(res => setTimeout(() => res(), t));

const peter = { id: 'peter', name: 'peter' };
const gernot = { id: 'gernot', name: 'gernot' };
const robin = { id: 'robin', name: 'robin' };
const paulo = { id: 'paulo', name: 'paulo '};
const timur = { id: 'timur', name: 'timur '};
const createConfig = () => {
  const users = [peter, gernot, robin, paulo, timur].reduce((m, u) => {
    m[u.id] = u;
    return m;
  }, {});

  const getUser = (id) => Promise.resolve(users[id]);
  getUser.operation = 'READ';
  getUser.byId = true;

  const getUsers = () => Promise.resolve(Object.values(users));
  getUsers.operation = 'READ';

  const getUsersPaginated = ({ limit, offset }) => Promise.resolve(
    Object.values(users).slice(offset, limit + offset)
  );
  getUsersPaginated.operation = 'READ';

  const getUsersWithCursor = ({ cursor, limit }) => {
    const vals = Object.values(users);
    const i = cursor ? vals.map(v => v.id).indexOf(cursor) : 0;
    const result = vals.slice(i, i + limit);
    result.cursor = (i + limit) < vals.length ? vals[i + limit].id : null;
    return Promise.resolve(result);
  };
  getUsersWithCursor.operation = 'READ';

  const updateUser = (nextUser) => {
    const { id } = nextUser;
    const user = users[id];
    users[id] = { ...user, ...nextUser };
    return Promise.resolve(users[id]);
  };
  updateUser.operation = 'UPDATE';

  const removeUser = (id) => {
    delete users[id];
    Promise.resolve();
  };
  removeUser.operation = 'DELETE';

  return {
    user: {
      api: {
        getUser,
        getUsers,
        getUsersPaginated,
        getUsersWithCursor,
        updateUser,
        removeUser
      }
    }
  };
};

class Logger {
  constructor() {
    this.logs = [];
  }

  log(l) {
    this.logs.push({ ...l, t: Date.now() });
  }

  getByType(t) {
    return this.logs.filter(l => l.type === t);
  }

  getRenders() {
    return this.getByType('render');
  }

  getCallSequence() {
    return this.logs.map(l => l.type);
  }

  getRenderProps(count) {
    return this.getRenders()[count].props;
  }

  expectRenderCount(count) {
    expect(this.getRenders().length).to.equal(count);
  }
}

const createSpyComponent = () => {
  const logger = new Logger();
  const log = (type, props, generation) => logger.log({ type, props, generation });

  let generation = 0;

  class SpyComponent extends Component {
    constructor() {
      super();
      this.generation = generation++;
    }

    componentWillMount() {
      log('componentWillMount', this.props, this.generation);
    }

    componentWillUnmount() {
      log('componentWillUnmount', this.props, this.generation);
    }

    // eslint-disable-next-line class-methods-use-this
    componentWillReceiveProps(nextProps) {
      log('componentWillReceiveProps', nextProps, this.generation);
    }

    render() {
      log('render', this.props, this.generation);
      return null;
    }
  }

  return { spy: SpyComponent, logger };
};

class StateContainer extends Component {
  constructor(props) {
    super(props);
    this.state = props.componentProps;
  }
  render() {
    return createElement(this.props.component, { ...this.props.mapState(this.state) });
  }
}

const render = (component, componentProps, ref, mapState = (t => t)) => {
  const c = () => createElement(StateContainer, { ref, component, componentProps, mapState });
  return ReactTestUtils.renderIntoDocument(createElement(c));
};

describe('withData', () => {
  it('passes the original properties down', () => {
    const api = build(createConfig());
    const { spy, logger } = createSpyComponent();
    const comp = withData({
      resolve: {
        users: () => api.user.getUsers(),
        user: ({ userId }) => api.user.getUser(userId)
      }
    })(spy);

    render(comp, { userId: 'peter' });

    return delay().then(() => {
      logger.expectRenderCount(1);
      const props = logger.getRenderProps(0);
      expect(props.userId).to.equal('peter');
    });
  });

  it('does not re-render when no props to it have changed', () => {
    const api = build(createConfig());
    const { spy, logger } = createSpyComponent();
    const comp = withData({
      resolve: {
        users: () => api.user.getUsers(),
        user: ({ userId }) => api.user.getUser(userId)
      }
    })(spy);

    let stateContainer = null;

    render(comp, { userId: 'peter' }, c => { stateContainer = c; }, ({ userId }) => ({ userId }));

    return delay().then(() => {
      logger.expectRenderCount(1);
      stateContainer.setState({ x: 'x' });
      return delay().then(() => {
        logger.expectRenderCount(1);
        stateContainer.setState({ userId: 'gernot' });
        return delay().then(() => {
          logger.expectRenderCount(2);
        });
      });
    });
  });

  it('allows to observe changes', () => {
    const api = build(createConfig(), [observable()]);
    const { spy, logger } = createSpyComponent();
    const comp = withData({
      observe: {
        user: ({ userId }) => api.user.getUser.createObservable(userId)
      }
    })(spy);

    render(comp, { userId: 'peter' });

    return delay().then(() => {
      logger.expectRenderCount(1);
      const firstProps = logger.getRenderProps(0);
      expect(firstProps.user).to.deep.equal(peter);

      return api.user.updateUser({ id: 'peter', name: 'crona' }).then((nextUser) => {
        return delay().then(() => {
          logger.expectRenderCount(2);
          const secondProps = logger.getRenderProps(1);
          expect(secondProps.user).to.deep.equal(nextUser);
        });
      });
    });
  });

  describe('delay', () => {
    it('does not show pending state immediately when delay is requested', () => {
      const api = build(createConfig());
      const { spy, logger } = createSpyComponent();
      const { spy: pendingSpy, logger: pendingLogger } = createSpyComponent();
      const comp = withData({
        resolve: {
          user: ({ userId }) => api.user.getUser(userId)
        },
        pendingComponent: pendingSpy,
        delays: {
          refetch: 100
        }
      })(spy);

      let stateContainer = null;

      render(comp, { userId: 'peter' }, c => { stateContainer = c; }, ({ userId }) => ({ userId }));

      return delay().then(() => {
        pendingLogger.expectRenderCount(1);
        logger.expectRenderCount(1);
        stateContainer.setState({ userId: 'gernot' });
        logger.expectRenderCount(2);
        return delay().then(() => {
          pendingLogger.expectRenderCount(1);
          logger.expectRenderCount(3);
        });
      });
    });
  });

  describe('pagination', () => {
    it('allows to paginate with limit and offset (resolve)', () => {
      const api = build(createConfig(), [observable()]);
      const { spy, logger } = createSpyComponent();
      const comp = withData({
        resolve: {
          users: (props, { limit, offset }) => api.user.getUsersPaginated({ limit, offset })
        },
        paginate: {
          users: withData.PAGINATION.PRESET.infiniteOffsetAndLimit(2, 1)
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        logger.expectRenderCount(1);
        const firstProps = logger.getRenderProps(0);
        expect(firstProps.users).to.deep.equal([peter, gernot]);

        return firstProps.paginate.users.getNext().then(() => {
          return delay().then(() => {
            logger.expectRenderCount(2);
            const secondProps = logger.getRenderProps(1);
            expect(secondProps.users).to.deep.equal([peter, gernot, robin]);
          });
        });
      });
    });

    it('allows to paginate with limit and offset (observe)', () => {
      const api = build(createConfig(), [observable()]);
      const { spy, logger } = createSpyComponent();
      const comp = withData({
        observe: {
          users: (props, { limit, offset }) => api.user.getUsersPaginated.createObservable({
            limit,
            offset
          })
        },
        paginate: {
          users: withData.PAGINATION.PRESET.infiniteOffsetAndLimit(2, 1)
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        logger.expectRenderCount(1);
        const firstProps = logger.getRenderProps(0);
        expect(firstProps.users).to.deep.equal([peter, gernot]);

        return firstProps.paginate.users.getNext().then(() => {
          logger.expectRenderCount(2);
          const secondProps = logger.getRenderProps(1);
          expect(secondProps.users).to.deep.equal([peter, gernot, robin]);

          return api.user.updateUser({ id: 'peter', name: 'crona' }).then((nextUser) => {
            return delay().then(() => {
              logger.expectRenderCount(4);
              const thirdProps = logger.getRenderProps(2);
              expect(thirdProps.users[0]).to.deep.equal(nextUser);
            });
          });
        });
      });
    });

    it('allows to paginate with a cursor', () => {
      const api = build(createConfig(), [observable()]);
      const { spy, logger } = createSpyComponent();
      const comp = withData({
        resolve: {
          users: (props, cursor) => api.user.getUsersWithCursor({ cursor, limit: 2 })
        },
        paginate: {
          users: {
            ...withData.PAGINATION.PRESET.infiniteCursor(),
            getCursor: (r) => r.cursor
          }
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        logger.expectRenderCount(1);
        const firstProps = logger.getRenderProps(0);
        expect(firstProps.users.length).to.equal(2);
        expect(firstProps.users).to.contain(peter);
        expect(firstProps.users).to.contain(gernot);

        return firstProps.paginate.users.getNext().then(() => {
          return delay().then(() => {
            logger.expectRenderCount(2);
            const secondProps = logger.getRenderProps(1);
            expect(secondProps.users).to.deep.equal([peter, gernot, robin, paulo]);
            expect(secondProps.paginate.users.hasNext).to.be.true;

            return secondProps.paginate.users.getNext().then(() => {
              logger.expectRenderCount(3);
              const thirdProps = logger.getRenderProps(2);
              expect(thirdProps.users).to.deep.equal([peter, gernot, robin, paulo, timur]);
              expect(thirdProps.paginate.users.hasNext).to.be.false;
            });
          });
        });
      });
    });
  });

  describe('poll', () => {
    it('does not poll when interval is set to a falsy value', () => {
      const api = build(createConfig());
      const { spy, logger } = createSpyComponent();
      const comp = withData({
        poll: {
          users: {
            resolve: () => api.user.getUsers(),
            interval: () => null
          }
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        logger.expectRenderCount(1);
        return delay(10).then(() => {
          logger.expectRenderCount(1);
        });
      });
    });

    it('does not poll when interval is not defined', () => {
      const api = build(createConfig());
      const { spy, logger } = createSpyComponent();
      const comp = withData({
        poll: {
          users: {
            resolve: () => api.user.getUsers()
          }
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        logger.expectRenderCount(1);
        return delay(10).then(() => {
          logger.expectRenderCount(1);
        });
      });
    });

    it('polls with the given interval', () => {
      // need to write an own setInterval implementation
      // to make this really robust!

      const api = build(createConfig());
      const { spy, logger } = createSpyComponent();
      const comp = withData({
        poll: {
          users: {
            resolve: () => api.user.getUsers(),
            interval: () => 9
          }
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        logger.expectRenderCount(1);
        return delay(10).then(() => {
          logger.expectRenderCount(2);
          return delay(10).then(() => {
            logger.expectRenderCount(3);
          });
        });
      });
    });
  });

  describe('shouldRefetch', () => {
    it('does not trigger callbacks when returning false for new props', () => {
      const { spy, logger } = createSpyComponent();
      const spyResolve = sinon.stub().returns(Promise.resolve({}));

      const comp = withData({
        resolve: {
          user: ({ userId }) => spyResolve(userId)
        },
        shouldRefetch: (props, nextProps) => {
          return props.userId === 'robin' && nextProps.userId === 'gernot';
        }
      })(spy);

      let stateContainer = null;

      render(comp, { userId: 'peter' }, c => { stateContainer = c; });

      return delay().then(() => {
        logger.expectRenderCount(1);
        expect(spyResolve).to.have.been.calledOnce;

        stateContainer.setState({ userId: 'robin' });
        return delay().then(() => {
          expect(spyResolve).to.have.been.calledOnce;
          logger.expectRenderCount(2);

          stateContainer.setState({ userId: 'gernot' });
          return delay().then(() => {
            expect(spyResolve).to.have.been.calledTwice;
            logger.expectRenderCount(3);
          });
        });
      });
    });
  });
});

