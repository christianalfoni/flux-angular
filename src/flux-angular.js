'use strict';

// When requiring Angular it is added to global for some reason
var angular = global.angular || require('angular') && global.angular;

// Dependencies
var safeDeepClone = require('./safeDeepClone.js');
var Dispatchr = require('dispatchr')();
var EventEmitter2 = require('eventemitter2').EventEmitter2;

// A function that creates stores
var createStore = function (name, spec, flux) {

  spec = spec || {};

  // Constructor of a yahoo dispatchr store
  var Store = function (dispatcher) {
    this.dispatcher = dispatcher;

    // Check if store exists when waiting for it
    this.waitFor = function (stores, cb) {
      stores = Array.isArray(stores) ? stores : [stores];
      if (!flux.isStoresRegistered(stores)) {
        throw new Error('Waiting for stores that are not injected into Angular yet, ' + stores.join(', ') + '. Be sure to inject stores before waiting for them');
      }
      this.dispatcher.waitFor(stores, cb.bind(this));
    };

    // Call the constructor of EventEmitter2
    EventEmitter2.call(this, {
      wildcard: true
    });

    if (this.initialize) {
      this.initialize();
    }
  };

  // Add constructor properties, as required by Yahoo Dispatchr
  Store.handlers = spec.handlers;
  Store.storeName = name;

  // Inherits from EventEmitter2
  Store.prototype = Object.create(EventEmitter2.prototype);

  // Create conveniance for emitting change events
  Store.prototype.emitChange = function () {
    this.emit('change');
  };

  // Attach store definition to the prototype
  Object.keys(spec).forEach(function (key) {
    Store.prototype[key] = spec[key];
  });

  return Store;

};

// Flux Service is a wrapper for the Yahoo Dispatchr
var FluxService = function () {
  this.stores = [];
  this.dispatcher = new Dispatchr();

  this.dispatch = function () {
    this.dispatcher.dispatch.apply(this.dispatcher, arguments);
  };

  this.createStore = function (name, spec) {
    var store = createStore(name, spec, this);
    var storeInstance;

    // Create the exports object
    store.exports = {};

    Dispatchr.registerStore(store);
    this.stores.push(store);

    // Add cloning to exports

    if (!spec.exports) {
      throw new Error('You have to add an exports object to your store: ' + name);
    }

    storeInstance = this.dispatcher.getStore(store);
    Object.keys(spec.exports).forEach(function (key) {
      store.exports[key] = function () {
        return safeDeepClone('[Circular]', [], spec.exports[key].apply(storeInstance, arguments));
      };
    });

    return store.exports;

  };

  this.getStore = function (storeExport) {
    var store = this.stores.filter(function (store) {
      return store.exports === storeExport;
    })[0];
    return this.dispatcher.getStore(store);
  };

  this.isStoresRegistered = function (stores) {
    var exists = true;
    var storeNames = this.stores.map(function (store) {
      return store.storeName;
    });
    stores.forEach(function (storeName) {
      if (storeNames.indexOf(storeName) === -1) {
        exists = false;
      }
    });
    return exists;
  };

  this.reset = function () {
    Dispatchr.stores = {};
    Dispatchr.handlers = {};
    this.stores = [];
  };

};



// Monkeypatch angular module (add .store)

// Wrap "angular.module" to attach store method to module instance
var angularModule = angular.module;

angular.module = function () {

  // Call the module as normaly and grab the instance
  var moduleInstance = angularModule.apply(angular, arguments);

  // Attach store method to instance
  moduleInstance.store = function (storeName, storeDefinition) {

    // Create a new store
    this.factory(storeName, ['$injector', 'flux', function ($injector, flux) {

      var storeConfig = $injector.invoke(storeDefinition);
      return flux.createStore(storeName, storeConfig);

    }]);

    return this;

  };

  return moduleInstance;

};

angular.module('flux', [])
  .service('flux', FluxService)
  .run(['$rootScope', '$injector', 'flux', function ($rootScope, $injector, flux) {


    if (angular.mock) {
      flux.reset();
    }

    // Extend scopes with $listenTo
    $rootScope.constructor.prototype.$listenTo = function (storeExport, eventName, callback) {

      if (!callback) {
        callback = eventName;
        eventName = '*';
      }

      callback = callback.bind(this);

      var store = flux.getStore(storeExport);
      var addMethod = eventName === '*' ? 'onAny' : 'on';
      var removeMethod = eventName === '*' ? 'offAny' : 'off';
      var args = eventName === '*' ? [callback] : [eventName, callback];

      store[addMethod].apply(store, args);

      // Remove any listeners to the store when scope is destroyed (GC)
      this.$on('$destroy', function () {
        store[removeMethod].apply(store, args);
      });

    };

  }]);
