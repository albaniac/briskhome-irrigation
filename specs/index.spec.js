/* global after, afterEach, before, beforeEach, describe, it */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint global-require: [0] */
/* eslint func-names: [0] */
/* eslint prefer-arrow-callback: [0] */

/**
 * @briskhome
 * └briskhome-irrigation <briskhome-irrigation/specs/index.spec.js>
 *
 * Юнит-тесты для компонента управления поливом.
 *
 * @author  Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.3.0-rc.1
 */


'use strict';

const db = require('mongoose');
const nock = require('nock');
const async = require('async');
const sinon = require('sinon');
const stubs = require('./stubs.js');
const assert = require('chai').assert;
const mockgoose = require('mockgoose');
const EventEmitter = require('events');

const Device = require('./models/device.model.js')(db);
const Sensor = require('./models/sensor.model.js')(db);
const Reading = require('./models/reading.model.js')(db);
const Circuit = require('../models/Circuit.model.js')(db);

sinon.assert.expose(assert, { prefix: '' });
mockgoose(db).then(function () {
  db.connect('mongodb://briskhome:briskhome@localhost/test');
});

/** Заглушка компонента журналирования */
const logTraceStub = sinon.stub();
const logDebugStub = sinon.stub();
const logInfoStub = sinon.stub();
const logWarnStub = sinon.stub();
const logErrorStub = sinon.stub();
const logFatalStub = sinon.stub();

function Log() {
  this.trace = logTraceStub;
  this.debug = logDebugStub;
  this.info = logInfoStub;
  this.warn = logWarnStub;
  this.error = logErrorStub;
  this.trace = logFatalStub;
}

/** Заглушка компонента планировщика задач */
const plannerDefineStub = sinon.stub();
const plannerCreateStub = sinon.stub();

function Planner() {
  this.define = plannerDefineStub;
  this.create = plannerCreateStub;
}

/** Заглушка компонента загрузки конфигурации */
// const configStub = sinon.stub();
//
// function Config() {
//   return configStub;
// }

const options = {};
const imports = {
  bus: new EventEmitter(),
  db,
  config: () => {},
  log: () => new Log(),
  planner: new Planner(),
};

describe('Irrigation', function () {
  describe('#constructor()', function () {
    beforeEach(function (done) {
      async.series({
        devices: callback => {
          Device.collection.insert(
            stubs.devices.registered,
            (err, data) => callback(err, data)
          );
        },
        circuits: callback => {
          Circuit.collection.insert(
            stubs.circuits.registered,
            (err, data) => callback(err, data)
          );
        },
        sensors: callback => {
          Sensor.collection.insert(
            stubs.sensors.registered,
            (err, data) => callback(err, data)
          );
        },
      }, (err) => done(err));
    });

    afterEach(function (done) {
      async.series({
        devices: (callback) => {
          Device.collection.remove(
            (err, data) => callback(err, data)
          );
        },
        circuits: callback => {
          Circuit.collection.remove(
            (err, data) => callback(err, data)
          );
        },
        sensors: callback => {
          Sensor.collection.remove(
            (err, data) => callback(err, data)
          );
        },
      }, (err) => done(err));
    });

    it('should fail to register job definitions', function (done) {
      plannerDefineStub.yields({ attrs: { data: {} } }, sinon.stub());
      require('../')(options, imports, (error, returns) => {
        // const irrigation = ;
        // const stub = sinon.stub(irrigation)
        sinon.stub(returns.irrigation, 'start').yields(null);
        plannerDefineStub.reset();
        return done();
      });
    });

    // it.only('should fail to register job definitions', function (done) {
    //   require('../')(options, imports, (error, results) => {
    //     console.log(Object.getPrototypeOf(results.irrigation));
    //     const doneStub = sinon.stub();
    //     plannerDefineStub.yields({ attrs: { data: { circuit: 'test' } } }, doneStub);
    //     const startStub = sinon.stub(Object.getPrototypeOf(results.irrigation), 'start').onFirstCall().yields(null);
    //     const stopStub = sinon.stub(Object.getPrototypeOf(results.irrigation), 'stop').onFirstCall().yields(null);
    //     require.cache = {};
    //     require('../')(options, imports, (error2, returns) => {
    //       const irrigation = returns.irrigation;
    //       assert.calledOnce(startStub);
    //       assert.calledOnce(stopStub);
    //       assert.calledTwice(doneStub);//.calledWith(null);
    //       plannerDefineStub.reset();
    //       startStub.restore();
    //       stopStub.restore();
    //       return done();
    //     });
    //   });
    // });
  });

  describe('#update()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should log a warning if database error occurs', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Device, 'find').yields(err);
        irrigation.update(() => {
          assert(logWarnStub.calledOnce);
          assert(logWarnStub.calledWith(sinon.match({ err: { message: 'MongoError' } })));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should log a warning if no devices are registered', function (done) {
        Device.collection.remove();
        irrigation.update(() => {
          assert.calledOnce(logWarnStub);
          assert(logWarnStub.calledWith(sinon.match({
            err: { message: 'Отсутствуют зарегистрированные устройства' },
          })));
          logWarnStub.reset();
          return done();
        });
      });

      it('should log a warning if unable to connect to device', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .replyWithError('ConnectionError');
        irrigation.update(() => {
          assert(logWarnStub.calledOnce);
          assert(logWarnStub.calledWith(sinon.match({ err: { message: 'ConnectionError' } })));
          logWarnStub.reset();
          return done();
        });
      });

      it('should log a warning if unable to parse the response', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, stubs.responses.incorrect);
        irrigation.update(() => {
          assert(logWarnStub.calledOnce);
          assert(logWarnStub.calledWith(sinon.match({ err: { message: 'Unexpected token N' } })));
          logWarnStub.reset();
          return done();
        });
      });

      it('should log a warning if unable to query circuits', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Circuit, 'findOne').yields(err);
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        irrigation.update(() => {
          assert.calledTwice(logWarnStub); // Два контура полива!
          assert.calledWith(logWarnStub, sinon.match({ err: { message: 'MongoError' } }));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should register a circuit if not registered', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        Circuit.collection.remove({ _id: 'd382a277-3aab-47fb-aa03-532b3ff8cf07' });
        irrigation.update(() => {
          Circuit.find({}, (circuitFindErr, circuitFindRes) => {
            assert.isNull(circuitFindErr);
            assert.equal(circuitFindRes.length, 2);
            return done();
          });
        });
      });

      it('should log a warning if unable to query sensors', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Sensor, 'findOne').yields(err);
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        irrigation.update(() => {
          assert.calledThrice(logWarnStub); // Три сенсора!
          assert.calledWith(logWarnStub, sinon.match({ err: { message: 'MongoError' } }));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should register a sensor if not registered', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        Sensor.collection.remove({ serial: '1234567890' });
        irrigation.update(() => {
          Sensor.find({}, (sensorFindErr, sensorFindRes) => {
            assert.isNull(sensorFindErr);
            assert.equal(sensorFindRes.length, 3);
            return done();
          });
        });
      });

      it('should log a warning if unable to save a sensor', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Sensor.prototype, 'save').yields(err);
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        irrigation.update(() => {
          assert.calledThrice(logWarnStub); // Три сенсора!
          assert.calledWith(logWarnStub, sinon.match({ err: { message: 'MongoError' } }));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should log a warning if unable to query readings', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Reading, 'findOne').yields(err);
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        irrigation.update(() => {
          assert.calledThrice(logWarnStub); // Три сенсора!
          assert.calledWith(logWarnStub, sinon.match({ err: { message: 'MongoError' } }));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should create a new reading if unable to find recent');

      it('should log a warning if unable to save a reading', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Reading.prototype, 'save').yields(err);
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        irrigation.update(() => {
          assert.calledThrice(logWarnStub); // Три сенсора!
          assert.calledWith(logWarnStub, sinon.match({ err: { message: 'MongoError' } }));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should log a warning if unable to save a circuit', function (done) {
        const err = new Error('MongoError');
        const stub = sinon.stub(Circuit.prototype, 'save').yields(err);
        nock(`http://${stubs.devices.registered[0].address}/`)
          .get('/')
          .reply(200, JSON.stringify(stubs.responses.normal));
        irrigation.update(() => {
          assert.calledTwice(logWarnStub); // Два контура!
          assert.calledWith(logWarnStub, sinon.match({ err: { message: 'MongoError' } }));
          stub.restore();
          logWarnStub.reset();
          return done();
        });
      });
    });
  });

  describe('#controllers()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.auto({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should return a controller', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
        {},
        (err, ctrl) => {
          assert.isNull(err);
          assert.equal(ctrl._id, stubs.devices.registered[0]._id);
          return done(err);
        });
      });

      it('should return a populated controller', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
        { populate: true },
        (err, ctrl) => {
          assert.isNull(err);
          assert.equal(ctrl._id, stubs.devices.registered[0]._id);
          assert.equal(ctrl.services.irrigation.circuits.length, 2);
          assert.instanceOf(ctrl.services.irrigation.circuits[0], Object);
          assert.instanceOf(ctrl.services.irrigation.circuits[1], Object);
          return done(err);
        });
      });

      it('should return a model of a controller', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
        { mongoose: true },
        (err, ctrl) => {
          assert.isNull(err);
          assert.equal(ctrl._id, stubs.devices.registered[0]._id);
          assert.instanceOf(ctrl, Device);
          return done(err);
        });
      });

      it('should return all controllers', function (done) {
        irrigation.controllers(null,
        {},
        (err, ctrls) => {
          assert.isNull(err);
          assert.equal(ctrls.length, stubs.devices.registered.length);
          return done(err);
        });
      });

      it('should return all populated controllers', function (done) {
        irrigation.controllers(null,
        { populate: true },
        (err, ctrls) => {
          assert.isNull(err);
          assert.equal(ctrls.length, stubs.devices.registered.length);
          assert.equal(ctrls[0].services.irrigation.circuits.length, 2);
          assert.instanceOf(ctrls[0].services.irrigation.circuits[0], Object);
          assert.instanceOf(ctrls[0].services.irrigation.circuits[1], Object);
          return done(err);
        });
      });

      it('should return all models of controllers', function (done) {
        irrigation.controllers(null,
          { mongoose: true },
          (err, ctrls) => {
            assert.equal(ctrls.length, stubs.devices.registered.length);
            ctrls.forEach((ctrl) => {
              assert.isNull(err);
              assert.equal(ctrl._id, stubs.devices.registered[0]._id);
              assert.instanceOf(ctrl, Device);
            });
            return done(err);
          });
      });

      it('should return error if a controller is not registered', function (done) {
        irrigation.controllers('test', {}, (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should return error if no controllers are registered', function (done) {
        Device.collection.remove((err) => {
          if (err) return done(err);
          return irrigation.controllers(null, {}, (e) => {
            assert.instanceOf(e, Error);
            return done();
          });
        });
      });

      it('should return error if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.controllers(null, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          stub.restore();
          return done();
        });
      });
    });
  });

  describe('#circuits()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should return a circuit', function (done) {
        irrigation.circuits(stubs.circuits.registered[0]._id,
        {},
        (err, circuit) => {
          assert.isNull(err);
          assert.equal(circuit._id, stubs.circuits.registered[0]._id);
          return done();
        });
      });

      it('should return a populated circuit', function (done) {
        irrigation.circuits(stubs.circuits.registered[0]._id,
        { populate: true },
        (err, circuit) => {
          assert.isNull(err);
          assert.equal(circuit._id, stubs.circuits.registered[0]._id);
          assert.equal(circuit.sensors.length, stubs.circuits.registered[0].sensors.length);
          assert.instanceOf(circuit.sensors[0], Object);
          assert.instanceOf(circuit.sensors[1], Object);
          return done();
        });
      });

      it('should return a model of a circuit', function (done) {
        irrigation.circuits(stubs.circuits.registered[0]._id,
        { mongoose: true },
        (err, circuit) => {
          if (err) return done(err);
          assert.isNull(err);
          assert.equal(circuit._id, stubs.circuits.registered[0]._id);
          assert.instanceOf(circuit, Circuit);
          return done();
        });
      });

      it('should return all circuits', function (done) {
        irrigation.circuits(null,
        {},
        (err, circuits) => {
          if (err) return done(err);
          assert.isNull(err);
          assert.equal(circuits.length, stubs.circuits.registered.length);
          return done();
        });
      });

      it('should return all populated circuits', function (done) {
        irrigation.circuits(null,
        { populate: true },
        (err, circuits) => {
          if (err) return done(err);
          assert.isNull(err);
          assert.equal(circuits[0]._id, stubs.circuits.registered[0]._id);
          assert.equal(circuits[0].sensors.length, stubs.circuits.registered[0].sensors.length);
          assert.instanceOf(circuits[0].sensors[0], Object);
          assert.instanceOf(circuits[0].sensors[1], Object);
          return done();
        });
      });

      it('should return all models circuits', function (done) {
        irrigation.circuits(null,
        { mongoose: true },
        (err, circuits) => {
          if (err) return done(err);
          return async.each(circuits, (circuit, callback) => {
            assert.instanceOf(circuit, Circuit);
            callback();
          }, (e) => {
            if (e) return e;
            assert.isNull(e);
            assert.equal(circuits.length, stubs.circuits.registered.length);
            return done();
          });
        });
      });

      it('should return error if a circuit is not registered', function (done) {
        irrigation.circuits('test', {}, (err) => {
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should return error if no circuits are registered', function (done) {
        Circuit.collection.remove((err) => {
          if (err) return done(err);
          return irrigation.circuits(undefined, {}, (e) => {
            assert.instanceOf(e, Error);
            return done();
          });
        });
      });

      it('should return error if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.circuits(null, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          stub.restore();
          done();
        });
      });
    });
  });

  describe('#start()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should start a circuit', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits.registered[0]._id, status: true }))
          .reply(200);
        irrigation.start(stubs.circuits.registered[0]._id, {}, (err, circuit) => {
          assert.isNull(err);
          assert.equal(circuit.isActive, true);
          return done();
        });
      });

      it('should return error if a circuit is active', function (done) {
        Circuit.collection.findAndModify(
          { _id: stubs.circuits.registered[0]._id }, {},
          { $set: { isActive: true } },
          (err) => {
            if (err) return done(err);
            return irrigation.start(stubs.circuits.registered[0]._id, {}, (e) => {
              assert.instanceOf(e, Error);
              return done();
            });
          }
        );
      });

      it('should return error if a circuit is disabled', function (done) {
        Circuit.collection.findAndModify(
          { _id: stubs.circuits.registered[0]._id }, {},
          { $set: { isDisabled: true } },
          (err) => {
            if (err) return done(err);
            return irrigation.start(stubs.circuits.registered[0]._id, {}, (e) => {
              assert.instanceOf(e, Error);
              return done();
            });
          }
        );
      });

      it('should return error if unable to save circuit', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits.registered[0]._id, status: true }))
          .reply(200);
        sinon.stub(Circuit.prototype, 'save').yields(new Error('MongoError'));
        irrigation.start(stubs.circuits.registered[0]._id, {}, (err) => {
          Circuit.prototype.save.restore();
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should return error if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.start(stubs.circuits.registered[0]._id, {}, (err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          return done();
        });
      });

      it('should return error if controller is inavailable', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits.registered[0]._id, status: true }))
          .replyWithError('error');
        irrigation.start(stubs.circuits.registered[0]._id, {}, (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });
    });
  });

  describe('#stop()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should stop a circuit', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits.registered[0]._id, status: false }))
          .reply(200);
        Circuit.collection.findAndModify({
          _id: stubs.circuits.registered[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          (e) => {
            if (e) return done(e);
            irrigation.stop(stubs.circuits.registered[0]._id, {}, (err, data) => {
              assert.isNull(err);
              assert.isFalse(data.isActive);
              return done();
            });

            return false;
          }
        );
      });

      it('should return error if circuit is already stopped', function (done) {
        irrigation.stop(stubs.circuits.registered[0]._id, {}, (e) => {
          assert.instanceOf(e, Error);
          return done();
        });
      });

      it('should return error if a database error occurs', function (done) {
        const stub = sinon.stub(db.Query.prototype, 'exec').yields(new Error('MongoError'));
        Circuit.collection.findAndModify({
          _id: stubs.circuits.registered[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          (e) => {
            if (e) return done(e);
            irrigation.stop(stubs.circuits.registered[0]._id, {}, (err) => {
              stub.restore();
              assert.instanceOf(err, Error);
              return done();
            });

            return false;
          }
        );
      });

      it('should return error if unable to save a circuit', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits.registered[0]._id, status: false }))
          .reply(200);
        Circuit.collection.findAndModify({
          _id: stubs.circuits.registered[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          () => {
            const stub = sinon.stub(Circuit.prototype, 'save').yields(new Error('MongoError'));
            irrigation.stop(stubs.circuits.registered[0]._id, {}, (err) => {
              stub.restore();
              assert.instanceOf(err, Error);
              return done();
            });

            return false;
          }
        );
      });

      it('should return error if controller is inavailable', function (done) {
        nock(`http://${stubs.devices.registered[0].address}/`)
          .post('/', JSON.stringify({ _id: stubs.circuits.registered[0]._id, status: false }))
          .replyWithError('error');
        Circuit.collection.findAndModify({
          _id: stubs.circuits.registered[0]._id,
        }, {}, {
          $set: { isActive: true },
        },
          (e) => {
            if (e) return done(e);
            irrigation.stop(stubs.circuits.registered[0]._id, {}, (err) => {
              assert.instanceOf(err, Error);
              return done();
            });

            return false;
          }
        );
      });
    });
  });

  describe('#schedule()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        logWarnStub.reset();
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should return error if unable to save start job', function (done) {
        const plannerSaveStub = sinon.stub();
        plannerCreateStub.returns({
          repeatEvery: () => {},
          save: plannerSaveStub.yields(new Error('Не удалось сохранить расписание')),
        });
        irrigation.schedule(stubs.circuits.registered[0]._id,
        stubs.timetables[0],
        (err) => {
          assert.instanceOf(err, Error);
          assert.calledOnce(logWarnStub);
          assert(logWarnStub.calledWith(sinon.match({
            err: { message: 'Не удалось сохранить расписание' },
          })));
          plannerCreateStub.reset();
          logWarnStub.reset();
          return done();
        });
      });

      it('should return error if unable to save finish job', function (done) {
        const plannerSaveStub = sinon.stub();
        plannerSaveStub.onCall(0).yields(null);
        plannerSaveStub.onCall(1).yields(new Error('Не удалось сохранить расписание'));
        plannerCreateStub.returns({
          repeatEvery: () => {},
          save: plannerSaveStub,
        });

        irrigation.schedule(stubs.circuits.registered[0]._id,
        stubs.timetables[0],
        (err) => {
          assert.instanceOf(err, Error);
          assert.calledOnce(logWarnStub);
          assert(logWarnStub.calledWith(sinon.match({
            err: { message: 'Не удалось сохранить расписание' },
          })));
          plannerCreateStub.reset();
          logWarnStub.reset();
          return done();
        });
      });

      it('should return error if unable to save a timetable', function (done) {
        const plannerSaveStub = sinon.stub();
        plannerSaveStub.onCall(0).yields(null);
        plannerSaveStub.onCall(1).yields(new Error('Не удалось сохранить расписание'));
        plannerCreateStub.returns({
          repeatEvery: () => {},
          save: plannerSaveStub,
        });

        irrigation.schedule(stubs.circuits.registered[0]._id,
        stubs.timetables[0],
        (err) => {
          assert.instanceOf(err, Error);
          assert.calledOnce(logWarnStub);
          assert(logWarnStub.calledWith(sinon.match({
            err: { message: 'Не удалось сохранить расписание' },
          })));
          plannerCreateStub.reset();
          logWarnStub.reset();
          return done();
        });
      });

      it('should register a timetable', function (done) {
        const circuitSaveStub = sinon.stub(Circuit.prototype, 'save');
        const plannerSaveStub = sinon.stub();
        circuitSaveStub.yields(new Error('MongoError'));
        plannerCreateStub.returns({ repeatEvery: () => {}, save: plannerSaveStub.yields(null) });
        irrigation.schedule(stubs.circuits.registered[0]._id,
        stubs.timetables[0],
        (err) => {
          assert.instanceOf(err, Error);
          assert.calledOnce(logWarnStub);
          circuitSaveStub.restore();
          logWarnStub.reset();
          return done();
        });
      });

      it('should register a timetable', function (done) {
        const plannerSaveStub = sinon.stub();
        plannerCreateStub.returns({ repeatEvery: () => {}, save: plannerSaveStub.yields(null) });
        irrigation.schedule(stubs.circuits.registered[0]._id,
        stubs.timetables[0],
        (err) => {
          assert.isNull(err);
          return done();
        });
      });

      it('should return error if circuit is incorrect', function (done) {
        irrigation.schedule('test',
        stubs.timetables[0],
        (err) => {
          assert.instanceOf(err, Error);
          return done();
        });
      });
    });
  });
});

describe('Bus', function () {
  describe('#irrigation:controllers', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should return a controller', done => {
        imports.bus.once('test:irrigation:controllers', event => {
          assert.isUndefined(event.err);
          assert.equal(event.data._id, stubs.devices.registered[0]._id);
          return done();
        });

        imports.bus.emit('irrigation:controllers', {
          component: 'test',
          responder: 'irrigation:controllers',
          data: {
            _id: stubs.devices.registered[0]._id,
          },
        });
      });

      it('should return a populated controller', done => {
        imports.bus.once('test:irrigation:controllers', event => {
          assert.isUndefined(event.err);
          assert.equal(event.data._id, stubs.devices.registered[0]._id);
          return done();
        });

        imports.bus.emit('irrigation:controllers', {
          component: 'test',
          responder: 'irrigation:controllers',
          data: {
            _id: stubs.devices.registered[0]._id,
            populate: true,
          },
        });
      });

      it('should return all controllers', done => {
        imports.bus.once('test:irrigation:controllers', event => {
          assert.isUndefined(event.err);

          return done();
        });

        imports.bus.emit('irrigation:controllers', {
          component: 'test',
          responder: 'irrigation:controllers',
          data: {},
        });
      });

      it('should return all populated controllers', function (done) {
        imports.bus.once('test:irrigation:controllers', event => {
          assert.isUndefined(event.err);
          assert.equal(event.data[0]._id, stubs.devices.registered[0]._id);
          return done();
        });

        imports.bus.emit('irrigation:controllers', {
          component: 'test',
          responder: 'irrigation:controllers',
          data: {
            populate: true,
          },
        });
      });

      it('should return error if no controllers are registered', done => {
        Device.collection.remove();
        imports.bus.once('test:irrigation:controllers', event => {
          assert.instanceOf(event.err, Error);
          return done();
        });
        imports.bus.emit('irrigation:controllers', {
          component: 'test',
          responder: 'irrigation:controllers',
          data: {},
        });
      });
    });
  });

  describe('#irrigation:circuits', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.series({
          devices: callback => {
            Device.collection.insert(
              stubs.devices.registered,
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.insert(
              stubs.circuits.registered,
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.insert(
              stubs.sensors.registered,
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      afterEach(function (done) {
        async.series({
          devices: (callback) => {
            Device.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          circuits: callback => {
            Circuit.collection.remove(
              (err, data) => callback(err, data)
            );
          },
          sensors: callback => {
            Sensor.collection.remove(
              (err, data) => callback(err, data)
            );
          },
        }, (err) => done(err));
      });

      it('should return a circuit', done => {
        imports.bus.once('test:irrigation:circuits', event => {
          assert.isUndefined(event.err);
          assert.equal(event.data._id, stubs.circuits.registered[0]._id);
          return done();
        });

        imports.bus.emit('irrigation:circuits', {
          component: 'test',
          responder: 'irrigation:circuits',
          data: {
            _id: stubs.circuits.registered[0]._id,
          },
        });
      });

      it('should return a populated circuit', done => {
        imports.bus.once('test:irrigation:circuits', event => {
          assert.isUndefined(event.err);
          assert.equal(event.data._id, stubs.circuits.registered[0]._id);
          assert.equal(event.data.sensors.length, stubs.circuits.registered[0].sensors.length);
          assert.instanceOf(event.data.sensors[0], Object);
          assert.instanceOf(event.data.sensors[1], Object);
          return done();
        });

        imports.bus.emit('irrigation:circuits', {
          component: 'test',
          responder: 'irrigation:circuits',
          data: {
            _id: stubs.circuits.registered[0]._id,
            populate: true,
          },
        });
      });

      it('should return all circuits', done => {
        imports.bus.once('test:irrigation:circuits', event => {
          if (event.err) {
            return done(event.err);
          }

          return done();
        });

        imports.bus.emit('irrigation:circuits', {
          component: 'test',
          responder: 'irrigation:circuits',
          data: {},
        });
      });

      it('should return all populated circuits', function (done) {
        imports.bus.once('test:irrigation:circuits', event => {
          assert.isUndefined(event.err);
          assert.equal(event.data[0]._id, stubs.circuits.registered[0]._id);
          assert.equal(event.data[0].sensors.length, stubs.circuits.registered[0].sensors.length);
          assert.instanceOf(event.data[0].sensors[0], Object);
          assert.instanceOf(event.data[0].sensors[1], Object);
          return done();
        });

        imports.bus.emit('irrigation:circuits', {
          component: 'test',
          responder: 'irrigation:circuits',
          data: {
            populate: true,
          },
        });
      });

      it('should return error if no circuits are registered', done => {
        Circuit.collection.remove();
        imports.bus.once('test:irrigation:circuits', event => {
          assert.instanceOf(event.err, Error);
          return done();
        });
        imports.bus.emit('irrigation:circuits', {
          component: 'test',
          responder: 'irrigation:circuits',
          data: {},
        });
      });
    });
  });
});

describe('Planner', function () {
  describe('#irrigation:start', function () {
    // require('../')(options, imports, (error, returns) => {
      // const irrigation = returns.irrigation;
    // });
    it('should write specs for core.planner module integration');
  });

  describe('#irrigation:stop', function () {
    // require('../')(options, imports, (error, returns) => {
      // const irrigation = returns.irrigation;
    // });
    it('should write specs for core.planner module integration');
  });
});
