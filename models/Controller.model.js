/**
 * @briskhome/irrigation <lib/irrigation/index.js>
 * └ models/Controller.model.js
 *
 * Модель данных контроллера полива.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.3.0
 */

'use strict';

const uuid = require('uuid-1345');

module.exports = (db) => {
  const Schema = db.Schema;
  const ControllerSchema = new Schema({
    _id: { type: String, default: uuid.v4() },
    name: { type: String, required: true },
    status: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    // circuits: {},
  }, {
    collection: 'irrigation.controllers',
  });

  return db.model('irrigation:controller', ControllerSchema);
};
