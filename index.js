/**
 * @briskhome
 * └briskhome-irrigation <briskhome-irrigation/index.js>
 *
 * Компонент управления поливом.
 *
 * @author  Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.3.0-rc.2
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
  const Reading = db.model('core:reading');
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

    // В конфигурационном объекте можно установить параметру `update` значение `false` чтобы от-
    // ключить автоматическую регистрацию и обновление сведений о доступных контроллерах полива.
    // const updateInterval = Object.prototype.hasOwnProperty.call(config, 'interval')
    //   ? config.interval
    //   : 0;
    //
    // if (updateInterval > 0) {
    //   log.error('test');
    //   setTimeout(this.update(() => {
    //     log.trace('Информация об устройствах компонента полива обновлена');
    //   }), updateInterval * 1000);
    // }

    this.timers = {};

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

      return this.start(job.attrs.data.circuit, {}, startErr => {
        if (startErr) {
          console.log(startErr);
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

      return this.stop(job.attrs.data.circuit, {}, stopErr => {
        if (stopErr) {
          console.log(stopErr);
          return done(stopErr);
        }

        return done();
      });
    });

    /**
     *
     */
    bus.on('irrigation:controllers', event => {
      const identify = Object.prototype.hasOwnProperty.call(event.data, '_id')
        ? event.data._id
        : null;
      const populate = Object.prototype.hasOwnProperty.call(event.data, 'populate')
        && event.data.populate;

      this.controllers(identify, { populate }, (ctrlErr, ctrlData) => {
        if (ctrlErr) {
          return bus.emit(`${event.component}:${event.responder}`, { err: ctrlErr });
        }

        return bus.emit(`${event.component}:${event.responder}`, { data: ctrlData });
      });
    });

    /**
     *
     */
    bus.on('irrigation:circuits', event => {
      const identify = Object.prototype.hasOwnProperty.call(event.data, '_id')
        ? event.data._id
        : null;
      const populate = Object.prototype.hasOwnProperty.call(event.data, 'populate')
        && event.data.populate;

      this.circuits(identify, { populate }, (circuitErr, circuitData) => {
        if (circuitErr) {
          return bus.emit(`${event.component}:${event.responder}`, { err: circuitErr });
        }

        return bus.emit(`${event.component}:${event.responder}`, { data: circuitData });
      });
    });
  }

  /**
   * Метод #update() осуществляет запрос информации о состоянии контуров и показаниях сенсоров у
   * устройств, зарегистрированных в качестве контроллеров полива, и сохраняет полученную инфор-
   * мацию в базу данных.
   */
  Irrigation.prototype.update = function update(cb) {
    Device.find({ 'services.irrigation': { $exists: true } }, (deviceFindErr, deviceFindRes) => {
      if (deviceFindErr) {
        log.warn({ err: deviceFindErr });
        return cb();
      }

      if (!deviceFindRes.length) {
        const noDevicesErr = new Error('Отсутствуют зарегистрированные устройства');
        log.warn({ err: noDevicesErr });
        return cb();
      }

      return async.each(deviceFindRes, (device, deviceDone) => {
        needle.get(`${device.address}`, (needleErr, ctrlQuery) => {
          if (needleErr) {
            log.warn({ err: needleErr });
            return deviceDone();
          }

          let ctrlRes;
          try {
            ctrlRes = JSON.parse(ctrlQuery.body.toString());
          } catch (parseErr) {
            log.warn({ err: parseErr });
            return deviceDone();
          }

          return async.each(ctrlRes.data, (ctrlResCircuit, ctrlResCircuitDone) => {
            Circuit.findOne({ _id: ctrlResCircuit._id }, (circuitFindErr, circuitFindRes) => {
              if (circuitFindErr) {
                log.warn({ err: circuitFindErr });
                return ctrlResCircuitDone();
              }

              // TODO: Проверка контуров.
              //       Необходимо проверять, зарегистрированы ли все контуры в системе или нет.
              //       Также нужно проверять, не были ли отключены какие-либо из контуров полива,
              //       зарегистрированные в системе. Таким образом, основной целью существования
              //       данной функции является максимально возможный plug-and-play в части управ-
              //       ления контроллерами полива. Аналогично с проверкой сенсоров, подключенных
              //       к любому из контуров полива: нужно проверять, актуален ли он, и если нет,
              //       то удалять связку сенсора и контура полива из базы данных (но не привязку
              //       к устройству, так как она будет использоваться для архивных данных).
              //
              //       Можно реализовать с использованием аналога функции Array#contains().

              let circuit;
              if (!circuitFindRes) {
                device.services.irrigation.circuits.push(ctrlResCircuit._id);
                circuit = new Circuit();
                circuit._id = ctrlResCircuit._id;
                circuit.controller = device._id;
              } else {
                circuit = circuitFindRes;
              }

              circuit.isActive = ctrlResCircuit.status;
              return async.each(ctrlResCircuit.sensors, (circuitSensor, circuitSensorDone) => {
                Sensor.findOne({ serial: circuitSensor.serial }, (sensorFindErr, sensorFindRes) => {
                  if (sensorFindErr) {
                    log.warn({ err: sensorFindErr });
                    return circuitSensorDone();
                  }

                  let sensor;
                  if (!sensorFindRes) {
                    circuit.sensors.push(circuitSensor.serial);
                    sensor = new Sensor();
                    sensor.device = device._id;
                    sensor.serial = circuitSensor.serial;
                    sensor.values = Object.keys(circuitSensor.values);
                  } else {
                    sensor = sensorFindRes;
                  }

                  return sensor.save(sensorSaveErr => {
                    if (sensorSaveErr) {
                      log.warn({ err: sensorSaveErr });
                      return circuitSensorDone();
                    }

                    return Reading.findOne({
                      timestamp: new Date().setUTCHours(0, 0, 0, 0),
                    }, (readingFindErr, readingFindRes) => {
                      if (readingFindErr) {
                        log.warn({ err: readingFindErr });
                        return circuitSensorDone();
                      }

                      let reading;
                      const values = circuitSensor.values;
                      values.timestamp = Date.now();

                      if (!readingFindRes) {
                        reading = new Reading();
                        reading.timestamp = new Date().setUTCHours(0, 0, 0, 0);
                      } else {
                        reading = readingFindRes;
                      }

                      reading.values.push(values);
                      return reading.save(readingSaveErr => {
                        if (readingSaveErr) {
                          log.warn({ err: readingSaveErr });
                        }

                        return circuitSensorDone();
                      });
                    });
                  });
                });
              }, () => circuit.save(circuitSaveErr => {
                if (circuitSaveErr) {
                  log.warn({ err: circuitSaveErr });
                }

                return ctrlResCircuitDone();
              }));
            });
          }, () => deviceDone());
        });
      }, () => cb(null));
    });
  };

  /**
   * Метод #controllers() возвращает список устройств, зарегистрированных в качестве контроллеров
   * полива, либо подробную информацию о контроллере, идентификатор которого был передан в качес-
   * тве первого аргумента.
   *
   * @param {String} id    Идентификатор контроллера полива.
   * @param {Object} opts  Параметры возвращаемого объекта.
   *
   * @callback cb
   */
  Irrigation.prototype.controllers = function controllers(id, opts, cb) {
    const mongoose = Object.prototype.hasOwnProperty.call(opts, 'mongoose') && opts.mongoose;
    const populate = Object.prototype.hasOwnProperty.call(opts, 'populate') && opts.populate;

    if (id) {
      if (populate) {
        Device.findOne({ _id: id }).select('-__v').lean(!mongoose).populate([{
          path: 'services.irrigation.circuits',
          model: 'irrigation:circuit',
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
        Device.findOne({ _id: id }).select('-__v').lean(!mongoose).exec(done);
      }
    } else if (populate) {
      Device.find({}).select('-__v').lean(!mongoose).populate([{
        path: 'services.irrigation.circuits',
        model: 'irrigation:circuit',
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
      Device.find({}).select('-__v').lean(!mongoose).exec(done);
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
   * Метод #circuits() возвращает список зарегистрированных контуров полива, либо подробную инфор-
   * мацию о контуре, идентификатор которого был передан в качестве первого аргумента.
   *
   * @param {String} id    Идентификатор контура полива.
   * @param {Object} opts  Параметры возвращаемого объекта.
   *
   * @callback cb
   */
  Irrigation.prototype.circuits = function circuits(id, opts, cb) {
    const mongoose = Object.prototype.hasOwnProperty.call(opts, 'mongoose') && opts.mongoose;
    const populate = Object.prototype.hasOwnProperty.call(opts, 'populate') && opts.populate;

    if (id) {
      if (populate) {
        Circuit.findOne({ _id: id }).select('-__v').lean(!mongoose).populate([{
          path: 'controller',
          model: 'core:device',
          select: 'address',
        }, {
          path: 'sensors',
          model: 'core:sensor',
        }])
          .exec(done);
      } else {
        Circuit.findOne({ _id: id }).select('-__v').lean(!mongoose).exec(done);
      }
    } else if (populate) {
      Circuit.find({}).select('-__v').lean(!mongoose).populate([{
        path: 'controller',
        model: 'core:device',
        select: 'address',
      }, {
        path: 'sensors',
        model: 'core:sensor',
      }])
      .exec(done);
    } else {
      Circuit.find({}).select('-__v').lean(!mongoose).exec(done);
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
   * Метод #start() осуществляет запуск полива указанного контура.
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
    this.circuits(id, { mongoose: true, populate: true }, (error, circuit) => {
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

      // if (opts && Object.prototype.hasOwnProperty.apply('moisture', opts) && opts.moisture > 0) {
      //   // TODO: Не реализовано.
      //   this.timers[circuit._id] = setInterval(() => {
      //
      //   }, 30 * 1000);
      // }
      //
      // if (opts && Object.prototype.hasOwnProperty.apply('time', opts) && opts.time > 0) {
      //   // TODO: Не реализовано.
      // }

      log.info({ circuit: circuit.name, data: opts },
        'Включен полив контура без указания ограничений');
    }
  };

  /**
   * Метод #stop() осуществляет остановку полива указанного контура.
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
    return this.circuits(id, { mongoose: true, populate: true }, (circuitQueryErr, circuit) => {
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
            log.warn({
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
   * Метод #schedule() осуществляет распознавание и сохранение информации о расписании включения и
   * выключении указанного контура полива, а также регистрирует расисание в компоненте core.planner.
   *
   * @param {String} id         Идентификатор контура.
   * @param {Array}  timetable  Массив расписаний контура.
   *
   * @callback cb
   */
  Irrigation.prototype.schedule = function schedule(id, timetable, cb) {
    return this.circuits(id, { mongoose: true }, (circuitFindErr, circuitFindRes) => {
      if (circuitFindErr) {
        log.warn({ err: circuitFindErr });
        return cb(circuitFindErr);
      }

      return async.each(Object.keys(timetable), (timetableDay, timetableDayCb) => {
        if (!timetable[timetableDay].length) {
          return timetableDayCb();
        }

        return async.each(timetable[timetableDay], (timetableDayPeriod, timetableIntervalCb) => {
          const start = timetableDayPeriod[0].split(':');
          const startCron = `${start[1]} ${start[0]} * * ${timetableDay}`;
          const startJob = planner.create('irrigation:start', { circuit: id });
          startJob.repeatEvery(startCron, { timezone: 'Europe/Moscow' });
          startJob.computeNextRunAt();
          return startJob.save(startJobSaveErr => {
            if (startJobSaveErr) return timetableIntervalCb(startJobSaveErr);
            const finish = timetableDayPeriod[0].split(':');
            const finishCron = `${finish[1]} ${finish[0]} * * ${timetableDay}`;
            const finishJob = planner.create('irrigation:stop', { circuit: id });
            finishJob.repeatEvery(finishCron, { timezone: 'Europe/Moscow' });
            finishJob.computeNextRunAt();
            return finishJob.save(finishJobSaveErr => {
              if (finishJobSaveErr) return timetableIntervalCb(finishJobSaveErr);
              return timetableIntervalCb();
            });
          });
        }, timetableIntervalErr => {
          if (timetableIntervalErr) {
            return timetableDayCb(timetableIntervalErr);
          }

          return timetableDayCb();
        });
      }, timetableErr => {
        if (timetableErr) {
          log.warn({ err: timetableErr });
          return cb(timetableErr);
        }

        circuitFindRes.timetable = timetable;
        return circuitFindRes.save(circuitSaveErr => {
          if (circuitSaveErr) {
            log.warn({ err: circuitSaveErr });
            return cb(circuitSaveErr);
          }

          return cb(null);
        });
      });
    });
  };

  register(null, { irrigation: new Irrigation() });
};
