var angular = global.angular || require('angular');
var action = require('./action.js');
var EventEmitter = require('./EventEmitter.js');
var safeDeepClone = require('./safeDeepClone.js');

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if (result === null) {
   result = [];
 }
 return result;
}

function mergeStore (mixins, source) {

  var exports = Object.create(EventEmitter.prototype);

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

        source.emit = function (eventName) {
          exports.emit(eventName);
          if (exports._events['all']) {
            exports._events['all'].forEach(function (event) {
              event.listener();
            });
          }
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

        // Register exports
        Object.keys(source.exports).forEach(function (key) {
          exports[key] = function () {
            return safeDeepClone('[Circular]', [], source.exports[key].apply(source, arguments));
          };
        });

        return exports;

      }

      angular.module('flux', [])
      .provider('flux', function fluxProvider () {

        this.$get = ['$rootScope', function fluxFactory ($rootScope) {

          var flux = {};

          $rootScope.$listenTo = function (store, eventName, callback) {
            callback = callback.bind(this);
            store.addListener(eventName, callback);
            this.$on('$destroy', function () {
              store.removeListener(eventName, callback);
            });
          };


          flux.actions = function () {
            return action.apply(null, arguments);
          };

          flux.store = function (definition) {
            return mergeStore(definition.mixins, definition);
          };

          return flux;

        }];

      });

      /* EXTENDING ANGULAR */
      var moduleConstructor = angular.module;
      angular.module = function () {

        var moduleInstance = moduleConstructor.apply(angular, arguments);
        moduleInstance.actions = function (name, actions) {
          this.factory(name, ['flux', function (flux) {
            return flux.actions(actions);
          }]);
          return this;
        };

        moduleInstance.store = function (name, definition) {

          var constructor = typeof definition === 'function' ? definition : definition.pop();
          var newDefinition = function () {
            var store = constructor.apply(this, arguments);
            return mergeStore(store.mixins, store);
          };
          if (typeof definition === 'function') {
            var inject = getParamNames(constructor);
            newDefinition.$inject = inject;
          } else {
            newDefinition.$inject = definition;
          }
          this.factory(name, newDefinition);
          return this;
        };

        moduleInstance.component = function (name, definition) {
          var constructor = typeof definition === 'function' ? definition : definition.pop();
          var newDefinition = function () {
            var component = constructor.apply(this, arguments);
            var directive = {
              restrict: 'E',
              replace: true,
              transclude: true,
              scope: {},
              link: function (scope, element, attributes, ctrls, transclude) {
                scope.attrs = {};
                Object.keys(component).forEach(function (key) {
                  scope[key] = component[key];
                });
                Object.keys(attributes).forEach(function (attr) {
                  if (attr[0] === '$') {
                    return;
                  }
                  scope.attrs[attr] = scope.$parent[attr];
                });
                transclude(scope, function (clone, scope) {
                  element.append(clone);
                });

                scope.$listenTo = function (store, eventName, callback) {
                  callback = callback.bind(this);
                  store.addListener(eventName, callback);
                  this.$on('$destroy', function () {
                    store.removeListener(eventName, callback);
                  });
                };

                scope.init && scope.init.call(scope);
              }
            };
            if (component.template) {
              directive.template = component.template;
              delete component.template;
            } else if (component.templateUrl) {
              directive.templateUrl = component.templateUrl;
              delete component.templateUrl;
            }
            return directive;
          };

          if (typeof definition === 'function') {
            var inject = getParamNames(constructor);
            newDefinition.$inject = inject;
          } else {
            newDefinition.$inject = definition;
          }

          this.directive(name, newDefinition);
          return this;
        };

        return moduleInstance;

      };