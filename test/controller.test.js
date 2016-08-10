/**
*
*/

'use strict';

const http = require('http');

const hostname = '127.0.0.1';
const port = 5000;

const data = [{
  _id: '985cbb6e-eb1e-46f9-8d41-ed063175deee',
  status: false,
}, {
  _id: 'd382a277-3aab-47fb-aa03-532b3ff8cf07',
  status: false,
}];

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
});

server.listen(port, hostname);
