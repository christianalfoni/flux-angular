'use strict';

// When requiring Angular it is added to global for some reason
var angular = global.angular || require('angular') && global.angular;

// Dependencies
var Baobab = require('baobab');
var Dispatchr = require('dispatchr')();

var angularModule = angular.module;
var stores = [];

// A function that creates stores
var createStore = function (name, spec, immutableDefaults, flux) {

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

    if (!this.initialize) {
      throw new Error('Store ' + name + ' does not have an initialize method which is is necessary to set the initial state');
    }

    this.initialize();
  };

  // Add constructor properties, as required by Yahoo Dispatchr
  Store.handlers = spec.handlers;
  Store.storeName = name;

  // Instantiates immutable state and saves it to private variable that can be used for setting listeners
  Store.prototype.immutable = function (initialState, options) {
    if (this.__tree) {
      this.__tree.set(initialState);
    } else {
      this.__tree = new Baobab(initialState, angular.extend({}, immutableDefaults, options));
    }
    return this.__tree;
  };

  Store.prototype.monkey = Baobab.monkey;

  // Attach store definition to the prototype
  Object.keys(spec).forEach(function (key) {
    Store.prototype[key] = spec[key];
  });

  return Store;

};

// Flux Service is a wrapper for the Yahoo Dispatchr
var FluxService = function (immutableDefaults) {
  this.stores = [];
  this.dispatcher = new Dispatchr();

  this.dispatch = function () {
    if (stores.length) {
      console.warn('There are still stores not injected: ' + stores.join(',') + '. Make sure to inject all stores before running any dispatches.');
    }
    this.dispatcher.dispatch.apply(this.dispatcher, arguments);
  };

  this.createStore = function (name, spec) {

    var store = createStore(name, spec, immutableDefaults, this);
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

      // Create a getter
      var descriptor = Object.getOwnPropertyDescriptor(spec.exports, key);
      if (descriptor.get) {
        Object.defineProperty(store.exports, key, {
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable,
          get: function () {
            return descriptor.get.apply(storeInstance, arguments);
          }
        });
      } else {
        store.exports[key] = function () {
          return spec.exports[key].apply(storeInstance, arguments);
        };
        spec.exports[key] = spec.exports[key].bind(storeInstance);
      }

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
    stores = [];
  };

  // Expose Baobab in case user wants access to it for use outside a store
  this.Baobab = Baobab;
};

// Monkeypatch angular module (add .store)

// Wrap "angular.module" to attach store method to module instance
angular.module = function () {

  // Call the module as normaly and grab the instance
  var moduleInstance = angularModule.apply(angular, arguments);

  // Attach store method to instance
  moduleInstance.store = function (storeName, storeDefinition) {

    // Add to stores array
    stores.push(storeName);

    // Create a new store
    this.factory(storeName, ['$injector', 'flux', function ($injector, flux) {

      var storeConfig = $injector.invoke(storeDefinition);
      stores.splice(stores.indexOf(storeName), 1);
      return flux.createStore(storeName, storeConfig);

    }]);

    return this;

  };

  return moduleInstance;

};

angular.module('flux', [])
  .provider('flux', function FluxProvider () {
    var immutableDefaults = {};

    // Defaults that are passed on to Baobab: https://github.com/Yomguithereal/baobab#options
    this.setImmutableDefaults = function (defaults) {
      immutableDefaults = defaults;
    };

    this.$get = [function fluxFactory () {
      return new FluxService(immutableDefaults);
    }];
  })
  .run(['$rootScope', '$injector', 'flux', function ($rootScope, $injector, flux) {
    if (angular.mock) {
      flux.reset();
    }

    // Extend scopes with $listenTo
    $rootScope.constructor.prototype.$listenTo = function (storeExport, mapping, callback) {
      var cursor;
      var store = flux.getStore(storeExport);

      if (!store.__tree) {
        throw new Error('Store ' + storeExport.storeName + ' has not defined state with this.immutable() which is required in order to use $listenTo');
      }

      if (!callback) {
        callback = mapping;
        cursor = store.__tree;
      } else {
        cursor = store.__tree.select(mapping);
      }

      cursor.on('update', callback);

      // Call the callback so that state gets the initial sync with the view-model variables
      callback({});

      // Remove the listeners on the store when scope is destroyed (GC)
      this.$on('$destroy', function () {
        cursor.off('update', callback);
      });
    };
  }]);

module.exports = 'flux';
