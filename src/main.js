var angular = global.angular || require('angular');
var safeDeepClone = require('./safeDeepClone.js');

var Dispatchr = require('dispatchr')();
var createStore = require('dispatchr/utils/createStore');
var util = require('util');

var Flux = (function() {
  function Flux() {
    Dispatchr.apply(this, arguments);
  }

  Object.keys(Dispatchr).forEach(function(key) {
    Flux[key] = Dispatchr[key];
  });

  util.inherits(Flux, Dispatchr);

  Flux.prototype.createStore = function(spec) {
    spec = spec || {};

    if(spec.state) {
      spec.rehydrate = function(state) {
        this.state = state;
      };

      spec.dehydrate = function() {
        return this.state;
      };
    }

    spec.get = function(key) {
      return safeDeepClone('[Circular]', [], this[key]);
    }

    var store = createStore(spec);

    Flux.registerStore(store);

    return store;
  }

  return Flux;
})();


var moduleConstructor = angular.module;

angular.module = function() {
  var moduleInstance = moduleConstructor.apply(angular, arguments);

  moduleInstance.store = function(storeName, storeDefinition) {
    this.factory(storeName, ['$injector', 'flux', function($injector, flux) {
      var storeConfig = $injector.invoke(storeDefinition);
      storeConfig.storeName = storeName;

      var Store = flux.createStore(storeConfig);

      return flux.getStore(storeName);
    }]);

    return this;
  };

  return moduleInstance;
};

var app = angular.module('flux', [])
.service('flux', Flux)
.run(['$rootScope', '$timeout', function($rootScope, $timeout) {

  var willRunDigest = false;
  $rootScope.constructor.prototype.$listenTo = function (store, eventName, callback) {

    var scope = this;
    callback = callback.bind(this);
    store.addListener(eventName, function() {
      callback.apply(scope, arguments);
      console.log('$rootScope.$$phase', $rootScope.$$phase);
      if (!willRunDigest && !$rootScope.$$phase) {
        willRunDigest = true;
        $timeout(function () {console.log('runinng digest'); willRunDigest = false});
      }
    });

    this.$on('$destroy', function () {
      store.removeListener(eventName, callback);
    });
  };
}]);
