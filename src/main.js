var angular = global.angular || require('angular');
var action = require('./action.js');
var EventEmitter = require('./EventEmitter.js');
var safeDeepClone = require('./safeDeepClone.js');

angular.module('flux', [])
  .provider('flux', function fluxProvider () {

    this.$get = ['$rootScope', function fluxFactory ($rootScope) {

      var flux = {};

      function mergeStore (mixins, source, state) {

        var bindings = [];

        source.actions = source.actions || [];
        source.exports = source.exports || {};

        if (mixins && Array.isArray(mixins)) {

          // Merge mixins and state
          mixins.forEach(function (mixin) {
            Object.keys(mixin).forEach(function (key) {

              switch(key) {
                case 'state':
                  var mixinState = mixin.state;
                  Object.keys(mixinState).forEach(function (key) {
                    state[key] = mixinState[key];
                  });
                  break;
                case 'mixins':
                  // Return as actions and exports are handled on top traversal level
                  return mergeStore(mixin.mixins, mixin, state);
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
            return safeDeepClone('[Circular]', [], source.exports[key].apply(state, arguments));
          };
        });

        source.state = state;
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
        var state = definition.state ? definition.state : {};
        return mergeStore(definition.mixins, definition, state);
      };

      return flux;

    }];

  });
