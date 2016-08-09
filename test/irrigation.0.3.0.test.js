/* global after, afterEach, before, beforeEach, describe, it */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint global-require: [0] */
/* eslint func-names: [0] */
/* eslint prefer-arrow-callback: [0] */

// Модули, необходимые для тестирования
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
  before(function () {
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
    require('../')(options, imports, (error, returns) => {
      if (error) done(error);
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices, (err, data) => callback(err, data));
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
          controllers: (callback) => {
            Controller.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => {
          done(err);
        });
      });

      it('should register an irrigation controller', function (done) {
        irrigation.init(() => {
          Controller.findOne({}).lean().exec((err, ctrl) => {
            assert.equal(ctrl._id, 'd7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb');
            done(err);
          });
        });
      });

      it('should not register an irrigation controller twice', function (done) {
        irrigation.init(() => {
          irrigation.init(() => {
            Controller.find({}).lean().exec((err, ctrls) => {
              assert.isNull(err);
              assert.equal(ctrls.length, 3);
              done();
            });
          });
        });
      });

      it('should fail if there is an error querying devices', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.init((err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should fail if there is an error querying controllers');

      it('should unregister an irrigation controller');
    });
  });

  describe('#controllers()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices, (err, data) => callback(err, data));
          },
          controllers: (callback) => {
            Controller.collection.insert(stubs.controllers, (err, data) => callback(err, data));
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
          controllers: (callback) => {
            Controller.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => {
          done(err);
        });
      });

      it('should return a controller', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb', (err, ctrl) => {
          assert.equal(ctrl._id, stubs.devices[0]._id);
          done(err);
        });
      });

      it('should return a controller as a database document', function (done) {
        irrigation.controllers('d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb', (err, ctrl) => {
          assert.equal(ctrl._id, stubs.devices[0]._id);
          assert.instanceOf(ctrl, Controller);
          done(err);
        }, true);
      });

      it('should return all controllers', function (done) {
        irrigation.controllers((err, ctrls) => {
          assert.equal(ctrls.length, 3);
          done(err);
        });
      });

      it('should return all controllers as a database documents', function (done) {
        irrigation.controllers((err, ctrls) => {
          assert.equal(ctrls.length, 3);
          ctrls.forEach((ctrl) => {
            assert.instanceOf(ctrl, Controller);
          });
          done(err);
        }, true);
      });

      it('should fail if a controller is not registered', function (done) {
        irrigation.controllers('test', (err) => {
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should fail if no controllers are registered', function (done) {
        Controller.remove({}).exec(() => {
          irrigation.controllers((err) => {
            assert.instanceOf(err, Error);
            done();
          });
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.controllers((err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          done();
        });
      });
    });
  });

  describe('#circuits()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      beforeEach(function (done) {
        async.auto({
          devices: (callback) => {
            Device.collection.insert(stubs.devices, (err, data) => callback(err, data));
          },
          controllers: (callback) => {
            Controller.collection.insert(stubs.controllers, (err, data) => callback(err, data));
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
          controllers: (callback) => {
            Controller.collection.remove((err, data) => callback(err, data));
          },
          circuits: (callback) => {
            Circuit.collection.remove((err, data) => callback(err, data));
          },
        }, (err) => done(err));
      });

      it('should return a circuit', function (done) {
        irrigation.circuits(stubs.circuits[0]._id, (err, circuit) => {
          if (err) {
            console.log(err);
            return done(err);
          }
          assert.equal(circuit._id, stubs.circuits[0]._id);
          return done();
        });
      });

      it('should return a circuit as a db document', function (done) {
        irrigation.circuits(stubs.circuits[0]._id, (err, circuit) => {
          if (err) return done(err);
          assert.equal(circuit._id, stubs.circuits[0]._id);
          assert.instanceOf(circuit, Circuit);
          return done();
        }, true);
      });

      it('should return all circuits of a controller', function (done) {
        irrigation.circuits(stubs.controllers[0]._id, (err, circuits) => {
          if (err) return done(err);
          async.each(circuits, (circuit, callback) => {
            assert.equal(circuit.controller, stubs.controllers[0]._id);
            callback();
          }, (e) => {
            if (e) return done(e);
            assert.equal(circuits.length, 2);
            return done();
          });
        });
      });

      it('should return all circuits of a controller as a db document', function (done) {
        irrigation.circuits(stubs.controllers[0]._id, (err, circuits) => {
          if (err) return done(err);
          async.each(circuits, (circuit, callback) => {
            assert.equal(circuit.controller, stubs.controllers[0]._id);
            assert.instanceOf(circuit, Circuit);
            callback();
          }, (e) => {
            if (e) return done(e);
            assert.equal(circuits.length, 2);
            return done();
          });
        }, true);
      });

      it('should return all circuits of all controllers', function (done) {
        irrigation.circuits((err, circuits) => {
          if (err) return done(err);
          assert.equal(circuits.length, 6);
          return done();
        });
      });

      it('should return all circuits of all controller as a db document', function (done) {
        irrigation.circuits((err, circuits) => {
          if (err) return done(err);
          async.each(circuits, (circuit, callback) => {
            assert.instanceOf(circuit, Circuit);
            callback();
          }, (e) => {
            if (e) return e;
            assert.equal(circuits.length, 6);
            return done();
          });
        }, true);
      });

      it('should fail if a circuit is not registered', function (done) {
        irrigation.circuits('test', (err) => {
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should fail if no circuits are registered', function (done) {
        Circuit.collection.remove((err) => {
          if (err) return done(err);
          return irrigation.circuits((e) => {
            assert.instanceOf(e, Error);
            return done();
          });
        });
      });

      it('should fail if a database error occurs', function (done) {
        const stub = sinon.stub(mongoose.Query.prototype, 'exec').yields(new Error('MongoError'));
        irrigation.circuits((err) => {
          stub.restore();
          assert.instanceOf(err, Error);
          done();
        });
      });
    });
  });

  describe('#start()', function () {
    require('../')(options, imports, (error, returns) => {
      const irrigation = returns.irrigation;

      it('should start a circuit', function (done) {
        irrigation.start(stubs.circuits[0]._id, (error, data) => {
          done();
        });
      });
      it('should fail if circuit is already started');
      it('should fail if circuit is incorrect');
    });
  });

  describe('#stop()', function () {
    it('should stop a circuit');
    it('should fail if circuit is already stopped');
    it('should fail if circuit is incorrect');
  });

});
