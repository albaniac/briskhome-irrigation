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
    _id: { type: String, default: uuid.v4() },
    name: { type: String },
    controller: { type: String, required: true, ref: 'irrigation:controller' },
    status: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    sensors: {
      level: { type: Number },
      moisture: { type: Number },
      humidity: { type: Number },
      temperature: { type: Number },
    },
  }, {
    collection: 'irrigation.circuits',
  });

  return db.model('irrigation:circuit', CircuitSchema);
};
