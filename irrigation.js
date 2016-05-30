/**
 * @briskhome/irrigation <lib/irrigation/index.js>
 *
 * Модуль управления поливом.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.2.0
 */

'use strict';

module.exports = function setup(options, imports, register) {

  const http = require('http');

  const db = imports.db;
  const bus = imports.bus;
  const mqtt = imports.mqtt;

  const config = imports.config('irrigation');
  const log = imports.log('irrigation', {
    circuit: 'String',
    controller: 'String',
  });

  // const Record = db.model('core:record');
  const Measure = db.model('core:measure');
  const Circuit = db.model('irrigation:circuit');
  const Controller = db.model('irrigation:controller');

  /**
  * Класс Controller представляет собой делегата, осуществляющего управление контроллером полива,
  * расположенным на объекте. В конструкторе осуществляется определение протокола взаимодействия
  * с контроллером полива и запуск периодических задач, таких как запрос сведений о состоянии и
  * первоначальная проверка на наличие открытых клапанов.
  *
  * @constructor
  */
  function Irrigation() {
    const _this = this;
    log.info('Инициализация соединения с контроллером полива в режиме ' + config.controller.mode.toUpperCase());

    /**
     * Инициализатор делегата контроллера полива по протоколу HTTP.
     */
    if (config.controller.mode === 'http') {
      _this.update = setInterval(function () {
        let data = '';
        const request = http.request({
          host: config.controller.address,
          port: config.controller.port,
          path: '/',
          method: 'GET',
        }, function (res) {
          res.on('data', function (chunk) {
            data += chunk;
          });
          res.on('end', function () {
            log.trace('Получение обновлённой информации о контурах полива');

            let response;
            try {
              response = JSON.parse(data.toString());
            } catch (err) {
              err.data = data.toString();
              log.error(err, 'Не удалось прочитать сообщение от контроллера');
              return;
            }

            response.data.forEach(function (payload, index) {
              _this.circuits(payload.name, function (err, circuit) {
                if (err) return;

                Object.keys(payload.sensors).forEach(function (sensor, index) {
                  let measure = new Measure();
                  circuit.sensors[sensor] = payload.sensors[sensor];
                  measure.sensor = String(payload.name + ':' + sensor);
                  measure.value = payload.sensors.sensor;
                  measure.save();
                });

                circuit.status = payload.status;
                circuit.save();
              }, true);
            });
          });
        });

        request.on('error', function (err) {
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
      bus.on('broadcast:irrigation', function (event) {
        if (event.data.topic.split('/')[2] === 'circuits') {
          _this.circuits(event.data.topic.split('/').pop(), function (err, circuit) {
            if (err) return;

            let payload;
            try {
              payload = JSON.parse(event.data.payload);
            } catch (err) {
              log.warn({ err, event }, 'Не удалось прочитать сообщение от контроллера');
              return;
            }

            Object.keys(payload.sensors).forEach(function (sensor, index) {
              let measure = new Measure();
              circuit.sensors[sensor] = payload.sensors[sensor];
              measure.sensor = String(payload.name + ':' + sensor);
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
    bus.on('irrigation:start', function (event) {
      const circuit = event.data.circuit || ''; // hasOwnProperty?
      const options = event.data.options || {}; // hasOwnProperty?
      log.debug({ event, circuit }, 'Получен запрос на включение полива по шине событий');
      _this.start(circuit, options);
    });

    /**
    * Подписка на событие `irrigation:stop`, полученное по шине событий.
    * Интерфейс для взаимодействия компонентов без установления прямых зависимостей.
     */
    bus.on('irrigation:stop', function (event) {
      const circuit = event.data.circuit || ''; // hasOwnProperty?
      log.debug({ event, circuit }, 'Получен запрос на выключение полива по шине событий');
      _this.stop(circuit);
    });

    /**
    * Подписка на событие `irrigation:circuits`, полученное по шине событий.
    * Интерфейс для взаимодействия компонентов без установления прямых зависимостей.
     */
    bus.on('irrigation:circuits', function (event) {
      log.debug(event, 'Получен запрос контуров полива по шине событий');
      if (event.data.hasOwnProperty('circuit')) {
        _this.circuits(event.data.circuit, function (err, circuit) {
          if (err) return;

          bus.emit(event.module + ':' + 'irrigation:circuits', {
            component: 'irrigation',
            data: circuit,
          });
        });
      } else {
        _this.circuits(function (err, data) {
          if (err) return;

          bus.emit(event.module + ':' + 'irrigation:circuits', {
            component: 'irrigation',
            data,
          });
        });
      }
    });

    /**
     * Объект `timers` хранит таймеры активных контуров.
     * @private
     */
    _this.timers = {};

    /**
     * Функция при создании делегата контроллера проверяет наличие в базе данных
     * записей об открытых контурах и, если они есть, завершает полив таких контуров.
     * @private
     */
    (function () {
      _this.circuits(function (err, data) {
        if (err) return;

        data.forEach(function (circuit) {
          if (circuit.status) {
            log.warn({ circuit: circuit.name }, 'При инициализации обнаружен включенный полив контура');
            _this.stop(circuit.name, function(err, data) {
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
    const _this = this;
    _this.circuits(id, function (err, circuit) {
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
              'Connection': 'close',
              'Content-Type': 'application/json',
              'Content-Length': payload.length,
            },
          }, function (res) {
            res.on('data', function (chunk) {
              data += chunk;
            });
            res.on('end', function () {
              let response;
              try {
                response = JSON.parse(data.toString());
              } catch (err) {
                err.data = data.toString();
                log.error(err, 'Не удалось прочитать сообщение от контроллера');
                return callback(err);
              }
              return monitor(circuit, options);
            });
          });

          request.on('error', function (err) {
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
              topic: '/irrigation/circuits/' + circuit.name,
              payload: '{\"name\": \"' + circuit.name + '\", \"status\": true}',
              qos: 0,
              retain: false,
            },
          });

          monitor(circuit, options);
        }
      }
    }, true);

    function monitor(circuit, options) {
      circuit.status = true;
      circuit.save();
      callback(null, circuit);

      if (circuit.name === 'tank') { /** @todo 0.3.0 добавить свойство "резервуар" контуру полива */
        log.info({ circuit: circuit.name, data: options }, 'Включено наполнение резервуара');
        _this.timers[circuit.name] = setInterval(function () {
          _this.circuits(circuit.name, function (err, tank) {
            const level = parseInt(tank.sensors.level);
            log.trace({ circuit: circuit.name, data: {
              curLevel: level,
              maxLevel: config.max,
            }}, 'Проверка условий для выключения наполнения резервуара');
            if (level >= config.max) {
              _this.stop(circuit.name);
            }
          });
        }, config.interval * 1000);
      } else if (options && options.hasOwnProperty('moisture') && options.moisture > 0) {
        log.info({ circuit: circuit.name, data: options }, 'Включен полив контура с ограничением по влажности почвы');
        _this.timers[circuit.name] = setInterval(function () {
          _this.circuits('tank', function (err, tank) {
            _this.circuits(circuit.name, function (err, data) {
              const level = parseInt(tank.sensors.level);
              const moisture = parseInt(data.sensors.moisture);
              log.trace({ circuit: circuit.name, data: {
                curlevel: level,
                minlevel: config.min,
                curmoisture: moisture,
                maxmoisture: options.moisture,
              }}, 'Проверка условий для выключения контура полива');
              if (moisture >= options.moisture || level <= config.min) {
                _this.stop(circuit.name);
              }
            });
          });
        }, config.interval * 1000);
      } else if (options && options.hasOwnProperty('period') && options.period > 0) {
        log.info({ circuit: circuit.name, data: options }, 'Включен полив контура с ограничением по времени');
        let i = options.period / config.interval;
        _this.timers[circuit.name] = setInterval(function () {
          _this.circuits('tank', function (err, tank) {
            _this.circuits(circuit.name, function (err, data) {
              const level = parseInt(tank.sensors.level);
              log.trace({ circuit: circuit.name, data: {
                curlevel: level,
                minlevel: config.min,
                timeleft: i,
              }}, 'Проверка условий для выключения контура полива');
              if (!i || level >= config.max) {
                _this.stop(circuit.name);
              }

              i--;
            });
          });
        }, config.interval * 1000);
      } else {
        log.info({ circuit: circuit.name, data: options }, 'Включен полив контура без указания ограничений');
        _this.timers[circuit.name] = setInterval(function () {
          _this.circuits('tank', function (err, tank) {
            const level = parseInt(tank.sensors.level);
            log.trace({ circuit: circuit.name, data: {
               curlevel: level,
               minlevel: config.min,
            }}, 'Проверка условий для выключения контура полива');
            if (level >= config.max) {
              _this.stop(circuit.name);
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
    const _this = this;
    clearInterval(_this.timers[id]);
    _this.circuits(id, function (err, circuit) {
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
          }, function (res) {
            res.on('data', function (chunk) {
              data += chunk;
            });
            res.on('end', function () {
              let response;
              try {
                response = JSON.parse(data.toString());
              } catch (err) {
                err.data = data.toString();
                log.error(err, 'Не удалось прочитать сообщение от контроллера');
                return callback(err);
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

          request.on('error', function (err) {
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
              topic: '/irrigation/circuits/' + circuit.name,
              payload: '{\"name\": \"' + circuit.name + '\", \"status\": false}',
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
   * Возвращает список доступных контуров полива, либо возвращает подробную информацию о контуре,
   * идентификатор или название которого было передано в качестве первого аргумента.
   *
   * @param {Object}  id     Идентификатор или название контура полива.
   * @param {Boolean} mongo  Признак, указывающий на необходимость возврата документа Mongoose.
   *
   * @callback callback
   */
  Irrigation.prototype.circuits = function circuits(id, callback, mongoose) {
    const _this = this;
    const done = function (err, data) {
      if (err) {
        log.error(err);
        callback(err);
      } else if (typeof id === 'string' && (!data || typeof data === 'undefined')) {
        const err = new Error('Некорректный контур полива');
        log.error({ err, circuit: id });
        callback(err);
      } else if (typeof id === 'function' && (!data.length || typeof data === 'undefined')) {
        const err = new Error('Отсутствуют сведения о контурах полива');
        log.error(err);
        callback(err);
      } else {
        return callback(null, data);
      }
    };

    if (typeof id === 'string') {
      let ObjectId = require('mongoose').Types.ObjectId;
      let circuitName = id;
      let circuitId = new ObjectId(circuitName.length < 12 ? '000000000000' : circuitName);
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

  register(null, {
    irrigation: new Irrigation(),
  });
};
