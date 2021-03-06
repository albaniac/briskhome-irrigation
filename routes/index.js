/**
 * @briskhome/irrigation <lib/irrigation/index.js>
 * └ routes/index.js
 *
 * Маршруты API.
 *
 * @author Егор Зайцев <ezaitsev@briskhome.com>
 * @version 0.2.0
 */

'use strict';

module.exports = function (server, imports) {

  const bus = imports.bus;
  const log = imports.log;
  const passport = imports.passport;

  // /**
  //  * Образец объявления маршрута.
  //  */
  // server.get({
  //   path: '/irrigation',
  //   version: '2.0.0',
  // },
  // passport.authenticate('localapikey', { session: false, failureRedirect: '/unauthorized' }),
  // function (req, res, next) {
  //
  // });

  /**
   * Обработка запросов на предоставление сведений о доступных контурах полива.
   */
  server.get({
    path: '/irrigation/circuits',
    version: '3.0.0',
  },
  passport.authenticate('http-header-token', {
    session: false,
    failureRedirect: '/unauthorized',
  }),
  function (req, res, next) {
    bus.once('core.api:irrigation:circuits', function (event) {
      res.send(event.data);
      return next();
    });

    bus.emit('irrigation:circuits', { module: 'core.api', data: {} });
  });

  /**
   * Обработка запросов на предоставление сведений о конкретном контуре полива.
   */
  server.get({
    path: '/irrigation/circuits/:name',
    version: '3.0.0',
  },
  passport.authenticate('http-header-token', {
    session: false,
    failureRedirect: '/unauthorized',
  }),
  function (req, res, next) {
    let circuit = req.params.name;

    bus.once('core.api:irrigation:circuits', function (event) {
      res.send(event.data);
      return next();
    });

    bus.emit('irrigation:circuits', { module: 'core.api', data: { name: req.params.name } });
  });

  /**
   * Обработка запросов на изменение статуса контура полива (запуск/отключение полива).
   */
  server.put({
    path: '/irrigation/circuits/:name',
    version: '3.0.0',
  },
  passport.authenticate('http-header-token', {
    session: false,
    failureRedirect: '/unauthorized',
  }),
  function (req, res, next) {
    let request = req.body;

    if (!request.name) {
      request.name = req.params.name;
    }

    if (request.status) {
      bus.emit('irrigation:start', { module: 'core.api', data: request });
    } else {
      bus.emit('irrigation:stop', { module: 'core.api', data: request });
    }

    res.send(202, { status: { code: 202, message: 'Accepted' } });
  });
};
