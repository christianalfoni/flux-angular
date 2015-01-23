flux-angular
==========

## Welcome to version 2 of flux-angular
There are some pretty big changes to the API in the new version. If you want to keep using the previous API, go to [flux-angular 1.x](FLUX-ANGULAR-1.md). I would like to give special thanks to @sheerun for all the discussions and code contributions.

## Features

- **Yahoo Dispatchr**
- **EventEmitter2**
- **Angular Store**
- **Scope listenTo**
- **Immutable**

## Changes
**2.1.1**:
  - Callback only triggers on actual store event emitting now, not on initial registration

**2.1.0**:
  - Thanks to @SuperheroicCoding for great discussions!
  - Refactored implementation
  - Added tests
  - flux.createStore to manually creates stores
  - waitFor gives error if awaiting store is not injected

**2.0.1**:
  - Added automatic reset of stores during testing

## Concept
flux-angular 2 uses a more traditional flux pattern. It has the [Yahoo Dispatchr](https://github.com/yahoo/dispatchr) and [EventEmitter2](https://github.com/asyncly/EventEmitter2) for its event emitting. **Did you really monkeypatch Angular?**. Yes. Angular has a beautiful API (except directives ;-) ) and I did not want flux-angular to feel like an alien syntax invasion, but rather it being a natural part of the Angular habitat. Angular 1.x is a stable codebase and I would be very surprised if this monkeypatch would be affected in later versions.

## FAQ
** PhantomJS gives me an error on usage on function bind method**:
PhantomJS does not support ES5 `Function.prototype.bind`, but will in next version. Until then be sure to load the [ES5 shim](https://github.com/es-shims/es5-shim) with your tests.

## Create a store
```javascript
angular.module('app', ['flux'])
.store('MyStore', function () {

  return {

    // State
    comments: [],

    // Action handlers triggered by the dispatcher
    handlers: {
      'addComment': 'addComment'
    },
    addComment: function (comment) {
      this.comments.push(comment);
      this.emitChange();
    },

    // Getters
    exports: {
      getComments: function () {
        return this.comments;
      }
    }

  };

})
// You can also use a factory
.factory('Stores', function (flux) {
  return {
    'StoreA': flux.createStore('StoreA', {}),
    'StoreB': flux.createStore('StoreB', {})
  }
});
```
A store in flux-angular works just like the **Yahoo Dispatchr**, it IS the Yahoo Dispatchr. The only difference is an extra property called **exports**. So **exports** and **handlers** are special properties. **handlers** is an object defining what dispatched actions to listen to and what method to run when that occurs. **exports** is an object defining methods to expose to controllers. The methods in the exports object is bound to the store. Any data returned by an export method is cloned. This keeps the store immutable. If you need to use an other export method inside an export method use **this.exports.myOtherExport()** to do so. That will not cause cloning. 

## Dispatching actions and grabbing state from store
```javascript
angular.module('app', ['flux'])
.controller('MyCtrl', function ($scope, MyStore, flux) {
  
  $scope.comment = '';

  // $listenTo to listen to changes in store
  $scope.$listenTo(MyStore, function () {
    $scope.comments = MyStore.getComments();
  });

  $scope.addComment = function () {
    flux.dispatch('addComment', $scope.comment);
    $scope.comment = '';
  };

});
```
When a store runs the **emitChange** method any scopes listening to that store will trigger their callback, allowing them to update the $scope of the controller. You can also trigger specific events if you want to, with **emit('event')**.

### Event wildcards
Due to Angulars dirtycheck you are given more control of how controllers and directives react to changes in the store. By using wildcards you can choose to listen to any event change in a store, within a specific state or a specific event. All the following listeners will trigger when MyStore runs **this.emit('comments.add')**:

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
.store('CommentsStore', function () {
  
  return {
    comments: [],
    handlers: {
      'addComment': 'addComment'
    },
    addComment: function (comment) {
      this.waitFor('NotificationStore', function () {
        this.comments.push(comment);
        this.emit('comments.add');
      });
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
    addNotification: function (comment) {
      this.notifications.push('Something happened');
      comment.hasNotified = true;
    },
    exports: {
      getNotifications: function () {
        return this.notifications;
      }
    }
  };

});
```
The **waitFor** method allows you to let other stores handle the action before the current store acts upon it. You can also pass an array of stores. It was decided to run this method straight off the store, as it gives more sense and now the callback is bound to the store itself.

### Lots of actions, use constants
When you develop a larger application, especially with lots of async operations it can be a good idea to define your actions as constants. That way it is less likely that a typo becomes confusing.

```javascript
angular.module('app', ['flux'])
.constant('actions', {
  'COMMENT_ADD': 'comment_add'
})
.controller('MyCtrl', function (flux, actions) {
  $scope.addComment = function (comment) {
    flux.dispatch(actions.COMMENT_ADD, comment);
  };
});
```

### Async operations
It is not recommended to run async operations in your store handlers. The reason is that you would have a harder time testing and the **waitFor** method also requires the handlers to be synchronous. You solve this by having async services.

```javascript
angular.module('app', ['flux'])
.constant('actions', {
  'COMMENT_ADD': 'comment_add',
  'COMMENT_ADD_SUCCESS': 'comment_add_success',
  'COMMENT_ADD_ERROR': 'comment_add_error'
})
.factory('Backend', function ($http, flux, actions) {
  return {
    addComment: function (comment) {
      flux.dispatch(actions.COMMENT_ADD, comment);
      $http.post('/comments', comment)
      .success(function () {
        flux.dispatch(actions.COMMENT_ADD_SUCCESS, comment);
      })
      .error(function (error) {
        flux.dispatch(actions.COMMENT_ADD_ERROR, comment, error);
      });
    }
  };
})
.controller('MyCtrl', function (Backend) {
  $scope.addComment = function () {
    Backend.addComment({content: 'foo'});
  };
});
```

### Get values from other stores
If your application is structured in such a manner that you need to share state between stores you can create a shared state service:

```javascript
angular.module('app', ['flux'])
.factory('AppState', function () {
  return {
    notifications: []
  };
})
.store('CommentsStore', function (AppState) {
  
  return {
    comments: [],
    handlers: {
      'addComment': 'addComment'
    },
    addComment: function (comment) {
      this.waitFor('NotificationStore', function () {
        comment.notificationId = AppState.notifications.length;
        this.comments.push(comment);
        this.emit('comments.add');
      });
    },
    getComments: function () {
      return this.comments;
    }
  };

})
.store('NotificationStore', function (AppState) {
  
  return {
    handlers: {
      'addComment': 'addNotification'
    },
    addNotification: function (comment) {
      AppState.notifications.push('Something happened');
      comment.hasNotified = true;
    },
    exports: {
      getNotifications: function () {
        return AppState.notifications;
      }
    }
  };

});
```
If you first start to depend on stores directly you quickly get into circular dependency issues. You might consider putting all your state in a common AppState object that only the stores will inject.

### Testing stores
When Angular Mock is loaded flux-angular will reset stores automatically.

```javascript
describe('adding items', function () {

  beforeEach(module('app'));

  it('it should add strings dispatched to addItem', inject(function (MyStore, flux) {
    flux.dispatch('addItem', 'foo')
    expect(MyStore.getItems()).toEqual(['foo']);
  }));

  it('it should add number dispatched to addItem', inject(function (MyStore, flux) {
    flux.dispatch('addItem', 1)
    expect(MyStore.getItems()).toEqual([1]);
  }));

});

```

### Performance
Any $scopes listening to stores are removed when the $scope is destroyed. When it comes to cloning it only happens when you pull data out from a store. So an array of 10.000 items in the store is not a problem, because your application would probably not want to show all 10.000 items at any time. In this scenario your getter method probably does a filter, or a limit before returning the data.

### Run tests
`karma start` and open browser at `http://localhost:9876/`

License
-------

flux-angular is licensed under the [MIT license](LICENSE).

> The MIT License (MIT)
>
> Copyright (c) 2014 Christian Alfoni
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
