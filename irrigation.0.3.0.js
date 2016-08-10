/**
* @briskhome/irrigation <lib/irrigation/index.js>
*
* Модуль управления поливом.
*
* @author Егор Зайцев <ezaitsev@briskhome.com>
* @version 0.3.0
*/

'use strict';

const async = require('async');
const needle = require('needle');

module.exports = function setup(options, imports, register) {
  const db = imports.db;
  // const bus = imports.bus;
  // const planner = imports.planner;

  // const config = imports.config('irrigation');
  const log = imports.log('irrigation', {
    circuit: 'String',
    controller: 'String',
  });

  const Device = db.model('core:device');
  const Circuit = db.model('irrigation:circuit');
  // const Measure = db.model('core:measure');

  /**
  * Класс Controller представляет собой делегата, осуществляющего управление контроллером полива,
  * расположенным на объекте. В конструкторе осуществляется определение протокола взаимодействия
  * с контроллером полива и запуск периодических задач, таких как запрос сведений о состоянии и
  * первоначальная проверка на наличие открытых клапанов.
  *
  * @constructor
  */
  function Irrigation() {
    log.info('Инициализация компонента полива');
    this.updater = [];
  }


  /**
  * Метод #init() осуществляет первоначальное взаимодействие с контроллером для выявления доступных
  * контуров полива.
  */
  Irrigation.prototype.init = function init(cb) {
    Device.find({ 'services.irrigation': { $exists: true } })
    .select('-__v')
    .exec((error, devices) => {
      if (error) {
        return cb(error);
      }

      async.each(devices, processDevices, (err) => {
        if (err) {
          log.warn('Не удалось зарегистрировать некоторые контроллеры полива');
          return cb(err);
        }
        //

        return cb();
      });
    });

    function processDevices(device, callback) {
      if (Object.keys(device.services.irrigation).length !== 0
        || Object.prototype.hasOwnProperty.call(device, 'update')) {
        return callback();
      }

      device.services.irrigation = {                        // eslint-disable-line no-param-reassign
        status: false,
        disabled: false,
        protocol: 'http',
        circuits: [],
      };

      device.markModified('services');
      device.save((error, xxx) => {
        if (error) {
          return callback(error);
        }

        needle.get(`${device.address}`, (err, res) => {
          if (err) {
            return callback(err);
          }

          let parsedBody;
          try {
            parsedBody = JSON.parse(res.body);
          } catch (e) {
            return callback(e);
          }

          async.each(parsedBody.data, (circuit, callback) => {

            Circuit.findOne({ _id: circuit._id }).lean().exec((error, results) => {
              if (error) return callback(error);
              if (results) return callback();
              const circuitScaffold = {
                _id: circuit._id,
                controller: device._id,
                status: circuit.status,
                disabled: circuit.disabled,
                type: circuit.type,
              };

              const circuitDocument = new Circuit(circuitScaffold);
              circuitDocument.save((err) => {
                if (err) {
                  return callback(err);
                }
                return callback();
              });
            });
          }, (err) => {
            if (err) return callback(err);
        return callback();
          })
        });
      });
    }

    function processCircuits(circuit, callback) {

    }
  };

  /**
  * Возвращает список зарегистрированных контроллеров полива, либо подробную информацию о
  * контроллере, идентификатор которого был передан в качестве первого аргумента.
  *
  * @param {String}  id     Идентификатор контроллера полива.
  * @param {Boolean} mongo  Признак документа базы данных.
  *
  * @callback cb
  */

  // ВНИМАНИЕ
  // В следующей версии возможно изменение API данной функции на #controllers(id, opts, cb).
  Irrigation.prototype.controllers = function controllers(id, cb, mongoose) {
    const mongo = typeof id === 'function' ? cb : mongoose;

    if (typeof id === 'string') {
      if (mongo) {
        Device.findOne({ _id: id })
        .exec(done);
      } else {
        Device.findOne({ _id: id })
        .select('-__v')
        .lean()
        .exec(done);
      }
    }

    if (typeof id === 'function') {
      if (mongo) {
        Device.find({})
        .exec(done);
      } else {
        Device.find({})
        .select('-__v')
        .lean()
        .exec(done);
      }
    }

    function done(error, data) {
      const callback = (typeof id === 'function') ? id : cb;
      if (error) {
        log.error(error);
        return callback(error);
      } else if (typeof id === 'string' && (!data || typeof data === 'undefined')) {
        const err = new Error('Некорректный идентификатор контроллера полива');
        log.error({ err, circuit: id });
        return callback(err);
      } else if (typeof id === 'function' && (!data.length || typeof data === 'undefined')) {
        const e = new Error('Отсутствуют данные о контроллерах полива');
        log.error({ err: e });
        return callback(e);
      }

      return callback(null, data);
    }
  };

  /**
  * Возвращает список доступных контуров полива, либо возвращает подробную информацию о контуре,
  * идентификатор или название которого было передано в качестве первого аргумента.
  *
  * @param {Object}  id     Идентификатор контура полива или контроллера.
  * @param {Boolean} mongo  Признак, указывающий на необходимость возврата документа Mongoose.
  *
  * @callback callback
  */
  Irrigation.prototype.circuits = function circuits(id, opts, cb) {
    const mongo = Object.prototype.hasOwnProperty.call(opts, 'mongo');
    // const populate = Object.prototype.hasOwnProperty.call(options, 'populate');

    if (id) {
      Circuit.findOne({ _id: id })
        .select('-__v')
        .lean(!mongo)
        .populate({
          path: 'controller',
          model: 'core:device',
          select: 'address',
        })
        .exec(done);
    } else {
      Circuit.find({})
        .select('-__v')
        .lean(!mongo)
        .exec(done);
    }

    function done(error, data) {
      const callback = (typeof id === 'function') ? id : cb;
      if (error) {
        log.error(error);
        return callback(error);
      } else if (id && (!data || typeof data === 'undefined')) {
        const err = new Error('Некорректный контур полива');
        log.error({ err, circuit: id });
        return callback(err);
      } else if (!id && (!data.length || typeof data === 'undefined')) {
        const e = new Error('Отсутствуют сведения о контурах полива');
        log.error({ err: e });
        return callback(e);
      }

      return callback(null, data);
    }
  };

  Irrigation.prototype.start = function start(id, opts, cb) {
    const callback = cb || (() => {});

    this.circuits(id, (error, circuit) => {
      if (error) return callback(error);

      if (circuit.status) {
        const err = new Error('Попытка включения уже включённого контура полива');
        log.debug({ err, circuit: circuit.name });
        return callback(null, err);
      }

      console.log(circuit);

      // Обработка запроса на включение полива контура
      const data = JSON.stringify({
        name: circuit.name,
        status: true,
      });

      needle.post(`rwr${data}`, data, {
        headers: {
          'Connection': 'close',                                         /* eslint quote-props: 0 */
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      }, (err, res) => {

      });
    });

    function monitor(circuit) {
      circuit.status = true;
      circuit.save((error, fetchedCitcuit) => {
        if (error) {
          // log.error()
          return cb(error);
        }

        return cb(null, fetchedCitcuit);
      });

      // Тип контура `резервуар` в настоящее время отключен
      // для совместимости с установленным оборудованием.
      // if (circuit.type === 'reservoir') {
      //
      // }

      if (opts && opts.hasOwnProperty('moisture') && opts.moisture > 0) {

      }

      if (opts && opts.hasOwnProperty('period') && opts.period > 0) {

      }

      // No limit.

    }
  };

  register(null, { irrigation: new Irrigation() });
};
