/**
*
*/
module.exports = {
  devices: [{
    _id: 'd7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
    name: 'Контроллер полива 1',
    address: '127.0.0.1',
    services: ['irrigation'],
  }, {
    _id: '9f732952-f66a-4b32-8250-655091800e43',
    name: 'Контроллер полива 2',
    address: '127.0.0.2',
    services: ['irrigation'],
  }, {
    _id: 'c26e1c28-a49d-4552-8f4c-34403de5731f',
    name: 'Контроллер полива 3',
    address: '127.0.0.3',
    services: ['irrigation'],
  }],
  controllers: [{
    _id: 'd7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
    name: 'Контроллер полива 1',
    services: ['irrigation'],
  }, {
    _id: '9f732952-f66a-4b32-8250-655091800e43',
    name: 'Контроллер полива 2',
    services: ['irrigation'],
  }, {
    _id: 'c26e1c28-a49d-4552-8f4c-34403de5731f',
    name: 'Контроллер полива 3',
    services: ['irrigation'],
  }],
  circuits: [{
    _id: '985cbb6e-eb1e-46f9-8d41-ed063175deee',
    name: 'Контур 1',
    controller: 'd7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
  }, {
    _id: 'd382a277-3aab-47fb-aa03-532b3ff8cf07',
    name: 'Контур 2',
    controller: 'd7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
  }, {
    _id: '51c8519a-fc5b-41eb-b27d-8641b7805d24',
    name: 'Контур 3',
    controller: '9f732952-f66a-4b32-8250-655091800e43',
  }, {
    _id: '6edb13cb-eb4a-4704-b5bf-f823216f69ed',
    name: 'Контур 4',
    controller: '9f732952-f66a-4b32-8250-655091800e43',
  }, {
    _id: 'f70636c9-5572-4525-9923-5a475702d56c',
    name: 'Контур 5',
    controller: 'c26e1c28-a49d-4552-8f4c-34403de5731f',
  }, {
    _id: '7cc61016-f68a-4671-99ad-960b07881f39',
    name: 'Контур 6',
    controller: 'c26e1c28-a49d-4552-8f4c-34403de5731f',
  }],
};
