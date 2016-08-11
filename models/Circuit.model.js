/**
 * @briskhome/irrigation <lib/irrigation/index.js>
 * └ models/Circuit.js
 *
 * Модель данных контура полива.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.2.0
 */

'use strict';

const uuid = require('uuid-1345');

module.exports = (db) => {
  const Schema = db.Schema;
  const CircuitSchema = new Schema({

    // Уникальный идентификатор (UUID) контура полива. Может использоваться UUIDv4 или UUIDv5,
    // причем в последнем случае в качестве пространства имен следует использовать идентификатор
    // устройства (контроллера полива).
    _id: {
      type: String,
      default: () => uuid.v4(),
    },

    // Наименование контура полива.
    name: {
      type: String,
      default: '',
    },

    // Идентификатор устройства (контроллера полива), к которому относится контроллер.
    controller: {
      type: String,
      required: true,
      ref: 'irrigation:controller',
    },

    // Флаг, показывающий запущен ли контур полива в настоящий момент.
    isActive: {
      type: Boolean,
      default: false,
    },

    // Флаг, показывающий отключен ли контур полива.
    isDisabled: {
      type: Boolean,
      default: false,
    },

    // Флаг, показывающий является ли контур полива резервуаром.
    isResevoir: {
      type: Boolean,
      default: false,
    },

    // Массив сенсоров, подключенных к контуру полива.
    sensors: {
      type: [String],
      default: [],
    },
  }, {
    collection: 'irrigation.circuits',
  });

  return db.model('irrigation:circuit', CircuitSchema);
};
