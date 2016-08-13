/* global after, afterEach, before, beforeEach, describe, it */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint global-require: [0] */
/* eslint func-names: [0] */
/* eslint prefer-arrow-callback: [0] */
'use strict';
// Модули, необходимые для тестирования
const db = require('mongoose');
const nock = require('nock');
const async = require('async');
const sinon = require('sinon');
const assert = require('chai').assert;
const mockgoose = require('mockgoose');
const EventEmitter = require('events');

const Location = require('./models/allocation.model.js')(db);
const Device = require('./models/device.model.js')(db);
const Sensor = require('./models/sensor.model.js')(db);
const Reading = require('./models/reading.model.js')(db);
const Circuit = require('../models/Circuit.model.js')(db);

mockgoose(db).then(function () {
  db.connect('mongodb://briskhome:briskhome@localhost/test');
});

const log = () => {
  return {
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
  };
};

const options = {};
const imports = {
  bus: new EventEmitter(),
  db,
  config: () => {},
  log,
  planner: {
    define: () => {},
  },
};

const stubs = require('./irrigation.stubs.js');

require('../')(options, imports, () => {});

describe('Irrigation', function () {
  require('../')(options, imports, (error, returns) => {
    if (error) done(error);
    const irrigation = returns.irrigation;

    before(function (done) {
      console.log('  (make sure to set up the environment for integration tests)');
      async.series({
        devices: callback => {
          Device.collection.remove((err, data) => callback(err, data));
        },
        circuits: callback => {
          Device.collection.remove((err, data) => callback(err, data));
        },
        sensors: callback => {
          Sensor.collection.remove((err, data) => callback(err, data));
        }
      }, (err) => {
        done(err);
      });
    });

    after(function () {
      Circuit.collection.remove();
      Device.collection.remove();
    });

    describe('#init()', function () {

      before(function () {
        console.log('    (warning: tests in this section need verifying)');
      });

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices[0], (err, data) => callback(err, data));
          },
        }, (err) => {
          done(err);
        });
      });

      afterEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.remove((err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.remove((err, data) => callback(err, data));
          },
          sensors: (callback) => {
            Sensor.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => {
          done(err);
        });
      });

      it('should register a device as a controller', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply(200, stubs.responses[0]);
        irrigation.init((initErr) => {
          if (initErr) return done(initErr);
          Device.findOne({ _id: stubs.devices[0]._id }).lean().exec((deviceQueryErr, device) => {
            if (deviceQueryErr) return done(deviceQueryErr);
            assert.equal(device.services.irrigation.circuits.length, 2);
            done();
          });
        });
      });

      it('should fail to register a device if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.init((initErr) => {
          assert.instanceOf(initErr, Error);
          stub.restore();
          done();
        });
      });

      it('should fail to register a device if a network error occurs', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .replyWithError('error');
        irrigation.init((initErr) => {
          if (initErr) return done(initErr);
          Device.findOne({ _id: stubs.devices[0]._id }).lean().exec((deviceQueryErr, device) => {
            if (deviceQueryErr) return done(deviceQueryErr);
            assert.deepEqual(device.services.irrigation, {});
            done();
          });
        });
      });

      it('should fail to register a device if a response is invalid', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply('error');
        irrigation.init((initErr) => {
          if (initErr) return done(initErr);
          Device.findOne({ _id: stubs.devices[0]._id }).lean().exec((deviceQueryErr, device) => {
            if (deviceQueryErr) return done(deviceQueryErr);
            assert.deepEqual(device.services.irrigation, {});
            done();
          });
        });
      });
    });

    describe('#controllers()', function () {

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices, (err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      it('should return a controller', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb', {}, (err, ctrl) => {
          assert.equal(ctrl._id, stubs.devices[0]._id);
          return done(err);
        });
      });

      it('should return a controller as a database document', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb', { mongo: true }, (err, ctrl) => {
          assert.equal(ctrl._id, stubs.devices[0]._id);
          assert.instanceOf(ctrl, Device);
          return done(err);
        }, true);
      });

      it('should return all controllers', function (done) {
        irrigation.controllers(null, {}, (err, ctrls) => {
          assert.equal(ctrls.length, 3);
          return done(err);
        });
      });

      it('should return all controllers as a database documents', function (done) {
        irrigation.controllers(null, { mongo: true }, (err, ctrls) => {
          assert.equal(ctrls.length, 3);
          ctrls.forEach((ctrl) => {
            // FIXME: async.each(...)
            assert.instanceOf(ctrl, Device);
          });
          return done(err);
        }, true);
      });

      it('should fail if a controller is not registered', function (done) {
        irrigation.controllers('test', {}, (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should fail if no controllers are registered', function (done) {
        Device.collection.remove((err) => {
          if (err) return done(err);
          irrigation.controllers(null, {}, (err, data) => {
            assert.instanceOf(err, Error);
            return done();
          });
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.controllers(null, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          return done();
        });
      });
    });

    describe('#circuits()', function () {

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices, (err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.insert(stubs.circuits, (err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.remove((err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      it('should return a circuit', function (done) {
        irrigation.circuits(stubs.circuits[0]._id, {}, (err, circuit) => {
          if (err) {
            return done(err);
          }

          assert.equal(circuit._id, stubs.circuits[0]._id);
          return done();
        });
      });

      it('should return a circuit as a database document', function (done) {
        irrigation.circuits(stubs.circuits[0]._id, { mongo: true }, (err, circuit) => {
          if (err) return done(err);
          assert.equal(circuit._id, stubs.circuits[0]._id);
          assert.instanceOf(circuit, Circuit);
          return done();
        });
      });

      it('should return all circuits', function (done) {
        irrigation.circuits(null, {}, (err, circuits) => {
          if (err) return done(err);
          assert.equal(circuits.length, 6);
          return done();
        });
      });

      it('should return all circuits as a database document', function (done) {
        irrigation.circuits(null, { mongo: true }, (err, circuits) => {
          if (err) return done(err);
          async.each(circuits, (circuit, callback) => {
            assert.instanceOf(circuit, Circuit);
            callback();
          }, (e) => {
            if (e) return e;
            assert.equal(circuits.length, 6);
            return done();
          });
        });
      });

      it('should fail if a circuit is not registered', function (done) {
        irrigation.circuits('test', {}, (err) => {
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should fail if no circuits are registered', function (done) {
        Circuit.collection.remove((err) => {
          if (err) return done(err);
          return irrigation.circuits(undefined, {}, (e) => {
            assert.instanceOf(e, Error);
            return done();
          });
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.circuits(null, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          done();
        });
      });
    });

    describe('#start()', function () {

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.registered.devices, (err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.insert(stubs.registered.circuits, (err, data) => callback(err, data));
          },
          sensors: (callback) => {
            Sensor.collection.insert(stubs.registered.sensors, (err, data) => callback(err, data));
          },
        }, (err) => {
          done(err);
        });
      });

      afterEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.remove((err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.remove((err, data) => callback(err, data));
          },
          sensors: (callback) => {
            Sensor.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      it('should start a circuit', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: true }))
          .reply(200);
        irrigation.start(stubs.circuits[0]._id, {}, (err, circuit) => {
          assert.isNull(err);
          assert.equal(circuit.isActive, true);
          return done();
        });
      });

      it('should fail if a circuit is active', function (done) {
        Circuit.collection.findAndModify(
          { _id: stubs.circuits[0]._id }, {},
          { $set: { isActive: true } },
          (err) => {
            if (err) return done(err);
            return irrigation.start(stubs.circuits[0]._id, {}, (e) => {
              assert.instanceOf(e, Error);
              return done();
            });
          }
        );
      });

      it('should fail if a circuit is disabled', function (done) {
        Circuit.collection.findAndModify(
          { _id: stubs.circuits[0]._id }, {},
          { $set: { isDisabled: true } },
          (err) => {
            if (err) return done(err);
            return irrigation.start(stubs.circuits[0]._id, {}, (e) => {
              assert.instanceOf(e, Error);
              return done();
            });
          }
        );
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.start(stubs.circuits[0]._id, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should fail if controller is inavailable', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: true }))
          .replyWithError('error');
        irrigation.start(stubs.circuits[0]._id, {}, (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });
    });

    describe('#stop()', function () {

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices, (err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.insert(stubs.circuits, (err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove((err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      it('should stop a circuit', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: false }))
          .reply(200);
        Circuit.collection.findAndModify({
          _id: stubs.circuits[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          (e) => {
            if (e) return done(e);
            irrigation.stop(stubs.circuits[0]._id, {}, (err, data) => {
              assert.isNull(err);
              assert.isFalse(data.isActive);
              return done();
            });

            return false;
          }
        );
      });

      it('should fail if circuit is already stopped', function (done) {
        irrigation.stop(stubs.circuits[0]._id, {}, (e) => {
          assert.instanceOf(e, Error);
          return done();
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        Circuit.collection.findAndModify({
          _id: stubs.circuits[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          (e) => {
            if (e) return done(e);
            irrigation.stop(stubs.circuits[0]._id, {}, (err) => {
              stub.restore();
              assert.instanceOf(err, Error);
              return done();
            });

            return false;
          }
        );
      });

      it('should fail if controller is inavailable', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: false }))
          .replyWithError('error');
        Circuit.collection.findAndModify({
          _id: stubs.circuits[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          (e) => {
            if (e) return done(e);
            irrigation.stop(stubs.circuits[0]._id, {}, (err) => {
              assert.instanceOf(err, Error);
              return done();
            });

            return false;
          }
        );
      });
    });
  });
});
