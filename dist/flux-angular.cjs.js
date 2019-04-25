'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Baobab = _interopDefault(require('baobab'));
var dispatchr = _interopDefault(require('dispatchr'));
var angular = _interopDefault(require('angular'));

var angularModule = angular.module;
var registeredStores = [];
var autoInjectStores = false;
var useEvalAsync = true; // A function that creates stores

function createStore(name, spec, immutableDefaults, flux) {
  if (spec === void 0) {
    spec = {};
  }

  // Constructor of a yahoo dispatchr store
  var Store = function Store(dispatcher) {
    this.dispatcher = dispatcher; // Check if store exists when waiting for it

    this.waitFor = function (stores, cb) {
      stores = Array.isArray(stores) ? stores : [stores];

      if (!flux.areStoresRegistered(stores)) {
        throw new Error('Waiting for stores that are not injected into Angular yet, ' + stores.join(', ') + '. Be sure to inject stores before waiting for them');
      }

      this.dispatcher.waitFor(stores, cb.bind(this));
    };

    if (!this.initialize) {
      throw new Error('Store ' + name + ' does not have an initialize method which is is necessary to set the initial state');
    }

    this.initialize();
  }; // Add constructor properties, as required by Yahoo Dispatchr


  Store.handlers = spec.handlers;
  Store.storeName = name; // Instantiates immutable state and saves it to private variable that can be used for setting listeners

  Store.prototype.immutable = function (initialState, options) {
    if (options === void 0) {
      options = {};
    }

    if (this.__tree) {
      this.__tree.set(initialState);
    } else {
      this.__tree = new Baobab(initialState, angular.extend({}, immutableDefaults, options));
    }

    return this.__tree;
  };

  Store.prototype.monkey = Baobab.monkey; // Attach store definition to the prototype

  Object.keys(spec).forEach(function (key) {
    Store.prototype[key] = spec[key];
  });
  return Store;
} // Flux Service is a wrapper for the Yahoo Dispatchr


var FluxService = function FluxService(immutableDefaults) {
  this.stores = [];
  this.dispatcherInstance = dispatchr.createDispatcher();
  this.dispatcher = this.dispatcherInstance.createContext();

  this.dispatch = function () {
    if (registeredStores.length) {
      console.warn('There are still stores not injected: ' + registeredStores.join(',') + '. Make sure to manually inject all stores before running any dispatches or set autoInjectStores to true.'); // eslint-disable-line no-console
    }

    this.dispatcher.dispatch.apply(this.dispatcher, arguments);
  };

  this.createStore = function (name, spec) {
    var store = createStore(name, spec, immutableDefaults, this);
    var storeInstance; // Create the exports object

    store.exports = {};
    this.dispatcherInstance.registerStore(store);
    this.stores.push(store); // Add cloning to exports

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
          get: function get() {
            return descriptor.get.apply(storeInstance);
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
    var store = this.stores.filter(function (s) {
      return s.exports === storeExport;
    })[0];
    return this.dispatcher.getStore(store);
  };

  this.areStoresRegistered = function (stores) {
    var storeNames = this.stores.map(function (store) {
      return store.storeName;
    });
    return stores.every(function (storeName) {
      return storeNames.indexOf(storeName) > -1;
    });
  };

  this.reset = function () {
    this.dispatcherInstance.stores = {};
    this.dispatcherInstance.handlers = {};
    this.stores = [];
    registeredStores = [];
  }; // Expose Baobab in case user wants access to it for use outside a store


  this.Baobab = Baobab;
}; // Wrap "angular.module" to attach store method to module instance


angular.module = function () {
  // Call the module as normaly and grab the instance
  var moduleInstance = angularModule.apply(angular, arguments); // Attach store method to instance

  moduleInstance.store = function (storeName, storeDefinition) {
    // Add to stores array
    registeredStores.push(storeName); // Create a new store

    this.factory(storeName, ['$injector', 'flux', function ($injector, flux) {
      var storeConfig = $injector.invoke(storeDefinition);
      registeredStores.splice(registeredStores.indexOf(storeName), 1);
      return flux.createStore(storeName, storeConfig);
    }]);
    return this;
  };

  return moduleInstance;
};

angular.module('flux', []).provider('flux', function FluxProvider() {
  var immutableDefaults = {}; // Defaults that are passed on to Baobab: https://github.com/Yomguithereal/baobab#options

  this.setImmutableDefaults = function (defaults) {
    immutableDefaults = defaults;
  };

  this.autoInjectStores = function (val) {
    autoInjectStores = val;
  };

  this.useEvalAsync = function (val) {
    useEvalAsync = val;
  };

  this.$get = [function fluxFactory() {
    return new FluxService(immutableDefaults);
  }];
}).run(['$rootScope', '$injector', 'flux', function ($rootScope, $injector, flux) {
  if (angular.mock) {
    // Forced to false during testing to avoid needing to flush to test $listenTo interaction
    useEvalAsync = false;
    flux.reset();
  }

  if (!angular.mock && autoInjectStores) {
    $injector.invoke(registeredStores.concat(angular.noop));
  } // Extend scopes with $listenTo


  $rootScope.constructor.prototype.$listenTo = function (storeExport, mapping, callback) {
    var _this = this;

    var cursor, originalCallback;
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

    originalCallback = callback;

    if (useEvalAsync) {
      callback = function callback(e) {
        _this.$evalAsync(function () {
          return originalCallback(e);
        });
      };
    }

    cursor.on('update', callback); // Call the callback so that state gets the initial sync with the view-model variables. evalAsync is specifically
    // not used here because state should be available to angular as it is initializing. Otherwise state can be
    // undefined while the first digest cycle is running.

    originalCallback({}); // Remove the listeners on the store when scope is destroyed (GC)

    this.$on('$destroy', function () {
      return cursor.off('update', callback);
    });
  };
}]);
var fluxAngular = 'flux';

module.exports = fluxAngular;
//# sourceMappingURL=flux-angular.cjs.js.map
