/**
 * @briskhome/irrigation <lib/irrigation/index.js>
 *
 * Модуль управления поливом.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.3.0
 */

// const http = require('http');
const async = require('async');
const request = require('needle');

module.exports = function setup(options, imports, register) {
  const db = imports.db;
  // const bus = imports.bus;
  // const planner = imports.planner;

  // const config = imports.config('irrigation');
  const log = imports.log('irrigation', {
    citcuit: 'String',
    controller: 'String',
  });

  const Device = db.model('core:device');
  // const Measure = db.model('core:measure');
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
    log.info('Инициализация компонента полива');
    this.updater = [];
  }


  /**
   * Метод Init осуществляет выборку устройств, предоставляющих сервис контроллера полива
   * из базы данных. В случае, если устройство предоставляет такой сервис, массив 'services'
   * должен содержать значение 'irrigation'. При нахождении такого значения в массиве при
   * загрузке компонента такое устройство добавляется в коллекцию 'irrigation.controllers'.
   */
  Irrigation.prototype.init = function init(cb) {
    Device.find({ services: 'irrigation' })
      .select('-__v')
      .lean()
      .exec(done);

    function done(error, devices) {
      if (error) {
        return cb(error);
      }

      async.eachSeries(devices, (device, callback) => {
        Controller.findOne({ _id: device._id }).lean().exec((err, ctrl) => {
          if (err) {
            return callback(err);
          }

          if (ctrl) {
            return callback();
          }

          const controller = new Controller();
          controller._id = device._id;
          controller.name = device.name;
          controller.address = device.address;
          // controller.circuits = request();
          controller.save((e) => callback(e));
        });
      }, (e) => {
        if (e) {
          log.warn('Не удалось зарегистрировать некоторые контроллеры полива');
          return cb(e);
        }

        return cb();
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
   * @callback callback
   */
  Irrigation.prototype.controllers = function controllers(id, cb, mongoose) {
    const mongo = typeof id === 'function' ? cb : mongoose;

    if (typeof id === 'string') {
      if (mongo) {
        Controller.findOne({ _id: id })
          .exec(done);
      } else {
        Controller.findOne({ _id: id })
          .select('-__v')
          .lean()
          .exec(done);
      }
    }

    if (typeof id === 'function') {
      if (mongo) {
        Controller.find({})
          .exec(done);
      } else {
        Controller.find({})
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
  Irrigation.prototype.circuits = function circuits(id, cb, mongoose) {
    const mongo = typeof id === 'function' ? cb : mongoose;

    if (typeof id === 'string') {
      // XXX: Should this code be checking against circuit.controller field? Sure needs optimizing.
      this.controllers(id, (err, controller) => {
        if (err || !controller) {
          if (mongo) {
            Circuit.findOne({ _id: id })
              .populate('controller')
              .exec(done);
          } else {
            Circuit.findOne({ _id: id })
              .select('-__v')
              .populate('controller')
              .lean()
              .exec(done);
          }
        } else {
          if (mongo) {
            Circuit.find({ controller: id })
              .exec(done);
          } else {
            Circuit.find({ controller: id })
              .select('-__v')
              .lean()
              .exec(done);
          }
        }
      }, true);
    }

    if (typeof id === 'function') {
      // Return all circuits, all controllers.
      if (mongo) {
        Circuit.find({})
          .exec(done);
      } else {
        Circuit.find({})
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
        const err = new Error('Некорректный контур полива');
        log.error({ err, circuit: id });
        return callback(err);
      } else if (typeof id === 'function' && (!data.length || typeof data === 'undefined')) {
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

      request.post(`http://${controller.address}/`, payload, {
        headers: {
          'Connection': 'close',                                     /* eslint quote-props: 0 */
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      }, (err, res) => {

      });
    });
  };

  register(null, { irrigation: new Irrigation() });
};
