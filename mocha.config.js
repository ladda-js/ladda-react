/* eslint-disable import/no-extraneous-dependencies */
import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import { jsdom } from 'jsdom';
import React from 'react'; // eslint-disable-line no-unused-vars

chai.use(sinonChai);

const getSelection = () => ({ baseNode: '' });

global.document = jsdom('');
global.document.getSelection = getSelection;

global.window = global.document.defaultView;
global.window.getSelection = getSelection;

global.navigator = { userAgent: 'browser', platform: 'MacIntel' };

global.fdescribe = (...args) => describe.only(...args);
global.fit = (...args) => it.only(...args);
global.expect = expect;
