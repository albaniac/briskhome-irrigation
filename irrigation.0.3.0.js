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
  // const bus = imports.bus;
  // const planner = imports.planner;

  const config = imports.config('irrigation');
  const log = imports.log('irrigation', {
    circuit: 'String',
    controller: 'String',
  });

  const db = imports.db;
  const Device = db.model('core:device');
  const Sensor = db.model('core:sensor');
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
    this.timers = {};
    this.update = [];
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

        async.each(devices, processDevices, (deviceProcessErr) => {
          if (deviceProcessErr) {
            // В данной функции обрабатываются ошибки, которые прерывают регистрацию контроллеров.
            log.error({ err: deviceProcessErr });
            return cb(deviceProcessErr);
          }

          return cb();
        });
      }
    );

    /**
     * Основная функция, выполняющая обработку устройств и регистрацию контуров и сенсоров.
     * @param {Device} device  Контроллер полива (зарегистрированный или нет).
     * @callback
     */
    function processDevices(device, callback) {
      needle.get(`${device.address}`, (ctrlConnErr, ctrlConnRes) => {
        if (ctrlConnErr) {
          log.error({ err: ctrlConnErr });
          return callback();
        }

        let ctrlConnResParsed;
        try {
          ctrlConnResParsed = JSON.parse(ctrlConnRes.body);
        } catch (ctrlParseErr) {
          log.error({ err: ctrlParseErr });
          return callback();
        }

        // TODO: Проверка контуров.
        //       Необходимо проверять, зарегистрированы ли все контуры в системе или нет. Также
        //       нужно проверять, не были ли отключены какие-либо из контуров полива, зарегист-
        //       рированные в системе. Таким образом, основной целью существования данной функ-
        //       ции является максимально возможный plug-and-play в части управления контролле-
        //       рами полива. Аналогичная ситуация с проверкой сенсоров, подключенных к любому
        //       из контуров полива: нужно проверять, актуален ли он, и если нет, то удалять
        //       связку сенсора и контура полива из базы данных (но не привязку к устройству,
        //       так как она будет использоваться для архивных данных).

        device.services.irrigation.circuits = [];
        async.each(ctrlConnResParsed.data, (ctrlConnResCircuit, circuitProcessCb) => {
          Circuit.count({ _id: ctrlConnResCircuit.id }, (circuitCountErr, circuitCount) => {
            if (circuitCountErr) {
              log.error({ err: circuitCountErr });
              return circuitProcessCb();
            }

            if (circuitCount > 0) {
              return circuitProcessCb();
            }

            const circuit = new Circuit({
              _id: ctrlConnResCircuit._id,
              controller: device._id,
              isResevoir: ctrlConnResCircuit.ctrlConnResCircuit,
              sensors: [],
            });

            if (ctrlConnResCircuit.sensors) {
              async.each(ctrlConnResCircuit.sensors, (ctrlCircuitSensor, sensorProcessCb) => {
                Sensor.count({ serial: ctrlCircuitSensor.serial }, (sensorCountErr, sensorCount) => {
                  if (sensorCountErr) {
                    log.error({ err: sensorCountErr });
                    return sensorProcessCb();
                  }

                  const sensor = new Sensor({
                    serial: ctrlCircuitSensor.serial,
                    device: device._id,
                    kind: ctrlCircuitSensor.kind,
                  });

                  sensor.save((sensorSaveErr, sensorSaveRes) => {
                    if (sensorSaveErr) {
                      log.error({ err: sensorSaveErr });
                      return sensorProcessCb();
                    }

                    circuit.sensors.push(sensorSaveRes._id);
                    return sensorProcessCb();
                  });
                });
              }, sensorProcessErr => {
                if (sensorProcessErr) {
                  log.error({ err: sensorProcessErr });
                  // No return intended;
                }

                circuit.save((circuitSaveErr, circuitSaveRes) => {
                  if (circuitSaveErr) {
                    log.error({ err: circuitSaveErr });
                    return circuitProcessCb();
                  }

                  device.services.irrigation.circuits.push(circuitSaveRes._id);
                  return circuitProcessCb();
                });
              });
            }
          });
        }, circuitProcessErr => {
          if (circuitProcessErr) {
            log.error({ err: circuitProcessErr });
            return callback();
          }

          device.markModified('services');
          return device.save(deviceSaveErr => {
            if (deviceSaveErr) {
              log.error({ err: deviceSaveErr });
            }

            return callback();
          });
        });
      });
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
  Irrigation.prototype.controllers = function controllers(id, opts, cb) {
    const mongo = Object.prototype.hasOwnProperty.call(opts, 'mongo');
    const populate = Object.prototype.hasOwnProperty.call(opts, 'populate');

    if (id) {
      if (populate) {
        Device.findOne({ _id: id }).select('-__v').lean(!mongo).populate([{
          path: 'services.irrigation.circuits',
          model: 'irrigation.circuits',
          populate: {
            path: 'sensors',
            model: 'core:sensor',
            select: '-controller',
            populate: {
              path: 'sensors',
              model: 'core:sensor',
            },
          },
        }])
          .exec(done);
      } else {
        Device.findOne({ _id: id }).select('-__v').lean(!mongo).exec(done);
      }
    } else if (populate) {
      Device.find({}).select('-__v').lean(!mongo).populate([{
        path: 'services.irrigation.circuits',
        model: 'irrigation.circuits',
        populate: {
          path: 'sensors',
          model: 'core:sensor',
          select: '-controller',
          populate: {
            path: 'sensors',
            model: 'core:sensor',
          },
        },
      }])
        .exec(done);
    } else {
      Device.find({}).select('-__v').lean(!mongo).exec(done);
    }

    function done(error, data) {
      if (error) {
        log.error(error);
        return cb(error);
      } else if (id && (!data || typeof data === 'undefined')) {
        const err = new Error('Некорректный идентификатор контроллера полива');
        log.error({ err, circuit: id });
        return cb(err);
      } else if (!id && (!data.length || typeof data === 'undefined')) {
        const e = new Error('Отсутствуют данные о контроллерах полива');
        log.error({ err: e });
        return cb(e);
      }

      return cb(null, data);
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
    const populate = Object.prototype.hasOwnProperty.call(opts, 'populate');

    if (id) {
      if (populate) {
        Circuit.findOne({ _id: id }).select('-__v').lean(!mongo).populate([{
          path: 'controller',
          model: 'core:device',
          select: 'address',
        }, {
          path: 'sensors',
          model: 'core:sensor',
        }])
          .exec(done);
      } else {
        Circuit.findOne({ _id: id }).select('-__v').lean(!mongo).exec(done);
      }
    } else if (populate) {
      Circuit.find({}).select('-__v').lean(!mongo).populate([{
        path: 'controller',
        model: 'core:device',
        select: 'address',
      }, {
        path: 'sensors',
        model: 'core:sensor',
      }])
      .exec(done);
    } else {
      Circuit.find({}).select('-__v').lean(!mongo).exec(done);
    }

    function done(error, data) {
      if (error) {
        log.error(error);
        return cb(error);
      } else if (id && (!data || typeof data === 'undefined')) {
        const err = new Error('Некорректный контур полива');
        log.error({ err, circuit: id });
        return cb(err);
      } else if (!id && (!data.length || typeof data === 'undefined')) {
        const e = new Error('Отсутствуют сведения о контурах полива');
        log.error({ err: e });
        return cb(e);
      }

      return cb(null, data);
    }
  };

  /**
  *
  */
  Irrigation.prototype.start = function start(id, opts, cb) {
    this.circuits(id, { mongo: true, populate: true }, (error, circuit) => {
      if (error) return cb(error);

      if (circuit.isDisabled) {
        const err = new Error('Попытка включения отключенного контура');
        log.debug({ err, circuit: circuit.name });
        return cb(err);
      }

      if (circuit.isActive) {
        const err = new Error('Попытка включения уже включённого контура полива');
        log.debug({ err, circuit: circuit.name });
        return cb(err);
      }

      // Обработка запроса на включение полива контура
      const data = JSON.stringify({
        _id: circuit._id,
        status: true,
      });

      return needle.post(`http://${circuit.controller.address}/`, data, {
        headers: {
          'Connection': 'close',                                         /* eslint quote-props: 0 */
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      }, (err, res) => {
        if (err) {
          return cb(err);
        }
        // res?
        return monitor(circuit);
      });
    });

    function monitor(circuit) {
      circuit.isActive = true;
      circuit.save((circuitSaveErr, savedCircuit) => {
        if (circuitSaveErr) {
          // log.error()
          return cb(circuitSaveErr);
        }

        return cb(null, savedCircuit);
      });

      // Проверка свойства isResevoir отключена для совместимости с установленным оборудованием.
      // Предполагалось наличие логики включения/выключения в зависимости от показаний сенсоров.
      // В настоящее время на используемой конфигурации ультразвуковые сенсоры пока отсутствуют.
      // В дальнейшем можно усложнить проверку, наполняя объект контура типами подключенных сен-
      // соров и проверяя одновременно и тип контура и наличие опредленного типа сенсоров.
      // if (circuit.isResevoir) {
      //
      // }

      // circuit.sensors.forEach(sen)

      if (opts && Object.prototype.hasOwnProperty.apply('moisture', opts) && opts.moisture > 0) {
        this.timers[circuit._id] = setInterval(() => {
          this.circuits(circuit._id, {}, (circuitQueryErr, updatedCircuit) => {
            if (circuitQueryErr) {
              // log()
              return;
            }

            const level = parseInt(updatedCircuit.sensors.level);
            log.trace({
              circuit: circuit.name,
              data: {
                curLevel: level,
                maxLevel: config.max,
              },
            }, 'Проверка условий для выключения наполнения резервуара');
            if (level >= config.max) {
              self.stop(circuit.name);
            }
          });
        }, config.interval * 1000);
      }

      if (opts && Object.prototype.hasOwnProperty.apply('time', opts) && opts.time > 0) {

      }

      // No limit.

    }
  };

  /**
  *
  */
  Irrigation.prototype.stop = function (id, opts, cb) {
    // clearInterval(self.timers[id]);
    this.circuits(id, { mongo: true, populate: true }, (circuitQueryErr, circuit) => {
      if (circuitQueryErr) {
        // log
        return cb(circuitQueryErr);
      }

      if (!circuit.isActive) {
        const circuitActiveErr = new Error('Попытка выключения уже выключенного контура полива');
        log.debug({ err: circuitActiveErr, circuit: circuit.name });
        return cb(circuitActiveErr);
      }

      // log.trace('stopping')
      const data = JSON.stringify({
        _id: circuit._id,
        status: false,
      });

      needle.post(`http://${circuit.controller.address}/`, data, {
        headers: {
          'Connection': 'close',                                         /* eslint quote-props: 0 */
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      }, (circuitPostError, res) => {
        if (circuitPostError) {
          // log
          return cb(circuitPostError);
        }

        circuit.isActive = false;
        circuit.save(circuitSaveErr => {
          if (circuitSaveErr) {
            // log
            return cb(circuitSaveErr);
          }

          return false;
        });

        return cb(null, circuit);
      });

      return false;
    });
  };

  register(null, { irrigation: new Irrigation() });
};
