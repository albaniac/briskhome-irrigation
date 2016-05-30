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

module.exports = function (db) {

  const Schema = db.Schema;
  const ControllerSchema = new Schema({
    name: { type: String, required: true, unique: true },
    status: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  }, {
    collection: 'irrigation.controllers',
  });

  return db.model('irrigation:controller', ControllerSchema);
};
