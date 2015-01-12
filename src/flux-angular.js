'use strict';

// When requiring Angular it is added to global for some reason
var angular = global.angular || require('angular') && global.angular;

var safeDeepClone = require('./safeDeepClone.js');

var Dispatchr = require('dispatchr')();
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var util = require('util');
var storeExports = [];
var stores = [];
var storeNames = [];

var Flux = (function () {

  var Flux = function () {
    Dispatchr.apply(this, arguments);
  };

  Object.keys(Dispatchr).forEach(function (key) {
    Flux[key] = Dispatchr[key];
  });

  util.inherits(Flux, Dispatchr);

  Flux.prototype.createStore = function (name, spec) {

    spec = spec || {};

    /* Yahoo Dispatchr store interface */
    function Store(dispatcher) {
      this.dispatcher = dispatcher;

      // For conveniance, makes more sense
      this.waitFor = function (store, cb) {
        dispatcher.waitFor(store, cb.bind(this));
      };

      EventEmitter2.call(this, {
        wildcard: true
      });

      if (this.initialize) {
        this.initialize();
      }

    }

    util.inherits(Store, EventEmitter2);

    Store.handlers = spec.handlers;
    Store.storeName = name;

    Store.prototype.emitChange = function () {
      this.emit('change');
    };

    Store.prototype.exports = {};

    // Attach getters and state to the prototype
    Object.keys(spec).forEach(function (key) {
      if (key !== 'exports') {
        Store.prototype[key] = spec[key];
      }
    });

    Flux.registerStore(Store);

  };

  return Flux;
})();

var moduleConstructor = angular.module;

angular.module = function () {
  var moduleInstance = moduleConstructor.apply(angular, arguments);

  moduleInstance.store = function (storeName, storeDefinition) {
    this.factory(storeName, ['$injector', 'flux', function ($injector, flux) {

      // Detect if mocks is loaded. Remove the store and related handlers to
      // reset it
      if (angular.mock) {

        delete Dispatchr.stores[storeName];
        Object.keys(Dispatchr.handlers).forEach(function (handler) {
          Dispatchr.handlers[handler] = Dispatchr.handlers[handler].filter(function (handlerStore) {
            return handlerStore.name !== storeName;
          });
          if (!Dispatchr.handlers[handler].length) {
            delete Dispatchr.handlers[handler];
          }
        });

      }

      var storeConfig = $injector.invoke(storeDefinition);
      flux.createStore(storeName, storeConfig);

      // Grab store and create exports object bound to the store
      var store = flux.getStore(storeName);
      var storeExport = {};
      storeConfig.exports = storeConfig.exports || {};

      // Keep reference for later lookup when listening to stores
      stores.push(store);
      storeExports.push(storeExport);

      // Add cloning to returned state values
      Object.keys(storeConfig.exports).forEach(function (key) {
        storeExport[key] = function () {
          return safeDeepClone('[Circular]', [], storeConfig.exports[key].apply(store, arguments));
        };
      });
      return storeExport;
    }]);

    // Add store names for pre-injection 
    storeNames.push(storeName);
    return this;
  };

  return moduleInstance;
};

angular.module('flux', [])
  .service('flux', Flux)
  .run(['$rootScope', '$timeout', '$injector', function ($rootScope, $timeout, $injector) {

    // Pre-inject all stores
    $injector.invoke(storeNames.concat(function () {}));

    // Extend scopes with $listenTo
    $rootScope.constructor.prototype.$listenTo = function (storeExport, eventName, callback) {

      if (!callback) {
        callback = eventName;
        eventName = '*';
      }

      callback = callback.bind(this);

      var store = stores[storeExports.indexOf(storeExport)];
      var addMethod = eventName === '*' ? 'onAny' : 'on';
      var removeMethod = eventName === '*' ? 'offAny' : 'off';
      var args = eventName === '*' ? [callback] : [eventName, callback];

      store[addMethod].apply(store, args);
      this.$on('$destroy', function () {
        store[removeMethod].apply(store, args);
      });

    };
  }]);
