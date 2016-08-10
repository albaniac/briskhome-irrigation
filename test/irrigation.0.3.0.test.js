/* global after, afterEach, before, beforeEach, describe, it */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint global-require: [0] */
/* eslint func-names: [0] */
/* eslint prefer-arrow-callback: [0] */
'use strict';
// Модули, необходимые для тестирования
const nock = require('nock');
const async = require('async');
const sinon = require('sinon');
const assert = require('chai').assert;
const mongoose = require('mongoose');

const Location = require('/opt/briskhome/lib/core.db/models/allocation.model.js')(mongoose);
const Device = require('/opt/briskhome/lib/core.db/models/device.model.js')(mongoose);
const Circuit = require('../models/Circuit.model.js')(mongoose);
const Controller = require('../models/Controller.model.js')(mongoose);
const ControllerMock = sinon.mock(Controller);

const db = mongoose.connect('mongodb://briskhome:briskhome@localhost/test');
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
  db,
  config: () => {},
  log,
};

const stubs = require('./irrigation.stubs.js');

require('../')(options, imports, () => {});

describe('Irrigation', function () {
  require('../')(options, imports, (error, returns) => {
    if (error) done(error);
    const irrigation = returns.irrigation;

    before(function () {
      console.log('  (make sure to set up the environment for integration tests)');
      Controller.collection.remove();
      Circuit.collection.remove();
      Device.collection.remove();
    });

    after(function () {
      Controller.collection.remove();
      Circuit.collection.remove();
      Device.collection.remove();
    });

    describe('#init()', function () {

      before(function () {
        console.log('    (warning: test in this section need verifying)');
      });

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices[0], (err, data) => callback(err, data));
          },
          // circuits: (callback) => {
          //   Circuit.collection.insert([stubs.devices[0], stubs.devices[1]],
          //     (err, data) => callback(err, data));
          // },
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
          }
        }, (err) => {
          done(err);
        });
      });

      it('should scaffold out a controller', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply(200, stubs.responses[0]);
        irrigation.init((err) => {
          if (err) return done(err);
          Device.findOne({}).lean().exec((e, device) => {
            if (err) return done(e);
            assert.deepEqual(device.services.irrigation, stubs.controllers[0]);
            return done();
          });
        });
      });

      it('should register circuits', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply(200, stubs.responses[0]);
        irrigation.init((err) => {
          if (err) return done(err);
          Circuit.find({ controller: stubs.devices[0]._id }).lean().exec((e, circuits) => {
            if (err) return done(e);
            assert.equal(circuits.length, 2);
            return done();
          });
        });
      });

      it('should not register a device without irrigation service', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply(200, stubs.responses[0]);
        Device.collection.insert(stubs.onewire[0], (err) => {
          irrigation.init((err) => {
            if (err) return done(err);
            Device.findOne({ _id: 'a3a3816f-1f6f-4a08-a40d-5a35b53439a2' }).lean().exec((e, device) => {
              if (err) return done(e);
              assert.isUndefined(device.services.irrigation);
              return done();
            });
          });
        });
      });

      it('should register circuits', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply(200, stubs.responses[0]);
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .reply(stubs.responses[0]);
        irrigation.init((err) => {
          if (err) return done(err);
          Circuit.find({ controller: stubs.devices[0]._id }).lean().exec((e, circuits) => {
            if (err) return done(e);
            assert.equal(circuits.length, 2);
            irrigation.init((err) => {
              if (err) return done(err);
              Circuit.find({ controller: stubs.devices[0]._id }).lean().exec((e, circuits) => {
                if (err) return done(e);
                assert.equal(circuits.length, 2);
                return done();
              });
            });
          });
        });
      });

      it('should fail if a response in invalid', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .replyWithError('error');
        irrigation.init((err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should fail if a network error occurs', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .get('/')
          .replyWithError('error');
        irrigation.init((err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.init((err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should fail if cannot save Device', function (done) {
        const stub = sinon.stub(Device.prototype, 'save').yields(new Error('MongoError'));
        irrigation.init((err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          done();
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
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb', (err, ctrl) => {
          assert.equal(ctrl._id, stubs.devices[0]._id);
          return done(err);
        });
      });

      it('should return a controller as a database document', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb', (err, ctrl) => {
          assert.equal(ctrl._id, stubs.devices[0]._id);
          assert.instanceOf(ctrl, Device);
          return done(err);
        }, true);
      });

      it('should return all controllers', function (done) {
        irrigation.controllers((err, ctrls) => {
          assert.equal(ctrls.length, 3);
          return done(err);
        });
      });

      it('should return all controllers as a database documents', function (done) {
        irrigation.controllers((err, ctrls) => {
          assert.equal(ctrls.length, 3);
          ctrls.forEach((ctrl) => {
            // FIXME: async.each(...)
            assert.instanceOf(ctrl, Device);
          });
          return done(err);
        }, true);
      });

      it('should fail if a controller is not registered', function (done) {
        irrigation.controllers('test', (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should fail if no controllers are registered', function (done) {
        Device.collection.remove((err) => {
          if (err) return done(err);
          irrigation.controllers((err, data) => {
            assert.instanceOf(err, Error);
            return done();
          });
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.controllers((err) => {
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
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
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

      it('should start a circuit', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: true }))
          .reply(200);
        irrigation.start(stubs.circuits[0]._id, {}, (err, circuit) => {
          assert.isNull(err);
          assert.equal(circuit.status, true);
          return done();
        });
      });

      it('should fail if circuit is already started', function (done) {
        Circuit.collection.findAndModify(
          { _id: stubs.circuits[0]._id }, {},
          { $set: { status: true } }, (err) => {
            if (err) return done(err);
            return irrigation.start(stubs.circuits[0]._id, {}, (e) => {
              assert.instanceOf(e, Error);
              return done();
            });
          });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
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
        async.auto({
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
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: true }))
          .reply(200);
          Circuit.collection.findAndModify(
            { _id: stubs.circuits[0]._id }, {},
            { $set: { status: true } }, (err) => {
              if (err) return done(err);
              return irrigation.start(stubs.circuits[0]._id, {}, (e) => {
                assert.instanceOf(e, Error);
                return done();
              });
            });
      });

      it('should fail if circuit is already stopped', function (done) {
        irrigation.stop(stubs.circuits[0]._id, {}, (e) => {
          assert.instanceOf(e, Error);
          return done();
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.stop(stubs.circuits[0]._id, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should fail if controller is inavailable', function (done) {
        nock(`http://${stubs.devices[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits[0]._id, status: true }))
          .replyWithError('error');
        irrigation.stop(stubs.circuits[0]._id, {}, (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });
    });
  });
});
