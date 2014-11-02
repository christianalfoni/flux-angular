flux-angular
==========

An Angular JS flux expansion based on experiences building [www.jsfridge.com](http://www.jsfridge.com) and [www.jflux.io](http://www.jflux.io). Read more about FLUX over at [Facebook Flux](http://facebook.github.io/flux/). I wrote an articles about it: [My experiences building a FLUX application](http://christianalfoni.github.io/javascript/2014/10/27/my-experiences-building-a-flux-application.html) and [Is it possible to use the FLUX architecture with Angular JS?]
(http://www.christianalfoni.com/javascript/2014/09/25/using-flux-with-angular.html)

- [What is it all about?](#whatisitallabout)
- [How to install](#howtoinstall)
- [API](#api)
	- [flux.actions()](#actions)
	- [flux.store()](#store)
		- [state](#state)
		- [actions](#storeactions)
		- [handlers](#handlers)
		- [events](#events)
		- [mixins](#mixins)
		- [bindTo](#bindto)
		- [listener](#listener)

## <a name="whatisitallabout">What is it all about?</a>
It can be difficult to get going with FLUX as there is no complete framework with all the tools you need. This project will help you get going with the FLUX parts.

## <a name="howtoinstall">How to install</a>
Download from **releases/** folder of the repo, use `npm install flux-angular` or `bower install flux-angular`.

## <a name="api">API</a>

### <a name="actions">flux.actions()</a>
```javascript
angular.module('app', ['flux'])
	.factory('actions', function (flux) {

		return flux.actions([
			'addTodo',
			'removeTodo'
		]);

	});
```
Use them inside controllers or other parts of your architecture. The only way to change the state of your application is through an action.

### <a name="store">flux.store()</a>
```javascript
angular.module('app', ['flux'])
	.factory('MyStore', function (flux) {

		return flux.store();

	});
```
Creates a store.

#### <a name="state">state</a>
```javascript
angular.module('app', ['flux'])
	.factory('MyStore', function (flux) {

		return flux.store({
			state: {
				todos: []
			}
		});

	});
```
An object that holds the state of your store.

#### <a name="storeactions">actions</a>
```javascript
angular.module('app', ['flux'])
	.factory('MyStore', function (flux, actions) {

		return flux.store({
			state: {
				todos: []
			},
			actions: [
				actions.addTodo
			]
		});

	});
```
List what actions the store should handle. They will map to a handler with the same name.

#### <a name="handlers">handler</a>
```javascript
angular.module('app', ['flux'])
	.factory('MyStore', function (flux, actions) {

		return flux.store({
			state: {
				todos: []
			},
			actions: [
				actions.addTodo
			],
			addTodo: function (title) {
				this.state.todos.push({title: title, created: Date.now()});
			}
		});

	});
```
Based on the name of the action, add a handler that will run when the action is triggered. Any arguments passed to the action will be available in the handler.

#### <a name="events">events</a>
```javascript
angular.module('app', ['flux'])
	.factory('MyStore', function (flux, actions) {

		return flux.store({
			state: {
				todos: []
			},
			actions: [
				actions.addTodo
			],
			addTodo: function (title) {
				this.state.todos.push({title: title, created: Date.now()});
				this.emitChange();
				this.emit('added');
			}
		});

	});
```
Run **emitChange** to update all bound scopes about a change in the store. Run **emit** with a named event to notify controllers to trigger something. In this example, maybe you wanted to play an animation in a controller whenever a todo was added.

**Note!** When **emitChange** is run all values on state will be cloned to bound scopes. Meaning that the state of a store is immutable. You can not do changes to a bound value on a scope and expect that to be valid inside your store also. You have to trigger an action to change the state of a store.

#### <a name="mixins">mixins</a>
```javascript
angular.module('app', ['flux'])
	.factory('MyMixin', function (actions) {

		return MyMixin = {
			state: {},
			actions: [
				actions.removeTodo
			],
			removeTodo: function (index) {
				this.state.todos.splice(index, 1);
				this.emitChange();
			}
		};

	})
	.factory('MyStore', function (flux, actions, MyMixin) {

		return flux.store({
			mixin: [MyMixin],
			state: {
				todos: []
			},
			actions: [
				actions.addTodo
			],
			addTodo: function (title) {
				this.state.todos.push({title: title, created: Date.now()});
				this.emitChange();
			}
		});

	});

```
Mixins helps you handle big stores. You do not want to divide your stores within one section of your application as they very quickly become dependant on each other. That can result in circular dependency problems. Use mixins instead and create big stores. **state**, **actions** and **handlers** will be merged with the main store.

**ProTip!** In big stores it is a good idea to create a StatesMixin that holds all possible state properties in your store. That makes it very easy to look up what states are available to you.

```javascript
angular.module('app', ['flux'])
	.factory('StateMixin', function () {

		return {
			state: {
				someState: true,
				stateA: 'foo',
				stateB: 'bar',
				stateC: []
			}
		};

	})
	.factory('MyStore', function (flux, StateMixin, OtherMixin, ThirdMixin) {

		return flux.store({
			mixin: [StateMixin, OtherMixin, ThirdMixin]
		});

	});

```

#### <a name="bindto">bindTo</a>
```javascript
angular.module('app', ['flux'])
	.factory('actions', function (flux) {
		return flux.actions(['addTodo']);
	})
	.factory('MyStore', function (flux, actions) {
		return flux.store({
			state: {
				todos: []
			},
			actions: [actions.addTodo],
			addTodo: function (title) {
				this.state.todos.push({title: title});
				this.emitChange();
			}
		});
	})
	.controller('MyCtrl', function ($scope, MyStore, actions) {

		MyStore.bindTo($scope);

		$scope.title = '';
		$scope.addTodo = function () {
			actions.addTodo($scope.title);
		};
	});
```
```html
	<div ng-controller="MyCtrl">
		<input type="text" ng-model="title"/>
		<ul>
			<li ng-repeat="todo in todos">{{todo.title}}</li>
		</ul>
	</div>
```
By binding a store to a $scope the state properties of the store will be available to the $scope and template.

#### <a name="listener">listener</a>
```javascript
angular.module('app', ['flux'])
	.factory('actions', function (flux) {
		return flux.actions(['addTodo']);
	})
	.factory('MyStore', function (flux, actions) {
		return flux.store({
			state: {
				todos: []
			},
			actions: [actions.addTodo],
			addTodo: function (title) {
				this.state.todos.push({title: title});
				this.emitChange();
				this.emit('todo:added');
			}
		});
	})
	.controller('MyCtrl', function ($scope, MyStore, actions) {

		MyStore.bindTo($scope);

		$scope.title = '';
		$scope.listClass = {'list': true, 'animation': false};
		$scope.$on('todo:added', function () {
			$scope.listClass.animation = true;
		});
		$scope.addTodo = function () {
			actions.addTodo($scope.title);
		};
	});
```
Events emitted in a store will reach all active controllers in your application. Use them to trigger behaviour in controllers that are not realted to reflecting a state value in a template.
