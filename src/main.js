var angular = global.angular || require('angular');
var action = require('./action.js');
var EventEmitter = require('./EventEmitter.js');
var safeDeepClone = require('./safeDeepClone.js');

angular.module('flux', [])
  .provider('flux', function fluxProvider () {

    this.$get = ['$rootScope', function fluxFactory ($rootScope) {

      var flux = {};

      function mergeStore (mixins, source) {

        var bindings = [];

        source.actions = source.actions || [];
        source.exports = source.exports || {};

        if (mixins && Array.isArray(mixins)) {

          // Merge mixins, state, handlers and exports
          mixins.forEach(function (mixin) {
            Object.keys(mixin).forEach(function (key) {

              switch(key) {
                case 'mixins':
                  // Return as actions and exports are handled on top traversal level
                  return mergeStore(mixin.mixins, mixin);
                  break;
                case 'actions':
                  source.actions = source.actions.concat(mixin.actions);
                  break;
                case 'exports':
                  Object.keys(mixin.exports).forEach(function (key) {
                    source.exports[key] = mixin.exports[key];
                  });
                  break;
                default:
                  if (source[key]) {
                    throw new Error('The property: ' + key + ', already exists. Can not merge mixin with keys: ' + Object.keys(mixin).join(', '));
                  }
                  source[key] = mixin[key];
              }

            });
          });

        }

        source.emitChange = function () {
          bindings.forEach(function (cb) {
            cb();
          });
          if (!$rootScope.$$phase) {
            $rootScope.$apply();
          }
        };

        source.emit = function () {
          $rootScope.$broadcast.apply($rootScope, arguments);
        };

        // Register actions
        source.actions.forEach(function (action) {
          if (!action || !action.handlerName) {
            throw new Error('This is not an action ' + action);
          }
          if (!source[action.handlerName]) {
            throw new Error('There is no handler for action: ' + action);
          }
          action.on('trigger', source[action.handlerName].bind(source));
        });

        var exports = {};

        // Register exports
        Object.keys(source.exports).forEach(function (key) {
          exports[key] = function () {
            return safeDeepClone('[Circular]', [], source.exports[key].apply(source, arguments));
          };
        });

        exports.bindTo = function (scope, cb) {
          if (!scope || !cb) {
            throw new Error('You have to pass a scope and a callback to: bindTo()');
          }
          scope.$on('$destroy', function () {
            bindings.splice(bindings.indexOf(cb), 1);
          }); 
          bindings.push(cb);
          cb();
        };

        return exports;

      };

      flux.actions = function () {
        return action.apply(null, arguments);
      };

      flux.store = function (definition) {
        return mergeStore(definition.mixins, definition);
      };

      flux._init = function () {

      };

      return flux;

    }];

  });
