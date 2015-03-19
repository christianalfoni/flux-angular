!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.flux=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
'use strict';

// When requiring Angular it is added to global for some reason
var angular = global.angular || require('angular') && global.angular;
var ImmutableStore = require('immutable-store');

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
var FluxService = function (useCloning) {
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

      // Create a getter
      var descriptor = Object.getOwnPropertyDescriptor(spec.exports, key);
      if (descriptor.get) {
        Object.defineProperty(store.exports, key, {
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable,
          get: function () {
            var value = descriptor.get.apply(storeInstance, arguments);
            return useCloning ? safeDeepClone('[Circular]', [], value) : value;
          }
        });
      } else {
        store.exports[key] = function () {
          var value = spec.exports[key].apply(storeInstance, arguments);
          return useCloning ? safeDeepClone('[Circular]', [], value) : value;
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
  };

  this.immutable = function (state) {
    return new ImmutableStore(state);
  };

};



// Monkeypatch angular module (add .store)

// Wrap "angular.module" to attach store method to module instance
var angularModule = angular.module;
var preInjectList = [];
angular.module = function () {

  // Call the module as normaly and grab the instance
  var moduleInstance = angularModule.apply(angular, arguments);

  // Attach store method to instance
  moduleInstance.store = function (storeName, storeDefinition) {

    // Add to preinject array
    preInjectList.push(storeName);

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
  .provider('flux', function FluxProvider () {
    var cloning = true;
    this.useCloning = function (useCloning) {
      cloning = useCloning;
    };
    this.$get = [function fluxFactory () {
      return new FluxService(cloning);
    }];
  })
  .run(['$rootScope', '$injector', 'flux', function ($rootScope, $injector, flux) {

    if (angular.mock) {
      flux.reset();
    } else {

      // Pre-inject all stores when not testing
      $injector.invoke(preInjectList.concat(function () {}));

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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./safeDeepClone.js":13,"angular":"angular","dispatchr":2,"eventemitter2":8,"immutable-store":9}],2:[function(require,module,exports){
/**
 * Copyright 2014, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
module.exports = require('./lib/Dispatcher');

},{"./lib/Dispatcher":4}],3:[function(require,module,exports){
/**
 * Copyright 2014, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';
var debug = require('debug')('Dispatchr:Action');

function Action(name, payload) {
    this.name = name;
    this.payload = payload;
    this._handlers = null;
    this._isExecuting = false;
    this._isCompleted = null;
}

/**
 * Gets a name from a store
 * @method getStoreName
 * @param {String|Object} store The store name or class from which to extract
 *      the name
 * @returns {String}
 */
Action.prototype.getStoreName = function getStoreName(store) {
    if ('string' === typeof store) {
        return store;
    }
    return store.storeName;
};

/**
 * Executes all handlers for the action
 * @method execute
 * @param {Function[]} handlers A mapping of store names to handler function
 * @throws {Error} if action has already been executed
 */
Action.prototype.execute = function execute(handlers) {
    if (this._isExecuting) {
        throw new Error('Action is already dispatched');
    }
    var self = this;
    this._handlers = handlers;
    this._isExecuting = true;
    this._isCompleted = {};
    Object.keys(handlers).forEach(function handlersEach(storeName) {
        self._callHandler(storeName);
    });
};

/**
 * Calls an individual store's handler function
 * @method _callHandler
 * @param {String} storeName
 * @private
 * @throws {Error} if handler does not exist for storeName
 */
Action.prototype._callHandler = function callHandler(storeName) {
    var self = this,
        handlerFn = self._handlers[storeName];
    if (!handlerFn) {
        throw new Error(storeName + ' does not have a handler for action ' + self.name);
    }
    if (self._isCompleted[storeName]) {
        return;
    }
    self._isCompleted[storeName] = false;
    debug('executing handler for ' + storeName);
    handlerFn(self.payload, self.name);
    self._isCompleted[storeName] = true;
};

/**
 * Waits until all stores have finished handling an action and then calls
 * the callback
 * @method waitFor
 * @param {String|String[]|Constructor|Constructor[]} stores An array of stores as strings or constructors to wait for
 * @param {Function} callback Called after all stores have completed handling their actions
 * @throws {Error} if the action is not being executed
 */
Action.prototype.waitFor = function waitFor(stores, callback) {
    var self = this;
    if (!self._isExecuting) {
        throw new Error('waitFor called even though there is no action being executed!');
    }
    if (!Array.isArray(stores)) {
        stores = [stores];
    }

    debug('waiting on ' + stores.join(', '));
    stores.forEach(function storesEach(storeName) {
        storeName = self.getStoreName(storeName);
        self._callHandler(storeName);
    });

    callback();
};

module.exports = Action;

},{"debug":5}],4:[function(require,module,exports){
/**
 * Copyright 2014, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
'use strict';

var Action = require('./Action'),
    DEFAULT = 'default';

module.exports = function () {
    var debug = require('debug')('Dispatchr:dispatcher');

    /**
     * @class Dispatcher
     * @param {Object} context The context to be used for store instances
     * @constructor
     */
    function Dispatcher (context) {
        this.storeInstances = {};
        this.currentAction = null;
        this.dispatcherInterface = {
            getContext: function getContext() { return context; },
            getStore: this.getStore.bind(this),
            waitFor: this.waitFor.bind(this)
        };
    }

    Dispatcher.stores = {};
    Dispatcher.handlers = {
        'default': []
    };

    /**
     * Registers a store so that it can handle actions.
     * @method registerStore
     * @static
     * @param {Object} store A store class to be registered. The store should have a static
     *      `name` property so that it can be loaded later.
     * @throws {Error} if store is invalid
     * @throws {Error} if store is already registered
     */
    Dispatcher.registerStore = function registerStore(store) {
        if ('function' !== typeof store) {
            throw new Error('registerStore requires a constructor as first parameter');
        }
        var storeName = Dispatcher.getStoreName(store);
        if (!storeName) {
            throw new Error('Store is required to have a `storeName` property.');
        }
        if (Dispatcher.stores[storeName]) {
            if (Dispatcher.stores[storeName] === store) {
                // Store is already registered, nothing to do
                return;
            }
            throw new Error('Store with name `' + storeName + '` has already been registered.');
        }
        Dispatcher.stores[storeName] = store;
        if (store.handlers) {
            Object.keys(store.handlers).forEach(function storeHandlersEach(action) {
                var handler = store.handlers[action];
                Dispatcher._registerHandler(action, storeName, handler);
            });
        }
    };

    /**
     * Method to discover if a storeName has been registered
     * @method isRegistered
     * @static
     * @param {Object|String} store The store to check
     * @returns {boolean}
     */
    Dispatcher.isRegistered = function isRegistered(store) {
        var storeName = Dispatcher.getStoreName(store),
            storeInstance = Dispatcher.stores[storeName];

        if (!storeInstance) {
            return false;
        }

        if ('function' === typeof store) {
            if (store !== storeInstance) {
                return false;
            }
        }
        return true;
    };

    /**
     * Gets a name from a store
     * @method getStoreName
     * @static
     * @param {String|Object} store The store name or class from which to extract
     *      the name
     * @returns {String}
     */
    Dispatcher.getStoreName = function getStoreName(store) {
        if ('string' === typeof store) {
            return store;
        }
        return store.storeName;
    };

    /**
     * Adds a handler function to be called for the given action
     * @method registerHandler
     * @private
     * @static
     * @param {String} action Name of the action
     * @param {String} name Name of the store that handles the action
     * @param {String|Function} handler The function or name of the method that handles the action
     * @returns {number}
     */
    Dispatcher._registerHandler = function registerHandler(action, name, handler) {
        Dispatcher.handlers[action] = Dispatcher.handlers[action] || [];
        Dispatcher.handlers[action].push({
            name: Dispatcher.getStoreName(name),
            handler: handler
        });
        return Dispatcher.handlers.length - 1;
    };

    /**
     * Returns a single store instance and creates one if it doesn't already exist
     * @method getStore
     * @param {String} name The name of the instance
     * @returns {Object} The store instance
     * @throws {Error} if store is not registered
     */
    Dispatcher.prototype.getStore = function getStore(name) {
        var storeName = Dispatcher.getStoreName(name);
        if (!this.storeInstances[storeName]) {
            var Store = Dispatcher.stores[storeName];
            if (!Store) {
                throw new Error('Store ' + storeName + ' was not registered.');
            }
            this.storeInstances[storeName] = new (Dispatcher.stores[storeName])(this.dispatcherInterface);
        }
        return this.storeInstances[storeName];
    };

    /**
     * Dispatches a new action or queues it up if one is already in progress
     * @method dispatch
     * @param {String} actionName Name of the action to be dispatched
     * @param {Object} payload Parameters to describe the action
     * @throws {Error} if store has handler registered that does not exist
     */
    Dispatcher.prototype.dispatch = function dispatch(actionName, payload) {
        if (this.currentAction) {
            throw new Error('Cannot call dispatch while another dispatch is executing. Attempted to execute \'' + actionName + '\' but \'' + this.currentAction.name + '\' is already executing.');
        }
        var actionHandlers = Dispatcher.handlers[actionName] || [],
            defaultHandlers = Dispatcher.handlers[DEFAULT] || [];
        if (!actionHandlers.length && !defaultHandlers.length) {
            debug(actionName + ' does not have any registered handlers');
            return;
        }
        debug('dispatching ' + actionName, payload);
        this.currentAction = new Action(actionName, payload);
        var self = this,
            allHandlers = actionHandlers.concat(defaultHandlers),
            handlerFns = {};

        try {
            allHandlers.forEach(function actionHandlersEach(store) {
                if (handlerFns[store.name]) {
                    // Don't call the default if the store has an explicit action handler
                    return;
                }
                var storeInstance = self.getStore(store.name);
                if ('function' === typeof store.handler) {
                    handlerFns[store.name] = store.handler.bind(storeInstance);
                } else {
                    if (!storeInstance[store.handler]) {
                        throw new Error(store.name + ' does not have a method called ' + store.handler);
                    }
                    handlerFns[store.name] = storeInstance[store.handler].bind(storeInstance);
                }
            });
            this.currentAction.execute(handlerFns);
        } catch (e) {
            throw e;
        } finally {
            debug('finished ' + actionName);
            this.currentAction = null;
        }
    };

    /**
     * Returns a raw data object representation of the current state of the
     * dispatcher and all store instances. If the store implements a shouldDehdyrate
     * function, then it will be called and only dehydrate if the method returns `true`
     * @method dehydrate
     * @returns {Object} dehydrated dispatcher data
     */
    Dispatcher.prototype.dehydrate = function dehydrate() {
        var self = this,
            stores = {};
        Object.keys(self.storeInstances).forEach(function storeInstancesEach(storeName) {
            var store = self.storeInstances[storeName];
            if (!store.dehydrate || (store.shouldDehydrate && !store.shouldDehydrate())) {
                return;
            }
            stores[storeName] = store.dehydrate();
        });
        return {
            stores: stores
        };
    };

    /**
     * Takes a raw data object and rehydrates the dispatcher and store instances
     * @method rehydrate
     * @param {Object} dispatcherState raw state typically retrieved from `dehydrate`
     *      method
     */
    Dispatcher.prototype.rehydrate = function rehydrate(dispatcherState) {
        var self = this;
        if (dispatcherState.stores) {
            Object.keys(dispatcherState.stores).forEach(function storeStateEach(storeName) {
                var state = dispatcherState.stores[storeName],
                    store = self.getStore(storeName);
                if (store.rehydrate) {
                    store.rehydrate(state);
                }
            });
        }
    };

    /**
     * Waits until all stores have finished handling an action and then calls
     * the callback
     * @method waitFor
     * @param {String|String[]} stores An array of stores as strings to wait for
     * @param {Function} callback Called after all stores have completed handling their actions
     * @throws {Error} if there is no action dispatching
     */
    Dispatcher.prototype.waitFor = function waitFor(stores, callback) {
        if (!this.currentAction) {
            throw new Error('waitFor called even though there is no action dispatching');
        }
        this.currentAction.waitFor(stores, callback);
    };

    return Dispatcher;
};

},{"./Action":3,"debug":5}],5:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Use chrome.storage.local if we are in an app
 */

var storage;

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
  storage = chrome.storage.local;
else
  storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      storage.removeItem('debug');
    } else {
      storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":6}],6:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":7}],7:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],8:[function(require,module,exports){
/*!
 * EventEmitter2
 * https://github.com/hij1nx/EventEmitter2
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
;!function(undefined) {

  var isArray = Array.isArray ? Array.isArray : function _isArray(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
  var defaultMaxListeners = 10;

  function init() {
    this._events = {};
    if (this._conf) {
      configure.call(this, this._conf);
    }
  }

  function configure(conf) {
    if (conf) {

      this._conf = conf;

      conf.delimiter && (this.delimiter = conf.delimiter);
      conf.maxListeners && (this._events.maxListeners = conf.maxListeners);
      conf.wildcard && (this.wildcard = conf.wildcard);
      conf.newListener && (this.newListener = conf.newListener);

      if (this.wildcard) {
        this.listenerTree = {};
      }
    }
  }

  function EventEmitter(conf) {
    this._events = {};
    this.newListener = false;
    configure.call(this, conf);
  }

  //
  // Attention, function return type now is array, always !
  // It has zero elements if no any matches found and one or more
  // elements (leafs) if there are matches
  //
  function searchListenerTree(handlers, type, tree, i) {
    if (!tree) {
      return [];
    }
    var listeners=[], leaf, len, branch, xTree, xxTree, isolatedBranch, endReached,
        typeLength = type.length, currentType = type[i], nextType = type[i+1];
    if (i === typeLength && tree._listeners) {
      //
      // If at the end of the event(s) list and the tree has listeners
      // invoke those listeners.
      //
      if (typeof tree._listeners === 'function') {
        handlers && handlers.push(tree._listeners);
        return [tree];
      } else {
        for (leaf = 0, len = tree._listeners.length; leaf < len; leaf++) {
          handlers && handlers.push(tree._listeners[leaf]);
        }
        return [tree];
      }
    }

    if ((currentType === '*' || currentType === '**') || tree[currentType]) {
      //
      // If the event emitted is '*' at this part
      // or there is a concrete match at this patch
      //
      if (currentType === '*') {
        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+1));
          }
        }
        return listeners;
      } else if(currentType === '**') {
        endReached = (i+1 === typeLength || (i+2 === typeLength && nextType === '*'));
        if(endReached && tree._listeners) {
          // The next element has a _listeners, add it to the handlers.
          listeners = listeners.concat(searchListenerTree(handlers, type, tree, typeLength));
        }

        for (branch in tree) {
          if (branch !== '_listeners' && tree.hasOwnProperty(branch)) {
            if(branch === '*' || branch === '**') {
              if(tree[branch]._listeners && !endReached) {
                listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], typeLength));
              }
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            } else if(branch === nextType) {
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i+2));
            } else {
              // No match on this one, shift into the tree but not in the type array.
              listeners = listeners.concat(searchListenerTree(handlers, type, tree[branch], i));
            }
          }
        }
        return listeners;
      }

      listeners = listeners.concat(searchListenerTree(handlers, type, tree[currentType], i+1));
    }

    xTree = tree['*'];
    if (xTree) {
      //
      // If the listener tree will allow any match for this part,
      // then recursively explore all branches of the tree
      //
      searchListenerTree(handlers, type, xTree, i+1);
    }

    xxTree = tree['**'];
    if(xxTree) {
      if(i < typeLength) {
        if(xxTree._listeners) {
          // If we have a listener on a '**', it will catch all, so add its handler.
          searchListenerTree(handlers, type, xxTree, typeLength);
        }

        // Build arrays of matching next branches and others.
        for(branch in xxTree) {
          if(branch !== '_listeners' && xxTree.hasOwnProperty(branch)) {
            if(branch === nextType) {
              // We know the next element will match, so jump twice.
              searchListenerTree(handlers, type, xxTree[branch], i+2);
            } else if(branch === currentType) {
              // Current node matches, move into the tree.
              searchListenerTree(handlers, type, xxTree[branch], i+1);
            } else {
              isolatedBranch = {};
              isolatedBranch[branch] = xxTree[branch];
              searchListenerTree(handlers, type, { '**': isolatedBranch }, i+1);
            }
          }
        }
      } else if(xxTree._listeners) {
        // We have reached the end and still on a '**'
        searchListenerTree(handlers, type, xxTree, typeLength);
      } else if(xxTree['*'] && xxTree['*']._listeners) {
        searchListenerTree(handlers, type, xxTree['*'], typeLength);
      }
    }

    return listeners;
  }

  function growListenerTree(type, listener) {

    type = typeof type === 'string' ? type.split(this.delimiter) : type.slice();

    //
    // Looks for two consecutive '**', if so, don't add the event at all.
    //
    for(var i = 0, len = type.length; i+1 < len; i++) {
      if(type[i] === '**' && type[i+1] === '**') {
        return;
      }
    }

    var tree = this.listenerTree;
    var name = type.shift();

    while (name) {

      if (!tree[name]) {
        tree[name] = {};
      }

      tree = tree[name];

      if (type.length === 0) {

        if (!tree._listeners) {
          tree._listeners = listener;
        }
        else if(typeof tree._listeners === 'function') {
          tree._listeners = [tree._listeners, listener];
        }
        else if (isArray(tree._listeners)) {

          tree._listeners.push(listener);

          if (!tree._listeners.warned) {

            var m = defaultMaxListeners;

            if (typeof this._events.maxListeners !== 'undefined') {
              m = this._events.maxListeners;
            }

            if (m > 0 && tree._listeners.length > m) {

              tree._listeners.warned = true;
              console.error('(node) warning: possible EventEmitter memory ' +
                            'leak detected. %d listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit.',
                            tree._listeners.length);
              console.trace();
            }
          }
        }
        return true;
      }
      name = type.shift();
    }
    return true;
  }

  // By default EventEmitters will print a warning if more than
  // 10 listeners are added to it. This is a useful default which
  // helps finding memory leaks.
  //
  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.

  EventEmitter.prototype.delimiter = '.';

  EventEmitter.prototype.setMaxListeners = function(n) {
    this._events || init.call(this);
    this._events.maxListeners = n;
    if (!this._conf) this._conf = {};
    this._conf.maxListeners = n;
  };

  EventEmitter.prototype.event = '';

  EventEmitter.prototype.once = function(event, fn) {
    this.many(event, 1, fn);
    return this;
  };

  EventEmitter.prototype.many = function(event, ttl, fn) {
    var self = this;

    if (typeof fn !== 'function') {
      throw new Error('many only accepts instances of Function');
    }

    function listener() {
      if (--ttl === 0) {
        self.off(event, listener);
      }
      fn.apply(this, arguments);
    }

    listener._origin = fn;

    this.on(event, listener);

    return self;
  };

  EventEmitter.prototype.emit = function() {

    this._events || init.call(this);

    var type = arguments[0];

    if (type === 'newListener' && !this.newListener) {
      if (!this._events.newListener) { return false; }
    }

    // Loop through the *_all* functions and invoke them.
    if (this._all) {
      var l = arguments.length;
      var args = new Array(l - 1);
      for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
      for (i = 0, l = this._all.length; i < l; i++) {
        this.event = type;
        this._all[i].apply(this, args);
      }
    }

    // If there is no 'error' event listener then throw.
    if (type === 'error') {

      if (!this._all &&
        !this._events.error &&
        !(this.wildcard && this.listenerTree.error)) {

        if (arguments[1] instanceof Error) {
          throw arguments[1]; // Unhandled 'error' event
        } else {
          throw new Error("Uncaught, unspecified 'error' event.");
        }
        return false;
      }
    }

    var handler;

    if(this.wildcard) {
      handler = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handler, ns, this.listenerTree, 0);
    }
    else {
      handler = this._events[type];
    }

    if (typeof handler === 'function') {
      this.event = type;
      if (arguments.length === 1) {
        handler.call(this);
      }
      else if (arguments.length > 1)
        switch (arguments.length) {
          case 2:
            handler.call(this, arguments[1]);
            break;
          case 3:
            handler.call(this, arguments[1], arguments[2]);
            break;
          // slower
          default:
            var l = arguments.length;
            var args = new Array(l - 1);
            for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
            handler.apply(this, args);
        }
      return true;
    }
    else if (handler) {
      var l = arguments.length;
      var args = new Array(l - 1);
      for (var i = 1; i < l; i++) args[i - 1] = arguments[i];

      var listeners = handler.slice();
      for (var i = 0, l = listeners.length; i < l; i++) {
        this.event = type;
        listeners[i].apply(this, args);
      }
      return (listeners.length > 0) || !!this._all;
    }
    else {
      return !!this._all;
    }

  };

  EventEmitter.prototype.on = function(type, listener) {

    if (typeof type === 'function') {
      this.onAny(type);
      return this;
    }

    if (typeof listener !== 'function') {
      throw new Error('on only accepts instances of Function');
    }
    this._events || init.call(this);

    // To avoid recursion in the case that type == "newListeners"! Before
    // adding it to the listeners, first emit "newListeners".
    this.emit('newListener', type, listener);

    if(this.wildcard) {
      growListenerTree.call(this, type, listener);
      return this;
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    }
    else if(typeof this._events[type] === 'function') {
      // Adding the second element, need to change to array.
      this._events[type] = [this._events[type], listener];
    }
    else if (isArray(this._events[type])) {
      // If we've already got an array, just append.
      this._events[type].push(listener);

      // Check for listener leak
      if (!this._events[type].warned) {

        var m = defaultMaxListeners;

        if (typeof this._events.maxListeners !== 'undefined') {
          m = this._events.maxListeners;
        }

        if (m > 0 && this._events[type].length > m) {

          this._events[type].warned = true;
          console.error('(node) warning: possible EventEmitter memory ' +
                        'leak detected. %d listeners added. ' +
                        'Use emitter.setMaxListeners() to increase limit.',
                        this._events[type].length);
          console.trace();
        }
      }
    }
    return this;
  };

  EventEmitter.prototype.onAny = function(fn) {

    if (typeof fn !== 'function') {
      throw new Error('onAny only accepts instances of Function');
    }

    if(!this._all) {
      this._all = [];
    }

    // Add the function to the event listener collection.
    this._all.push(fn);
    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype.off = function(type, listener) {
    if (typeof listener !== 'function') {
      throw new Error('removeListener only takes instances of Function');
    }

    var handlers,leafs=[];

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);
    }
    else {
      // does not use listeners(), so no side effect of creating _events[type]
      if (!this._events[type]) return this;
      handlers = this._events[type];
      leafs.push({_listeners:handlers});
    }

    for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
      var leaf = leafs[iLeaf];
      handlers = leaf._listeners;
      if (isArray(handlers)) {

        var position = -1;

        for (var i = 0, length = handlers.length; i < length; i++) {
          if (handlers[i] === listener ||
            (handlers[i].listener && handlers[i].listener === listener) ||
            (handlers[i]._origin && handlers[i]._origin === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0) {
          continue;
        }

        if(this.wildcard) {
          leaf._listeners.splice(position, 1);
        }
        else {
          this._events[type].splice(position, 1);
        }

        if (handlers.length === 0) {
          if(this.wildcard) {
            delete leaf._listeners;
          }
          else {
            delete this._events[type];
          }
        }
        return this;
      }
      else if (handlers === listener ||
        (handlers.listener && handlers.listener === listener) ||
        (handlers._origin && handlers._origin === listener)) {
        if(this.wildcard) {
          delete leaf._listeners;
        }
        else {
          delete this._events[type];
        }
      }
    }

    return this;
  };

  EventEmitter.prototype.offAny = function(fn) {
    var i = 0, l = 0, fns;
    if (fn && this._all && this._all.length > 0) {
      fns = this._all;
      for(i = 0, l = fns.length; i < l; i++) {
        if(fn === fns[i]) {
          fns.splice(i, 1);
          return this;
        }
      }
    } else {
      this._all = [];
    }
    return this;
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function(type) {
    if (arguments.length === 0) {
      !this._events || init.call(this);
      return this;
    }

    if(this.wildcard) {
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      var leafs = searchListenerTree.call(this, null, ns, this.listenerTree, 0);

      for (var iLeaf=0; iLeaf<leafs.length; iLeaf++) {
        var leaf = leafs[iLeaf];
        leaf._listeners = null;
      }
    }
    else {
      if (!this._events[type]) return this;
      this._events[type] = null;
    }
    return this;
  };

  EventEmitter.prototype.listeners = function(type) {
    if(this.wildcard) {
      var handlers = [];
      var ns = typeof type === 'string' ? type.split(this.delimiter) : type.slice();
      searchListenerTree.call(this, handlers, ns, this.listenerTree, 0);
      return handlers;
    }

    this._events || init.call(this);

    if (!this._events[type]) this._events[type] = [];
    if (!isArray(this._events[type])) {
      this._events[type] = [this._events[type]];
    }
    return this._events[type];
  };

  EventEmitter.prototype.listenersAny = function() {

    if(this._all) {
      return this._all;
    }
    else {
      return [];
    }

  };

  if (typeof define === 'function' && define.amd) {
     // AMD. Register as an anonymous module.
    define(function() {
      return EventEmitter;
    });
  } else if (typeof exports === 'object') {
    // CommonJS
    exports.EventEmitter2 = EventEmitter;
  }
  else {
    // Browser global.
    window.EventEmitter2 = EventEmitter;
  }
}();

},{}],9:[function(require,module,exports){
'use strict';
var StoreArray = require('./StoreArray.js');
var StoreObject = require('./StoreObject.js');

var unfreeze = function (value, helpers) {
  if (Array.isArray(value)) {
    return StoreArray(value, helpers);
  } else if (typeof value === 'object' && value !== null) {
    return StoreObject(value, helpers);
  } else {
    return value;
  }
};

var traverse = function (helpers, value) {
  if (Array.isArray(value) && !value.__) {
    var array = value.map(function (item, index) {
      helpers.currentPath.push(index);
      var obj = traverse(helpers, item);
      helpers.currentPath.pop();
      return obj;
    });
    var storeArray = StoreArray(array, helpers);
    Object.freeze(storeArray);
    return storeArray;
  } else if (typeof value === 'object' && value !== null && !value.__) {
    var object = Object.keys(value).reduce(function (object, key) {
      helpers.currentPath.push(key);
      object[key] = traverse(helpers, value[key]);
      helpers.currentPath.pop();
      return object;
    }, {});
    var storeObject = StoreObject(object, helpers);
    Object.freeze(storeObject);
    return storeObject;
  } else {
    return value;
  }
};

var updatePath = function (helpers, path, cb) {

  helpers.currentPath = [];

  // Unfreeze the store, ready for traversal
  var newStore = unfreeze(helpers.currentStore, helpers);
  var destination = newStore;

  // Go through path in need of update and unfreeze along the
  // way to update any props
  path.forEach(function (pathKey) {
    helpers.currentPath.push(pathKey);
    destination[pathKey] = unfreeze(destination[pathKey], helpers);
    destination = destination[pathKey];
  });

  // Run the update
  cb(destination, helpers, traverse);

  // Get ready for new traversal to freeze all paths
  destination = newStore;
  path.forEach(function (pathKey) {
    destination = destination[pathKey];
    Object.freeze(destination);
    helpers.currentPath.pop();
  });

  // Make ready a new store and freeze it
  var store = StoreObject(newStore, helpers);
  Object.keys(newStore).forEach(function (key) {
    Object.defineProperty(store, key, {
      enumerable: true,
      get: function () {
        helpers.currentStore = this;
        return newStore[key];
      }
    });
  });
  Object.freeze(store);
  return store;
};

var createStore = function (helpers, state) {
  var store = StoreObject({}, helpers);
  Object.keys(state).forEach(function (key) {
    helpers.currentPath.push(key);
    var branch = traverse(helpers, state[key]);
    helpers.currentPath.pop(key);
    Object.defineProperty(store, key, {
      enumerable: true,
      get: function () {
        helpers.currentStore = this;
        return branch;
      }
    });
  });
  Object.freeze(store);
  return store;
};

function Store(state) {

  if (!state || (typeof state !== 'object' || Array.isArray(state) || state === null)) {
    throw new Error('You have to pass an object to the store');
  }

  var helpers = {
    currentPath: [],
    currentStore: null,
    update: function (path, cb) {
      helpers.currentStore = updatePath(helpers, path, cb);
      return helpers.currentStore;
    }
  };

  helpers.currentStore = createStore(helpers, state);
  return helpers.currentStore;

}

module.exports = Store;

},{"./StoreArray.js":10,"./StoreObject.js":11}],10:[function(require,module,exports){
'use strict';
var utils = require('./utils.js');
var StoreArray = function () {

  function StoreArray(items) {
    var inst = Array.apply(Array);
    inst = inst.concat(items);
    inst.__proto__ = StoreArray.prototype;
    return inst;
  }
  StoreArray.prototype = Object.create(Array.prototype);
  StoreArray.prototype.push = function (item) {
    return this.__.update(this.__.path, function (obj, helpers, traverse) {
      helpers.currentPath.push(obj.length);
      Array.prototype.push.call(obj, traverse(helpers, item));
      helpers.currentPath.pop();
    });
  };
  StoreArray.prototype.splice = function () {
    var args = [].slice.call(arguments, 0);
    var startIndex = args.shift();
    var count = args.shift();
    return this.__.update(this.__.path, function (obj, helpers, traverse) {

      var additions = args.map(function (arg, index) {
        helpers.currentPath.push(startIndex + index);
        var addition = traverse(helpers, arg);
        helpers.currentPath.pop();
        return addition;
      });

      Array.prototype.splice.apply(obj, [startIndex, count].concat(additions));

      // Update paths
      for (var x = startIndex; x < obj.length; x++) {
        if (obj[x].__) {
          var path = obj[x].__.path;
          path[path.length - 1] = x;
        }
      }

    });
  };
  StoreArray.prototype.concat = function () {
    var args = [].slice.call(arguments, 0);
    return this.__.update(this.__.path, function (obj, helpers, traverse) {
      args.map(function (arg) {
        if (Array.isArray(arg)) {
          arg.map(function (deepArg) {
            helpers.currentPath.push(obj.length);
            Array.prototype.push.call(obj, traverse(helpers, deepArg));
            helpers.currentPath.pop();
          });
        } else {
          helpers.currentPath.push(obj.length);
          Array.prototype.push.call(obj, traverse(helpers, arg));
          helpers.currentPath.pop();
        }
      });
    });
  };
  StoreArray.prototype.unshift = function (item) {
    return this.__.update(this.__.path, function (obj, helpers, traverse) {
      Array.prototype.unshift.call(obj, traverse(helpers, item));

      // Update paths
      for (var x = 0; x < obj.length; x++) {
        if (obj[x].__) {
          var path = obj[x].__.path;
          path[path.length - 1] = x;
        }
      }

    });
  };
  StoreArray.prototype.shift = function (item) {
    return this.__.update(this.__.path, function (obj, helpers, traverse) {
      Array.prototype.shift.call(obj, traverse(helpers, item));

      // Update paths
      for (var x = 0; x < obj.length; x++) {
        if (obj[x].__) {
          var path = obj[x].__.path;
          path[path.length - 1] = x;
        }
      }

    });
  };
  StoreArray.prototype.pop = function () {
    return this.__.update(this.__.path, function (obj) {
      Array.prototype.pop.call(obj);
    });
  };
  StoreArray.prototype.toJS = function () {
    return utils.toJS(this);
  };

  return function (items, helpers) {
    var array = new StoreArray(items);
    Object.defineProperty(array, '__', {
      value: {
        path: helpers.currentPath.slice(0),
        update: helpers.update
      }
    });
    return array;
  };

};

module.exports = StoreArray();

},{"./utils.js":12}],11:[function(require,module,exports){
'use strict';
var utils = require('./utils.js');
var StoreObject = function () {

  var StoreObjectProto = {
    set: function (key, value) {
      return this.__.update(this.__.path, function (obj, helpers, traverse) {

        // If an array is set there might be immutable objects in it that needs
        // a path update
        if (Array.isArray(value)) {
          value.forEach(function (item, index) {
            if (item.__) {
              item.__.path[item.__.path.length - 1] = index;
            }
          });
        }
        helpers.currentPath.push(key);
        obj[key] = traverse(helpers, value);
        helpers.currentPath.pop();
      });
    },
    toJS: function () {
      return utils.toJS(this);
    },
    merge: function (mergeObj) {
      if (Array.isArray(mergeObj) || typeof mergeObj !== 'object' || mergeObj === null) {
        throw new Error('You have to pass an object to the merge method');
      }
      return this.__.update(this.__.path, function (obj, helpers, traverse) {
        Object.keys(mergeObj).forEach(function (key) {
          helpers.currentPath.push(key);
          obj[key] = traverse(helpers, mergeObj[key]);
          helpers.currentPath.pop();
        });
      });
    }
  };

  return function (props, helpers) {
    var object = Object.create(StoreObjectProto);
    Object.keys(props).forEach(function (key) {
      object[key] = props[key];
    });
    Object.defineProperty(object, '__', {
      value: {
        path: helpers.currentPath.slice(0),
        update: helpers.update
      }
    });
    return object;
  };

};

module.exports = StoreObject();

},{"./utils.js":12}],12:[function(require,module,exports){
"use strict";
var utils = {
  toJS: function (obj) {
    if (obj instanceof Array) {
      return obj.map(function (obj) {
        return utils.toJS(obj);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      return Object.keys(obj).reduce(function (newObj, key) {
        newObj[key] = utils.toJS(obj[key]);
        return newObj;
      }, {});
    } else {
      return obj;
    }
  }
};

module.exports = utils;

},{}],13:[function(require,module,exports){
/* global Blob */
/* global File */

function safeDeepClone(circularValue, refs, obj) {
  var copy;

  // object is a false or empty value, or otherwise not an object
  if (!obj || 'object' !== typeof obj || obj instanceof Error || obj instanceof ArrayBuffer || obj instanceof Blob || obj instanceof File) return obj;

  // Handle Date
  if (obj instanceof Date) {
    copy = new Date();
    copy.setTime(obj.getTime());
    return copy;
  }

  // Handle Array - or array-like items
  if (obj instanceof Array || obj.length) {
    
    refs.push(obj);
    copy = [];
    for (var i = 0, len = obj.length; i < len; i++) {
      if (refs.indexOf(obj[i]) >= 0) {
        copy[i] = circularValue;
      } else {
        copy[i] = safeDeepClone(circularValue, refs, obj[i]);
      }
    }
    refs.pop();
    return copy;
  }

  // Handle Object
  refs.push(obj);

  // Bring a long prototype
  if (obj.constructor && obj.constructor !== Object) {
    copy = Object.create(obj.constructor.prototype);
  } else {
    copy = {};
  }

  for (var attr in obj) {
    if (obj.hasOwnProperty(attr) && attr !== '$$hashKey') {
      if (refs.indexOf(obj[attr]) >= 0) {
        copy[attr] = circularValue;
      } else {
        copy[attr] = safeDeepClone(circularValue, refs, obj[attr]);
      }
    }
  }
  refs.pop();
  return copy;
}

module.exports = safeDeepClone;

},{}]},{},[1])(1)
});