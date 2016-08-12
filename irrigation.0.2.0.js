/**
 * @briskhome/irrigation <lib/irrigation/index.js>
 *
 * Модуль управления поливом.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.2.0
 */


const http = require('http');

module.exports = function setup(options, imports, register) {
  const db = imports.db;
  const bus = imports.bus;
  const planner = imports.planner;

  const config = imports.config('irrigation');
  const log = imports.log('irrigation', {
    circuit: 'String',
    controller: 'String',
  });

  const Measure = db.model('core:measure');
  const Circuit = db.model('irrigation:circuit');
  // const Controller = db.model('irrigation:controller');

  /**
  * Класс Controller представляет собой делегата, осуществляющего управление контроллером полива,
  * расположенным на объекте. В конструкторе осуществляется определение протокола взаимодействия
  * с контроллером полива и запуск периодических задач, таких как запрос сведений о состоянии и
  * первоначальная проверка на наличие открытых клапанов.
  *
  * @constructor
  */
  function Irrigation() {
    const self = this;
    log.info('Инициализация компонента полива');

    /**
     * Инициализатор делегата контроллера полива по протоколу HTTP.
     */
    if (config.controller.mode === 'http') {
      self.update = setInterval(() => {
        let data = '';
        const request = http.request({
          host: config.controller.address,
          port: config.controller.port,
          path: '/',
          method: 'GET',
        }, (res) => {
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            log.trace('Получение обновлённой информации о контурах полива');

            let response;
            try {
              response = JSON.parse(data.toString());
            } catch (err) {
              err.data = data.toString();
              log.error(err, 'Не удалось прочитать сообщение от контроллера');
              return;
            }

            response.data.forEach((payload) => {
              self.circuits(payload.name, (err, circuit) => {
                if (err) return;

                Object.keys(payload.sensors).forEach((sensor) => {
                  const measure = new Measure();
                  circuit.sensors[sensor] = payload.sensors[sensor];
                  measure.sensor = `${payload.name}:${sensor}`;
                  measure.value = payload.sensors.sensor;
                  measure.save();
                });

                circuit.status = payload.status;
                circuit.save();
              }, true);
            });
          });
        });

        request.on('error', (err) => {
          log.error(err, 'Не удалось установить соединение с контроллером');
          return;
        });

        request.end();
      }, config.interval * 1000);
    }

    /**
     * Инициализатор делегата контроллера полива по протоколу MQTT.
     */
    if (config.controller.mode === 'mqtt') {
      bus.on('broadcast:irrigation', (event) => {
        if (event.data.topic.split('/')[2] === 'circuits') {
          self.circuits(event.data.topic.split('/').pop(), (err, circuit) => {
            if (err) return;

            let payload;
            try {
              payload = JSON.parse(event.data.payload);
            } catch (e) {
              log.warn({ err: e, event }, 'Не удалось прочитать сообщение от контроллера');
              return;
            }

            Object.keys(payload.sensors).forEach((sensor) => {
              const measure = new Measure();
              circuit.sensors[sensor] = payload.sensors[sensor];
              measure.sensor = `${payload.name}:${sensor}`;
              measure.value = payload.sensors.sensor;
              measure.save();
            });

            circuit.status = payload.status;
            circuit.save();
          }, true);
        }
      });
    }

    /**
     * Подписка на событие `irrigation:start`, полученное по шине событий.
     * Интерфейс для взаимодействия компонентов без установления прямых зависимостей.
     */
    bus.on('irrigation:start', (event) => {
      const circuit = event.data.circuit || ''; // hasOwnProperty?
      const options = event.data.options || {}; // hasOwnProperty?
      log.debug({ event, circuit }, 'Получен запрос на включение полива по шине событий');
      self.start(circuit, options);
    });

    /**
    * Подписка на событие `irrigation:stop`, полученное по шине событий.
    * Интерфейс для взаимодействия компонентов без установления прямых зависимостей.
     */
    bus.on('irrigation:stop', (event) => {
      const circuit = event.data.circuit || ''; // hasOwnProperty?
      log.debug({ event, circuit }, 'Получен запрос на выключение полива по шине событий');
      self.stop(circuit);
    });

    /**
    * Подписка на событие `irrigation:circuits`, полученное по шине событий.
    * Интерфейс для взаимодействия компонентов без установления прямых зависимостей.
     */
    bus.on('irrigation:circuits', (event) => {
      log.debug(event, 'Получен запрос контуров полива по шине событий');
      // var hasBarProperty = {}.hasOwnProperty.call(foo, "bar");
      if (event.data.hasOwnProperty('circuit')) {
        self.circuits(event.data.circuit, (err, circuit) => {
          if (err) return;

          bus.emit(`${event.module}:irrigation:circuits`, {
            component: 'irrigation',
            data: circuit,
          });
        });
      } else {
        self.circuits((err, data) => {
          if (err) return;

          bus.emit(`${event.module}:irrigation:circuits`, {
            component: 'irrigation',
            data,
          });
        });
      }
    });

    /**
     * Определение задачи для компонента планировщика задач.
     * Задача `irrigation:start`
     */
    planner.define('irrigation:start', (job, done) => {
      // var hasBarProperty = {}.hasOwnProperty.call(foo, "bar");
      if (!job.attrs.data.hasOwnProperty('circuit')) {
        done(new Error('Не определен контур полива!'));
      }

      bus.emit('irrigation:start', {
        module: 'core.planner',
        data: {
          circuit: job.attrs.data.circuit,
          trigger: 'core.planner',
        },
      });

      done();
    });

    /**
    * Определение задачи для компонента планировщика задач.
    * Задача `irrigation:stop`
     */
    planner.define('irrigation:stop', (job, done) => {
      // var hasBarProperty = {}.hasOwnProperty.call(foo, "bar");
      if (!job.attrs.data.hasOwnProperty('circuit')) {
        done(new Error('Не определен контур полива!'));
      }

      bus.emit('irrigation:stop', {
        module: 'core.planner',
        data: {
          circuit: job.attrs.data.circuit,
          trigger: 'core.planner',
        },
      });

      done();
    });

    /**
     * Объект `timers` хранит таймеры активных контуров.
     * @private
     */
    self.timers = {};

    /**
     * Функция при создании делегата контроллера проверяет наличие в базе данных
     * записей об открытых контурах и, если они есть, завершает полив таких контуров.
     * @private
     */
    (() => {
      self.circuits((err, data) => {
        if (err) return;

        data.forEach((circuit) => {
          if (circuit.status) {
            log.warn(
              { circuit: circuit.name },
              'При инициализации обнаружен включенный полив контура'
            );
            self.stop(circuit.name, () => {
              // В случае ошибки она уже будет записана в журнал, поэтому ответ нас не интересует.
            });
          }
        });
      });
    })();
  }

  /**
   * Начинает полив указанного контура.
   *
   * @param {String} id       Идентификатор или название контура полива.
   * @param {Object} options  Концигурационный объект.
   * @callback callback
   */
  Irrigation.prototype.start = function start(id, options, callback) {
    if (typeof callback === 'undefined') callback = () => {};

    const self = this;
    self.circuits(id, (err, circuit) => {
      if (err) return callback(err);

      if (circuit.status) {
        log.debug({ circuit: circuit.name }, 'Попытка включения уже включённого контура полива');
        return callback(null, err);
      } else {
        log.trace({ circuit: circuit.name }, 'Обработка запроса на включение контура полива');

        if (config.controller.mode === 'http') {
          const payload = JSON.stringify({
            name: circuit.name,
            status: true,
          });

          let data = '';
          const request = http.request({
            host: config.controller.address,
            port: config.controller.port,
            path: '/',
            method: 'POST',
            headers: {
              'Connection': 'close',                                     /* eslint quote-props: 0 */
              'Content-Type': 'application/json',
              'Content-Length': payload.length,
            },
          }, (res) => {
            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              let response;
              try {
                response = JSON.parse(data.toString());
              } catch (e) {
                e.data = data.toString();
                log.error({ err: e }, 'Не удалось прочитать сообщение от контроллера');
                return callback(e);
              }

              return monitor(circuit, options);
            });
          });

          request.on('error', (err) => {
            log.warn(err, 'Контроллер недоступен');
            return callback(err);
          });

          request.write(payload);
          request.end();
        }

        if (config.controller.mode === 'mqtt') {
          bus.emit('core.mqtt:publish', {
            component: 'irrigation',
            data: {
              topic: `/irrigation/circuits/${circuit.name}`,
              payload: `{"name": "${circuit.name}", "status": true}`,
              qos: 0,
              retain: false,
            },
          });

          return monitor(circuit, options);
        }
      }
    }, true);

    function monitor(circuit, options) {
      circuit.status = true;
      circuit.save();
      callback(null, circuit);

      if (circuit.name === 'tank') { /** @todo 0.3.0 добавить свойство "резервуар" контуру полива */
        log.info({ circuit: circuit.name, data: options }, 'Включено наполнение резервуара');
        self.timers[circuit.name] = setInterval(() => {
          self.circuits(circuit.name, (err, tank) => {
            // TODO: Handle error.
            const level = parseInt(tank.sensors.level);
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
      } else if (options && options.hasOwnProperty('moisture') && options.moisture > 0) {
        log.info({
          circuit: circuit.name,
          data: options,
        }, 'Включен полив контура с ограничением по влажности почвы');
        self.timers[circuit.name] = setInterval(() => {
          self.circuits('tank', (err, tank) => {
            // TODO: Handle error.
            self.circuits(circuit.name, (err, data) => {
              // TODO: Handle error.
              const level = parseInt(tank.sensors.level);
              const moisture = parseInt(data.sensors.moisture);
              log.trace({
                circuit: circuit.name,
                data: {
                  curlevel: level,
                  minlevel: config.min,
                  curmoisture: moisture,
                  maxmoisture: options.moisture,
                },
              }, 'Проверка условий для выключения контура полива');
              if (moisture >= options.moisture || level <= config.min) {
                self.stop(circuit.name);
              }
            });
          });
        }, config.interval * 1000);
      } else if (options && options.hasOwnProperty('period') && options.period > 0) {
        log.info(
          { circuit: circuit.name, data: options },
          'Включен полив контура с ограничением по времени'
        );
        let i = options.period / config.interval;
        self.timers[circuit.name] = setInterval(() => {
          self.circuits('tank', (err, tank) => {
            // TODO: Handle error.
            self.circuits(circuit.name, (err, data) => {
              // TODO: Handle error.
              const level = parseInt(tank.sensors.level);
              log.trace({
                circuit: circuit.name,
                data: {
                  curlevel: level,
                  minlevel: config.min,
                  timeleft: i,
                },
              }, 'Проверка условий для выключения контура полива');
              if (!i || level >= config.max) {
                self.stop(circuit.name);
              }

              i--;
            });
          });
        }, config.interval * 1000);
      } else {
        log.info({
          circuit: circuit.name,
          data: options,
        }, 'Включен полив контура без указания ограничений');
        self.timers[circuit.name] = setInterval(() => {
          // TODO: Handle error.
          self.circuits('tank', (err, tank) => {
            // TODO: Handle error.
            const level = parseInt(tank.sensors.level);
            log.trace({
              circuit: circuit.name,
              data: {
                curlevel: level,
                minlevel: config.min,
              },
            }, 'Проверка условий для выключения контура полива');
            if (level >= config.max) {
              self.stop(circuit.name);
            }
          });
        }, config.interval * 1000);
      }
    }
  };

  /**
   * Завершает полив указанного контура.
   *
   * @param {String} id       Идентификатор или название контура полива.
   * @callback callback
   */
  Irrigation.prototype.stop = function stop(id, callback) {
    if (typeof callback === 'undefined') callback = () => {};
    const self = this;
    clearInterval(self.timers[id]);
    self.circuits(id, (err, circuit) => {
      if (err) return callback(err);

      if (!circuit.status) {
        log.debug({ circuit: circuit.name }, 'Попытка выключения уже выключенного контура полива');
        return callback(err);
      } else {
        log.trace({ circuit: circuit.name }, 'Обработка запроса на включение контура полива');
        if (config.controller.mode === 'http') {
          const payload = JSON.stringify({
            name: circuit.name,
            status: false,
          });

          let data = '';
          const request = http.request({
            host: config.controller.address,
            port: config.controller.port,
            path: '/',
            method: 'POST',
            headers: {
              'Connection': 'close',
              'Content-Type': 'application/json',
              'Content-Length': payload.length,
            },
          }, (res) => {
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              let response;
              try {
                response = JSON.parse(data.toString());
              } catch (e) {
                e.data = data.toString();
                log.error({ err: e }, 'Не удалось прочитать сообщение от контроллера');
                return callback(e);
              }

              /*
                Ответ должен быть 200 OK, в противном случае контроллер настроен некорректно.
              */
              circuit.status = false;
              circuit.save();

              log.info({ circuit: circuit.name }, 'Полив контура выключен');
              return callback(null, circuit);
            });
          });

          request.on('error', (err) => {
            log.error(err, 'Не удалось установить соединение с контроллером');
            return callback(err);
          });

          request.write(payload);
          request.end();
        }

        if (config.controller.mode === 'mqtt') {
          bus.emit('core.mqtt:publish', {
            component: 'irrigation',
            data: {
              topic: `/irrigation/circuits/${circuit.name}`,
              payload: `{"name": "${circuit.name}", "status": false}`,
              qos: 0,
              retain: true,
            },
          });

          circuit.status = false;
          circuit.save();

          log.info({ circuit: circuit.name }, 'Полив контура выключен');
          callback(null, circuit);
        }
      }
    }, true);
  };

  /**
   * Возвращает список доступных устройств с зарегистрированным сервисом 'irrigation'. Одно такое
   * устройство может выступать в роли одного контроллера полива.
   *
   * @param {String}  id     Идентификатор или название устройства, предоставляющего службу
   *                         'irrigation'.
   * @param {Boolean} mongo  Признак, указывающий на необходимость возврата документа Mongoose.
   *
   * @callback callback
   */

  Irrigation.prototype.controllers = function controllers(id, callback, mongoose) {
    return null;
  };

  /**
   * Возвращает список доступных контуров полива, либо возвращает подробную информацию о контуре,
   * идентификатор или название которого было передано в качестве первого аргумента.
   *
   * @param {Object}  id     Идентификатор или название контура полива.
   * @param {Boolean} mongo  Признак, указывающий на необходимость возврата документа Mongoose.
   *
   * @callback callback
   */
  Irrigation.prototype.circuits = function circuits(id, callback, mongoose) {
    const self = this;
    const done = (err, data) => {
      if (err) {
        log.error(err);
        return callback(err);
      } else if (typeof id === 'string' && (!data || typeof data === 'undefined')) {
        const e = new Error('Некорректный контур полива');
        log.error({ err: e, circuit: id });
        return callback(err);
      } else if (typeof id === 'function' && (!data.length || typeof data === 'undefined')) {
        const e = new Error('Отсутствуют сведения о контурах полива');
        log.error({ err: e });
        return callback(err);
      }

      return callback(null, data);
    };

    if (typeof id === 'string') {
      // FIXME: change to imports.db.Types.ObjectId?
      const ObjectId = require('mongoose').Types.ObjectId;

      const circuitName = id;
      const circuitId = new ObjectId(circuitName.length < 12 ? '000000000000' : circuitName);
      if (mongoose) {
        Circuit.findOne({ $or: [{ _id: circuitId }, { name: circuitName }] })
          .exec(done);
      } else {
        Circuit.findOne({ $or: [{ _id: circuitId }, { name: circuitName }] })
          .select('-_id')
          .select('-__v')
          .lean()
          .exec(done);
      }
    }

    if (typeof id === 'function') {
      callback = id;
      if (mongoose) {
        Circuit.find({})
          .exec(done);
      } else {
        Circuit.find({})
          .select('-_id')
          .select('-__v')
          .lean()
          .exec(done);
      }
    }
  };

  Irrigation.prototype.schedule = function schedule(data, opts) {
    // TODO: NEED TO DEFINE OBJECT STRUCTURE FOR 'DATA'
    // TODO: Inverse if-then below to return err to callback
    // TODO: Add callback
    if (typeof data !== 'undefined' && typeof opts !== 'undefined') {
      Object.keys(data).forEach((day) => {
        if (data[day].length > 0) {
          for (let i = 0; i < data[day].length; i++) {
            const start = data[day][i][0].split(':');
            const startcron = `${start[1]} ${start[0]} * * ${day}`;
            planner.every(
              startcron,
              'irrigation:start',
              { circuit: data.circuit, options: data.options },
              { timezone: 'Europe/Moscow' }
            );

            const end = data[day][i][1].split(':');
            const endcron = `${end[1]} ${end[0]} * * ${day}`;
            planner.every(
              endcron,
              'irrigation:stop',
              { circuit: data.circuit, options: opts.options },
              { timezone: 'Europe/Moscow' }
            );
          }
        }
      });
    }
  };

  register(null, {
    irrigation: new Irrigation(),
  });
};
