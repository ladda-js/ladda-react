/* eslint-disable no-unused-expressions */
import { createElement } from 'react';
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
      api: { getUser, getUsers, getUsersPaginated, updateUser, removeUser }
    }
  };
};

const createSpyComponent = () => {
  return sinon.stub().returns(null);
};

const render = (component, props) => {
  const el = createElement(component, props);
  return ReactTestUtils.renderIntoDocument(el);
};

describe('withData', () => {
  it('passes the original properties down', () => {
    const api = build(createConfig());
    const spy = createSpyComponent();
    const comp = withData({
      resolve: {
        users: () => api.user.getUsers(),
        user: ({ userId }) => api.user.getUser(userId)
      }
    })(spy);

    render(comp, { userId: 'peter' });

    return delay().then(() => {
      expect(spy).to.have.been.called;
      const props = spy.args[0][0];
      expect(props.userId).to.equal('peter');
    });
  });

  it('allows to observe changes', () => {
    const api = build(createConfig(), [observable()]);
    const spy = createSpyComponent();
    const comp = withData({
      observe: {
        user: ({ userId }) => api.user.getUser.createObservable(userId)
      }
    })(spy);

    render(comp, { userId: 'peter' });

    return delay().then(() => {
      expect(spy).to.have.been.calledOnce;
      const firstProps = spy.args[0][0];
      expect(firstProps.user).to.deep.equal(peter);

      return api.user.updateUser({ id: 'peter', name: 'crona' }).then((nextUser) => {
        return delay().then(() => {
          expect(spy).to.have.been.calledTwice;
          const secondProps = spy.args[1][0];
          expect(secondProps.user).to.deep.equal(nextUser);
        });
      });
    });
  });

  describe('pagination', () => {
    it('allows to paginate with limit and offset (resolve)', () => {
      const api = build(createConfig(), [observable()]);
      const spy = createSpyComponent();
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
        expect(spy).to.have.been.called;
        const firstProps = spy.args[0][0];
        expect(firstProps.users).to.deep.equal([peter, gernot]);

        return firstProps.paginate.users.getNext().then(() => {
          return delay().then(() => {
            expect(spy).to.have.been.calledTwice;
            const secondProps = spy.args[1][0];
            expect(secondProps.users).to.deep.equal([peter, gernot, robin]);
          });
        });
      });
    });

    it('allows to paginate with limit and offset (observe)', () => {
      const api = build(createConfig(), [observable()]);
      const spy = createSpyComponent();
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
        expect(spy).to.have.been.called;
        const firstProps = spy.args[0][0];
        expect(firstProps.users).to.deep.equal([peter, gernot]);

        return firstProps.paginate.users.getNext().then(() => {
          expect(spy).to.have.been.calledTwice;
          const secondProps = spy.args[1][0];
          expect(secondProps.users).to.deep.equal([peter, gernot, robin]);

          return api.user.updateUser({ id: 'peter', name: 'crona' }).then((nextUser) => {
            return delay().then(() => {
              const thirdProps = spy.args[2][0];
              expect(thirdProps.users[0]).to.deep.equal(nextUser);
            });
          });
        });
      });
    });
  });

  describe('poll', () => {
    it('does not poll when interval is set to a falsy value', () => {
      const api = build(createConfig());
      const spy = createSpyComponent();
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
        expect(spy).to.have.been.calledOnce;
        return delay(10).then(() => {
          expect(spy).to.have.been.calledOnce;
        });
      });
    });

    it('does not poll when interval is not defined', () => {
      const api = build(createConfig());
      const spy = createSpyComponent();
      const comp = withData({
        poll: {
          users: {
            resolve: () => api.user.getUsers()
          }
        }
      })(spy);

      render(comp, {});

      return delay().then(() => {
        expect(spy).to.have.been.calledOnce;
        return delay(10).then(() => {
          expect(spy).to.have.been.calledOnce;
        });
      });
    });

    it('polls with the given interval', () => {
      // need to write an own setInterval implementation
      // to make this really robust!

      const api = build(createConfig());
      const spy = createSpyComponent();
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
        expect(spy).to.have.been.calledOnce;
        return delay(10).then(() => {
          expect(spy).to.have.been.calledTwice;
          return delay(10).then(() => {
            expect(spy).to.have.been.calledThrice;
          });
        });
      });
    });
  });
});

