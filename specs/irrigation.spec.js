/**
 * @briskhome/irrigation <lib/irrigation/test/index.js>
 *
 * Набор тестов для компонента управления поливом.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.3.0
 */

'use strict';

const db = require('mongoose-mock');
const proxyquire = require('proxyquire');
const assert = require('chai').assert;

function log () {
  return {
    info: function (a) {
      return true;
    },
  };
}

function config() {
  return {
    max: 600,
    mix: 100,
    interval: 60,
    controller: {
      mode: 'http',
      address: '10.29.0.12',
      port: 8888,
      secret: 'secret',
      cipher: 'arc4',
    },
  };
}

proxyquire('../models/Circuit.js', db);

const bus = new (require('events').EventEmitter)();

const irrigation = proxyquire('../', {
  Circuit: function() {
    return proxyquire('../models/Circuit.js')(mongoose);
  },
})(null, {db, log, bus, config}, () => {});
// const Record = db.model('core:record');
// const Measure = db.model('core:measure');
// const Circuit = db.model('irrigation:circuit');
// const Controller = db.model('irrigation:controller');

describe('Briskhome irrigation component', () => {
  before(() => {

  });

  it('should register', () => {

  });
});
