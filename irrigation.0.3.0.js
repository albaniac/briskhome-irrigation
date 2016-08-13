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
  const bus = imports.bus;
  const planner = imports.planner;

  // const config = imports.config('irrigation');
  const log = imports.log('irrigation', {
    circuit: 'String',
    controller: 'String',
  });

  const db = imports.db;
  const Device = db.model('core:device');
  const Sensor = db.model('core:sensor');
  // const Reading = db.model('core:reading');
  const Circuit = db.model('irrigation:circuit');

  /**
   * Класс Irrigation осуществляет управление контроллерами полива, подключенными к системе и заре-
   * гистрированными в качестве устройств, взаимодействующих с системой. В конструкторе осуществля-
   * ется первоначальный вызов инициализатора, который осуществляет первоначальный опрос устройств,
   * зарегистрированных в качестве контроллера полива, регистрирует данные о контурах полива и под-
   * ключенных к ним сенсорах; осуществляется регистрация класса в таких компонентах, как core.bus
   * и core.planner; настраиваются автоматические запросы актуальных данных от контроллеров полива
   * и обновление хранимой в базе данных информации.
   *
   * @constructor
   */
  function Irrigation() {
    log.info('Инициализация компонента полива');
    this.timers = {};
    this.update = [];

    /**
     * Определение задачи для компонента планировщика задач.
     * Задача `irrigation:start`
     */
    planner.define('irrigation:start', (job, done) => {
      if (!Object.prototype.hasOwnProperty.call(job.attrs.data, 'circuit')) {
        const plannerStartErr = new Error('Не определен контур');
        log.error({ err: plannerStartErr });
        return done(plannerStartErr);
      }

      return this.start(job.attrs.data.circuit, {}, (startErr) => {
        if (startErr) {
          return done(startErr);
        }

        return done();
      });
    });

    /**
    * Определение задачи для компонента планировщика задач.
    * Задача `irrigation:stop`
     */
    planner.define('irrigation:stop', (job, done) => {
      if (!Object.prototype.hasOwnProperty.call(job.attrs.data, 'circuit')) {
        const plannerStopErr = new Error('Не определен контур');
        log.error({ err: plannerStopErr });
        return done(plannerStopErr);
      }

      return this.stop(job.attrs.data.circuit, {}, (stopErr) => {
        if (stopErr) {
          return done(stopErr);
        }

        return done();
      });
    });
  }

  /**
   * Метод #init() осуществляет первоначальный отпрос всех устройств, зарегистрированных в качестве
   * контроллеров полива, получает и сохраняет данные о подключенных контурах полива и сенсорах.
   *
   * @callback cb
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

        return null;
      }
    );

    /**
     * Основная функция, выполняющая обработку устройств и регистрацию контроллеров, контуров и сен-
     * соров.
     * @param {Device} device  Устройство.
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
        //
        //       Можно реализовать с использованием одной из реализаций функции Array.contains().

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
              sensors: {},
            });

            if (ctrlConnResCircuit.sensors) {
              async.each(ctrlConnResCircuit.sensors, (ctrlCircuitSensor, sensorProcessCb) => {
                Sensor.count({
                  serial: ctrlCircuitSensor.serial,
                }, (sensorCountErr, sensorCount) => {
                  if (sensorCountErr) {
                    log.error({ err: sensorCountErr });
                    return sensorProcessCb();
                  }

                  if (sensorCount > 0) {
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

                    circuit.sensors[ctrlCircuitSensor.kind] = sensorSaveRes._id;
                    return sensorProcessCb();
                  });

                  return null;
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

            return null;
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

        return null;
      });
    }
  };

  /**
   * Метод #controllers() возвращает список устройств, зарегистрированных в качестве контроллеров
   * полива, либо подробную информацию о контроллере, идентификатор которого был передан в качестве
   * первого аргумента.
   *
   * @param {String} id    Идентификатор контроллера полива.
   * @param {Object} opts  Параметры возвращаемого объекта.
   *
   *
   * @callback cb
   */
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
   * Метод #circuits() возвращает список зарегистрированных контуров полива, либо подробную информа-
   * цию о контуре, идентификатор которого был передан в качестве первого аргумента.
   *
   * @param {String} id    Идентификатор контура полива.
   * @param {Object} opts  Параметры возвращаемого объекта.
   *
   * @callback cb
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
   * Метод #start() начинает полив указанного контура.
   *
   * @param {String} id    Идентификатор контура.
   * @param {Object} opts  Параметры и условия полива.
   *
   * @emits Irrigation#willStart
   * @emits Irrigation#didStart
   *
   * @callback cb
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

      bus.emit('irrigation:willStart', {
        circuit: circuit._id,
        controller: circuit.controller,
      });

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
      }, (err) => { // res?
        if (err) {
          return cb(err);
        }
        // res?
        return monitor.call(this, circuit);
      });
    });

    function monitor(circuit) {
      circuit.isActive = true;
      circuit.save((circuitSaveErr, savedCircuit) => {
        if (circuitSaveErr) {
          // log.error()
          return cb(circuitSaveErr);
        }

        bus.emit('irrigation:didStart', {
          circuit: savedCircuit._id,
          controller: savedCircuit.controller,
        });

        return cb(null, savedCircuit);
      });

      // Проверка свойства isResevoir отключена для совместимости с установленным оборудованием.
      // Предполагалось наличие логики включения/выключения в зависимости от показаний сенсоров.
      // В настоящее время на используемой конфигурации ультразвуковые сенсоры пока отсутствуют.
      // В дальнейшем можно усложнить проверку, наполняя объект контура типами подключенных сен-
      // соров и проверяя одновременно и тип контура и наличие опредленного типа сенсоров.
      // if (circuit.isResevoir) {
      //   // TODO: Не реализовано.
      // }

      if (opts && Object.prototype.hasOwnProperty.apply('moisture', opts) && opts.moisture > 0) {
        // TODO: Не реализовано.
        this.timers[circuit._id] = setInterval(() => {

        }, 30 * 1000);
      }

      if (opts && Object.prototype.hasOwnProperty.apply('time', opts) && opts.time > 0) {
        // TODO: Не реализовано.
      }

      log.info({ circuit: circuit.name, data: opts },
        'Включен полив контура без указания ограничений');
    }
  };

  /**
   * Метод #stop() завершает полив указанного контура.
   *
   * @param {String} id    Идентификатор контура.
   * @param {Object} opts  Параметры и условия полива.
   *
   * @emits Irrigation#willStop
   * @emits Irrigation#didStop
   *
   * @callback cb
   */
  Irrigation.prototype.stop = function stop(id, opts, cb) {
    clearInterval(this.timers[id]);
    return this.circuits(id, { mongo: true, populate: true }, (circuitQueryErr, circuit) => {
      if (circuitQueryErr) {
        // log
        return cb(circuitQueryErr);
      }

      if (!circuit.isActive) {
        const circuitActiveErr = new Error('Попытка выключения уже выключенного контура полива');
        log.debug({ err: circuitActiveErr, circuit: circuit.name });
        return cb(circuitActiveErr);
      }

      bus.emit('irrigation:willStop', {
        circuit: circuit._id,
        controller: circuit.controller,
      });

      // log.trace('stopping')
      const data = JSON.stringify({
        _id: circuit._id,
        status: false,
      });

      return needle.post(`http://${circuit.controller.address}/`, data, {
        headers: {
          'Connection': 'close',                                         /* eslint quote-props: 0 */
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      }, (circuitPostError) => {  // res?
        if (circuitPostError) {
          log.error({
            err: circuitPostError,
            circuit: circuit._id,
            controller: circuit.controller,
          });

          return cb(circuitPostError);
        }

        circuit.isActive = false;
        return circuit.save((circuitSaveErr, savedCircuit) => {
          if (circuitSaveErr) {
            log.error({
              err: circuitSaveErr,
              circuit: circuit._id,
              controller: circuit.controller,
            });

            return cb(circuitSaveErr);
          }

          bus.emit('irrigation:willStop', {
            circuit: savedCircuit._id,
            controller: savedCircuit.controller,
          });

          return cb(null, savedCircuit);
        });
      });
    });
  };

  /**
   * Метод #schedule() осуществляет распознание и сохранение информации о расписании включения и вы-
   * ключении указанного контура полива, регистрирует расисание в компоненте core.planner.
   *
   * @param {String} id         Идентификатор контура.
   * @param {Array}  timetable  Массив расписаний контура.
   *
   * @callback cb
   */
  Irrigation.prototype.schedule = function schedule(id, timetable, cb) {
    if (!id || !timetable || !cb) {
      const scheduleErr = new Error();
      log.error({ err: scheduleErr, circuit: id });
      return cb(scheduleErr);
    }

    return async.each(Object.keys(timetable), (timetableDay, timetableCb) => {
      if (!timetable[timetableDay].length) {
        return timetableCb();
      }

      return async.each(timetable[timetableDay], (timetableDayPeriod, timetableDayCb) => {
        const start = timetableDayPeriod[0].split(':');
        const startCron = `${start[1]} ${start[0]} * * ${timetableDay}`;
        const startJob = planner.create('irrigation:start', { circuit: id });
        startJob.repeatEvery(startCron, { timezone: 'Europe/Moscow' });
        return startJob.save(startJobSaveErr => {
          if (startJobSaveErr) {
            log.error({ err: startJobSaveErr });
            return timetableDayCb();
          }

          const finish = timetableDayPeriod[0].split(':');
          const finishCron = `${finish[1]} ${finish[0]} * * ${timetableDay}`;
          const finishJob = planner.create('irrigation:stop', { circuit: id });
          finishJob.repeatEvery(finishCron, { timezone: 'Europe/Moscow' });
          return finishJob.save(finishJobSaveErr => {
            if (finishJobSaveErr) {
              log.error({ err: finishJobSaveErr });
            }

            return timetableDayCb();
          });
        });
      }, timetableDayErr => {
        if (timetableDayErr) {
          log.error({ err: timetableDayErr });
        }

        return timetableCb();
      });
    }, timetableErr => {
      if (timetableErr) {
        log.error({ err: timetableErr });
        return cb(timetableErr);
      }

      return this.circuits(id, { mongo: true }, (circuitQueryErr, circuit) => {
        if (circuitQueryErr) {
          log.error({ err: circuitQueryErr, id });
          return cb(circuitQueryErr);
        }

        circuit.timetable = timetable;
        return circuit.save(circuitSaveErr => {
          if (circuitSaveErr) {
            log.error({ err: circuitSaveErr, circuit: id });
            return cb(circuitSaveErr);
          }

          return cb();
        });
      });
    });
  };

  register(null, { irrigation: new Irrigation() });
};
