/* eslint-disable no-unused-expressions */
import { createElement } from 'react';
import ReactTestUtils from 'react-dom/test-utils'; // ES6
import { build, plugins } from 'ladda-cache';
import sinon from 'sinon';

import { withResolve } from '.';

const delay = (t = 1) => new Promise(res => setTimeout(() => res(), t));

const createConfig = () => {
  const peter = { id: 'peter', name: 'peter' };
  const gernot = { id: 'gernot', name: 'gernot' };
  const robin = { id: 'robin', name: 'robin' };

  const users = [peter, gernot, robin].reduce((m, u) => {
    m[u.id] = u;
    return m;
  }, {});

  const getUser = (id) => Promise.resolve(users[id]);
  getUser.operation = 'READ';
  getUser.byId = true;
  const getUsers = () => Promise.resolve(Object.values(users));
  getUsers.operation = 'READ';

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
      api: { getUser, getUsers, updateUser, removeUser }
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

describe('withResolve', () => {
  it('passes the original properties down', () => {
    const api = build(createConfig());
    const spy = createSpyComponent();
    const comp = withResolve({
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
});
