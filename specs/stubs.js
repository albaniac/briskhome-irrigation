/* eslint-disable */
module.exports = {
  devices: {
    unregistered: [{
      _id: 'd7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb',
      name: 'Контроллер полива 1',
      address: '127.0.0.1:8888',
      services: { irrigation: {
      } },
    }, {
      _id: '9f732952-f66a-4b32-8250-655091800e43',
      name: 'Контроллер полива 2',
      address: '10.0.0.2',
      services: { irrigation: {} },
    }, {
      _id: 'c26e1c28-a49d-4552-8f4c-34403de5731f',
      name: 'Контроллер полива 3',
      address: '10.0.0.3',
      services: { irrigation: {} },
    }],
    registered: [{
      _id: "d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb",
      name: "Контроллер полива 1",
      address: "127.0.0.1:8888",
      services: {
        irrigation: {
          circuits: [
            "985cbb6e-eb1e-46f9-8d41-ed063175deee",
            "d382a277-3aab-47fb-aa03-532b3ff8cf07"
          ]
        }
      },
    }],
  },

  circuits: {
    unregistered: [{
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
    registered: [{
      "_id": "985cbb6e-eb1e-46f9-8d41-ed063175deee",
      "controller": "d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb",
      "sensors": [
        "ff3d231d-eb87-455b-a1fd-72bd5c9059ba",
        "cab61681-3e29-45a0-928b-4db37f79b153"
      ],
      "isResevoir": false,
      "isDisabled": false,
      "isActive": false,
      "name": "",
      "__v": 0
    }, {
      "_id": "d382a277-3aab-47fb-aa03-532b3ff8cf07",
      "controller": "d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb",
      "sensors": [
        "7778c2c2-0529-444e-947b-ac07617428e1"
      ],
      "isResevoir": false,
      "isDisabled": false,
      "isActive": false,
      "name": "",
      "__v": 0
    }],
  },


  sensors: {
    registered: [{
      "_id": "ff3d231d-eb87-455b-a1fd-72bd5c9059ba",
      "serial": "1234567890",
      "device": "d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb",
      "values": ["distance"],
    }, {
      "_id": "cab61681-3e29-45a0-928b-4db37f79b153",
      "serial": "2345678901",
      "device": "d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb",
      "values": ["temperature"],
    }, {
      "_id": "7778c2c2-0529-444e-947b-ac07617428e1",
      "serial": "3456789012",
      "device": "d7fa0d0a-4fd9-462f-97b5-ba18fef1a7cb",
      "values": ["moisture"],
    }],
    unregistered: [],
  },

  timetables: [{
    '0': [['13:00', '14:00'], ['19:00', '20:00']],
    '1': [],
  }],

  responses: {
    normal: {
      "status": 200,
      "data": [{
        "_id": "985cbb6e-eb1e-46f9-8d41-ed063175deee",
        "status": false,
        "sensors": [{
          "serial": "1234567890",
          "values": {
            "distance": 900,
            "humidity": 19,
          },
        }, {
          "serial": "2345678901",
          "values": {
            "moisture": 900,
            "humidity": 19,
          }
        }]
      }, {
        "_id": "d382a277-3aab-47fb-aa03-532b3ff8cf07",
        "status": false,
        "sensors": [{
          "serial": "3456789012",
          "values": {
            "moisture": 900,
            "temperature": 15,
          }
        }]
      }]
    },
    incorrect: '404 Not Found',
  },

  onewire: [{
    _id: 'a3a3816f-1f6f-4a08-a40d-5a35b53439a2',
    name: 'Контроллер сенсоров 1',
    address: '127.0.0.4:8888',
    services: { onewire: {} },
  }],

}
