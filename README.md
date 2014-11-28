flux-angular
==========

## Features

- **Yahoo Dispatchr**
- **EventEmitter2**
- **Angular Store**
- **Scope listenTo**
- **Immutable**

## Create a store

```javascript
angular.module('app', ['flux'])
.store('MyStore', function () {
	
	return {

		// State
		comments: [],

		// Action handlers
		handlers: {
			'addComment': 'addComment'
		},
		addComment: function (comment) {
			this.comments.push(comment);
			this.emit('comments.add');
		},

		// Getters
		getComments: function () {
			return this.comments;
		}

	};

});
```

## Dispatching actions and grabbing state from store

```javascript
angular.module('app', ['flux'])
.controller('MyCtrl', function ($scope, MyStore, flux) {
	
	$scope.comments = [];
	$scope.comment = '';

	$scope.addComment = function () {
		flux.dispatch('addComment', $scope.comment);
		$scope.comment = '';
	};

	$scope.$listenTo(MyStore, 'comments.add', function () {
		$scope.comments = MyStore.getComments();
	});

});
```

### Event wildcards
Due to Angulars dirtycheck you are given more control of how controllers and directives react to changes in the store. By using wildcards you can choose to listen to any event change in a store, within a specific state or a specific event. E.g. **this.emit('comments.add')**. Any of the following listeners will trigger:

```javascript
angular.module('app', ['flux'])
.controller('MyCtrl', function ($scope, MyStore, flux) {

	$scope.$listenTo(MyStore, 'comments.add', function () {
		$scope.comments = MyStore.getComments();
	});

	$scope.$listenTo(MyStore, 'comments.*', function () {
		$scope.comments = MyStore.getComments();
	});

	$scope.$listenTo(MyStore, '*', function () {
		$scope.comments = MyStore.getComments();
	});

});
```

## Wait for other stores to complete their handlers

```javascript
angular.module('app', ['flux'])
.store('CommentsStore', function (NotificationStore) {
	
	return {
		comments: [],
		handlers: {
			'addComment': 'addComment'
		},
		addComment: function (comment) {
			this.waitFor(NotificationStore, function () {
				this.comments.push(comment);
				this.emit('comments.add');
			}.bind(this));
		},
		getComments: function () {
			return this.comments;
		}
	};

})
.store('NotificationStore', function () {
	
	return {
		notifications: [],
		handlers: {
			'addComment': 'addNotification'
		},
		addNotification: function () {
			this.notifications.push('Something happened');
		},
		getNotifications: function () {
			return this.notifications;
		}
	};

});
```

License
-------

flux-angular is licensed under the [MIT license](LICENSE).

> The MIT License (MIT)
>
> Copyright (c) 2014 Brandon Tilley
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

