'use strict';

// When requiring Angular it is added to global for some reason
var angular = global.angular || require('angular') && global.angular;

var safeDeepClone = require('./safeDeepClone.js');

var Dispatchr = require('dispatchr')();
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var util = require('util');

var Flux = (function() {

  var Flux = function () {
    Dispatchr.apply(this, arguments);
  };

  Object.keys(Dispatchr).forEach(function(key) {
    Flux[key] = Dispatchr[key];
  });

  util.inherits(Flux, Dispatchr);

  Flux.prototype.createStore = function(name, spec) {

    spec = spec || {};

    /* Yahoo Dispatchr store interface */
    function Store (dispatcher) {
      this.dispatcher = dispatcher;

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

    // Attach getters and state to the prototype
    Object.keys(spec).forEach(function (key) {
      if (typeof spec[key] === 'function' && (!spec.handlers || !spec.handlers[key] || typeof spec.handlers[key] === 'string')) {
        Store.prototype[key] = function () {
          return safeDeepClone('[Circular]', [], spec[key].apply(this, arguments));
        };
      } else if (typeof spec[key] !== 'function') {
        Store.prototype[key] = spec[key];
      }
    });

    Flux.registerStore(Store);

  };

  return Flux;
})();

var moduleConstructor = angular.module;

angular.module = function() {
  var moduleInstance = moduleConstructor.apply(angular, arguments);

  moduleInstance.store = function(storeName, storeDefinition) {
    this.factory(storeName, ['$injector', 'flux', function($injector, flux) {
      var storeConfig = $injector.invoke(storeDefinition);
      flux.createStore(storeName, storeConfig);
      return flux.getStore(storeName);
    }]);

    return this;
  };

  return moduleInstance;
};

angular.module('flux', [])
.service('flux', Flux)
.run(['$rootScope', '$timeout', function($rootScope, $timeout) {

  $rootScope.constructor.prototype.$listenTo = function (store, eventName, callback) {

    callback = callback.bind(this);

    var addMethod = eventName === '*' ? 'onAny' : 'on';
    var removeMethod = eventName === '*' ? 'offAny' : 'off';
    var args = eventName === '*' ? [callback] : [eventName, callback];

    store[addMethod].apply(store, args);
    this.$on('$destroy', function () {
      store[removeMethod].apply(store, args);
    });

  };
}]);
