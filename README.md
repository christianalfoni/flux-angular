flux-angular
==========

## Flux-Angular 2 now has immutability mode!
The API of flux-angular is really starting to shape up, but there is still one challenge. To create a one way flow flux-angular clones data retrieved from the exports of a store. This has two performance hits. First of all it is a deep clone process, which can have a high cost on complex data structures. Second Angular will always see data retrieved from getters as a new value, even if it has not changed. This forces Angular to always do a new render, even though there was no need for it.

[immutable-store](https://github.com/christianalfoni/immutable-store) is a separate project that solves this issue. Flux-angular can now be run in an immutable mode, where you create immutable data structures for the stores.

- [Features](#Features)
- [Concept](#Concept)
- [FAQ](#FAQ)
- [Create a store](#Create-a-store)
- [Grab state](#Grab-state)
- [Dispatch actions](#Dispatch-actions)
- [Immutable mode](#Immutable-mode)
- [Event wildcards](#Event-wildcards)
- [Wait for other stores to complete their handlers](#Wait-for-other-stores-to-complete-their-handlers)
- [Lots of actions, use constants](#Lots-of-actions-use-constants)
- [Async operations](#Async-operations)
- [Testing stores](#Testing-stores)
- [Performance](#Performance)
- [Changes](#Changes)
- [Run project](#Run-project)


## Features

- **Yahoo Dispatchr**
- **EventEmitter2**
- **Angular Store**
- **Scope listenTo**
- **Immutable**

## Concept
flux-angular 2 uses a more traditional flux pattern. It has the [Yahoo Dispatchr](https://github.com/yahoo/dispatchr) and [EventEmitter2](https://github.com/asyncly/EventEmitter2) for its event emitting. It also includes the [immutable-store](https://github.com/christianalfoni/immutable-store) that you can use in the **immutable mode** of flux-angular. **Did you really monkeypatch Angular?**. Yes. Angular has a beautiful API (except directives ;-) ) and I did not want flux-angular to feel like an alien syntax invasion, but rather it being a natural part of the Angular habitat. Angular 1.x is a stable codebase and I would be very surprised if this monkeypatch would be affected in later versions.

## FAQ
**PhantomJS gives me an error related to bind**:
PhantomJS does not support ES5 `Function.prototype.bind`, but will in next version. Until then be sure to load the [ES5 shim](https://github.com/es-shims/es5-shim) with your tests.


## Create a store
```javascript
angular.module('app', ['flux'])
.store('MyStore', function () { 
  return {
    comments: [],
    handlers: {
      'addComment': 'addComment'
    },
    addComment: function (comment) {
      this.comments.push(comment);
      this.emitChange();
    },
    exports: {
      getLatestComment: function () {
        return this.comments[this.comments.length - 1];
      },
      get comments() {
        return this.comments;
      }
    }
  };
})
.factory('Stores', function (flux) {
  return {
    'StoreA': flux.createStore('StoreA', {}),
    'StoreB': flux.createStore('StoreB', {})
  }
});
```

## Grab state
```javascript
angular.module('app', ['flux'])
.controller('MyCtrl', function (MyStore, $scope) {
  $scope.comments = MyStore.comments;
  $scope.latestComment = MyStore.getLatestComment();
  $scope.$listenTo(MyStore, function () {
    $scope.comments = MyStore.comments;
    $scope.latestComment = MyStore.getLatestComment();
  });
});
```

## Dispatch actions
```javascript
angular.module('app', ['flux'])
.controller('MyCtrl', function (MyStore, $scope, flux) {
  $scope.title = '';
  $scope.addComment = function () {
    flux.dispatch('addComment', $scope.title);
    $scope.title = '';
  };
});
```

## Immutable mode
If you're new to the idea of immutable data then you may be interested in [this video](https://www.youtube.com/watch?v=I7IdS-PbEgI) from React.js conf which explains the theory and benefits.  The big benefits are:
* Faster reads because of the lack of deep cloning.
* Less renders and `$scope.$watch` triggers because the reference to the object doesn't change unless the object changes.

Downsides and caveats:
* Need to use the immutable API for changing state (see below).
* Slightly slower writes
* `ng-repeat` with immutable objects need to use the `track by` option. Otherwise angular will fail, complaining it can't add the `$$hashKey` variable to the collection items.
* If your directive/controller does need to modify the immutable object (e.g. for use with `ng-model`) you must use the `toJS()` method when pulling it out of the store.  However, note that primitives are always copied so they don't need `toJS()`.

### Configuration
To use real immutable objects in your stores rather than relying on flux-angular wrapping all your exports in a deep clone operation then your application must opt-in to immutability mode:

```javascript
angular.module('app', ['flux'])
.config(function (fluxProvider) {
  fluxProvider.useCloning(false);
});
```

### Create a store
```javascript
angular.module('app', ['flux'])
.store('MyStore', function (flux) {
  
  var state = flux.immutable({
    comments: []
  });  

  return {
    handlers: {
      'addComment': 'addComment'
    },
    addComment: function (comment) {
      state = state.items.push(comment);
      this.emitChange();
    },
    exports: {
      getLatestComment: function () {
        return state.comments[state.comments.length - 1];
      },
      get comments() {
        return state.comments;
      }
    }
  };
});
```
**Note** that all mutations done to the immutable data structure will return a completely new data structure that needs to replace the old one. 

### Mutations
```javascript
angular.module('app', ['flux'])
.store('MyStore', function (flux) {
  
  var state = flux.immutable({
    object: {},
    array: [],
    primitive: 123
  });  

  return {
    handlers: {
      'allMutations': 'allMutations'
    },
    allMutations: function (comment) {
      state = state.object.set('foo', 'bar');
      state = state.object.merge({something: 'else'});
      state = state.array.push('foo');
      state = state.array.splice(0, 1, 'bar');
      state = state.array.pop();
      state = state.array.concat(['something']);
      state = state.array.shift();
      state = state.array.unshift('else');
      state = state.set('primitive', 456);
    },
    exports: {}
  };
});
```

### Two way databinding
```javascript
angular.module('app', ['flux'])
.store('MyStore', function (flux) {
  var state = flux.immutable({
    person: {
      name: 'Jane',
      age: 30,
      likes: 'awesome stuff'
    }
  });
  return {
    handlers: {
      'savePerson': 'savePerson'
    },
    savePerson: function (updatedPerson) {
      state = state.person.merge(updatedPerson);
      this.emitChange();
    }
  };
})
.controller('MyCtrl', function (MyStore, $scope, flux) {
  $scope.person = MyStore.person.toJS();
  $scope.savePerson = function () {
    flux.dispatch('savePerson', $scope.person);
  };
  $scope.$listenTo(MyStore, function () {
    $scope.person = MyStore.person.toJS();
  });
});
```
By using the `.toJS()` method we extract that state from the immutable object or array and allow Angular to update those values. We can then dispatch the updated values and merge them back into the immutable object.


### Event wildcards
You can also trigger specific events in addition to `this.emitChange()`. Due to Angulars dirtycheck you are given more control of how controllers and directives react to changes in the store. By using wildcards you can choose to listen to any event change in a store, within a specific state or a specific event. All the following listeners will trigger when MyStore runs `this.emit('comments.add')`:

```javascript
angular.module('app', ['flux'])
.controller('MyCtrl', function ($scope, MyStore, flux) {

  $scope.$listenTo(MyStore, 'comments.add', function () {
    $scope.comments = MyStore.comments;
  });

  $scope.$listenTo(MyStore, 'comments.*', function () {
    $scope.comments = MyStore.comments;
  });

  $scope.$listenTo(MyStore, '*', function () {
    $scope.comments = MyStore.comments;
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
It is not recommended to run async operations in your store handlers. The reason is that you would have a harder time testing and the **waitFor** method also requires the handlers to be synchronous. You solve this by having async services, also called **action creators** or **API adapters**.

```javascript
angular.module('app', ['flux'])
.constant('actions', {
  'COMMENT_ADD': 'comment_add',
  'COMMENT_ADD_SUCCESS': 'comment_add_success',
  'COMMENT_ADD_ERROR': 'comment_add_error'
})
.factory('CommentActions', function ($http, flux, actions) {
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
.controller('MyCtrl', function (CommentActions) {
  $scope.addComment = function () {
    CommentActions.addComment({content: 'foo'});
  };
});
```

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
Any $scopes listening to stores are removed when the $scope is destroyed. When it comes to immutability mode against normal mode it is difficult to measure exactly how much benefit you get. It depends on the amount of data you have in your stores and how often you trigger changes. I would encourage running immutability mode as the API is pretty much the same and you should get a serious performance boost.

### Changes
**2.3.1**
  - Added new version of immutable-store, where "set" bug is fixed

**2.3.0**:
  - Introducing immutable mode
  - Exposed as a provider to allow configuration
  - New **immutable()** method to create immutable data structures

**2.2.0**:
  - Fixed binding of export methods (thanks @Nihat)
  - Fixed missing development deps
  - Now supports getter functions in exports, cool stuff! (thanks @mlegenhausen)
  - Added tests and updated documentation

**2.1.2**:
  - Cloning now keeps prototype of object, if not Object
  - Stores are now pre-injected. This is to avoid confusion where you trigger dispatches in for example UI router (store is not yet injected)

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


### Run project
1. `npm install`
2. `bower install`
3. `gulp build`
4. `npm test` and open browser at `http://localhost:9876/`

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
