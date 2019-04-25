# flux-angular

**flux-angular** makes it easy to implement a performant, scalable, and clean
[flux application architecture](https://facebook.github.io/flux/docs/overview.html) in an angular
application. It does this by providing access to a new `angular.store` method
for holding immutable application state using [Baobab](https://github.com/Yomguithereal/baobab).
The `flux` service is exposed for dispatching actions using the [Yahoo Dispatchr](https://github.com/yahoo/fluxible/tree/master/packages/dispatchr).
`$scope.$listenTo` is exposed as a way to respond to changes in a store and sync them with the view-model.

- [Releases](https://github.com/christianalfoni/flux-angular/releases)
- [Usage](#usage)
  - [Create a store](#create-a-store)
  - [Dispatch actions](#dispatch-actions)
  - [Wait for other stores to complete their handlers](#wait-for-other-stores-to-complete-their-handlers)
  - [Testing stores](#testing-stores)
  - [Performance](#performance)
- [FAQ](#faq)
- [Contributing](#contributing)

## Installation

Use npm to install and then `require('flux-angular')` in your application.

```sh
npm install --save flux-angular
```

## Usage

By default the state in a store is immutable which means it cannot be changed
once created, except through a defined API. If you're unfamiliar with the
benefits of immutable data [this
article](http://jlongster.com/Using-Immutable-Data-Structures-in-JavaScript)
and [this video](https://www.youtube.com/watch?v=I7IdS-PbEgI) explain the theory and benefits.

Some of the pros:

- Faster reads because there is no deep cloning
- Less renders and `$scope.$watch` triggers because the reference to the object doesn't change unless the object changes
- Computed data (by using `this.monkey` in a store) can be observed in the same way
  as raw data. This allows for more logic to live in the store (e.g. a
  sorted version of a list) and for angular to only re-render when the raw data
  underlying the computed data changes. See the [full
  docs](https://github.com/Yomguithereal/baobab#computed-data-or-monkey-business).
- Changes are batched together so that multiple dispatches only trigger one
  re-render is needed. This can be disabled by setting the `asynchronous`
  option to false.

Some of the cons:

- Need to use a slightly [more verbose API](https://github.com/Yomguithereal/baobab#updates) for changing state.
- Slightly slower writes
- `ng-repeat` with immutable objects need to use the `track by` option.
  Otherwise angular will fail, complaining it can't add the `$$hashKey`
  variable to the collection items.
- If your directive/controller does need to modify the immutable object (e.g.
  for use with `ng-model`) you must use something like the
  [angular.copy](https://docs.angularjs.org/api/ng/function/angular.copy)
  function when pulling it out of the store. However, note that this has a
  performance impact. Also note that primitives are always copied so they don't
  need to be cloned.

Conclusion:
**It is faster, but a bit more verbose!**

### Configuration

Options that can be specified for the Baobab immutable store are [described
here](https://github.com/Yomguithereal/baobab#options).
For example, you may want to turn off immutability in production for a slight speed
increase, which you can do by setting the defaults:

```javascript
angular.module('app', ['flux']).config(function(fluxProvider) {
  fluxProvider.setImmutableDefaults({ immutable: false })
})
```

By default, your `$listenTo` callbacks will be wrapped in `$evalAsync` to ensure they are executed as part
of a digest cycle. You can turn this off like this:

```javascript
angular.module('app', ['flux']).config(function(fluxProvider) {
  fluxProvider.useEvalAsync(false)
})
```

### Create a store

```javascript
angular.module('app', ['flux']).store('MyStore', function() {
  return {
    initialize: function() {
      this.state = this.immutable({
        comments: [],
      })
    },
    handlers: {
      ADD_COMMENT: 'addComment',
    },
    addComment: function(comment) {
      this.state.push('comments', comment)
    },
    exports: {
      getLatestComment: function() {
        var comments = this.state.get('comments')
        return comments[comments.length - 1]
      },
      get comments() {
        return this.state.get('comments')
      },
    },
  }
})
```

See the [Baobab docs](https://github.com/Yomguithereal/baobab#updates) for
documentation on how to retrieve and update the immutable state.

### Two way databinding

```javascript
angular
  .module('app', ['flux'])
  .store('MyStore', function() {
    return {
      initialize: function() {
        this.state = this.immutable({
          person: {
            name: 'Jane',
            age: 30,
            likes: 'awesome stuff',
          },
        })
      },
      handlers: {
        SAVE_PERSON: 'savePerson',
      },
      savePerson: function(payload) {
        this.state.merge('person', payload.person)
      },
      saveName: function(payload) {
        this.state.set(['person', 'name'], payload.name)
      },
      exports: {
        get person() {
          return this.state.get('person')
        },
      },
    }
  })
  .component('myComponent', {
    templateUrl: 'myComponent.html',
    controller: function(MyStore, myStoreActions) {
      var vm = this
      vm.savePerson = myStoreActions.savePerson
      vm.$listenTo(MyStore, setStoreVars)
      vm.$listenTo(MyStore, ['person', 'name'], setName)

      function setStoreVars() {
        $scope.person = MyStore.person
      }

      function setName() {
        $scope.name = MyStore.person.name
      }
    },
  })
  .service('myStoreActions', function(flux) {
    var service = {
      savePerson: savePerson,
    }

    return service

    function savePerson(person) {
      flux.dispatch('SAVE_PERSON', { person: person })
    }
  })
```

By using the `.$listenTo()` method we set up a callback that will be fired
whenever any state in the store changes.
Also demonstrated via the `setName` example is that you can trigger an update
only when a specific node of the tree is changed. This gives you more control
over how controllers and directives react to changes in the store.
Thus, when we dispatch the updated values and merge them into the immutable
object the callback is triggered and our scope properties can be synced with
the store.

### Dispatch actions

It can be helpful to create a service for dispatching actions related to a
store since different components may want to trigger the same action.
Additionally, the action methods are the place where the coordination of
multiple dispatch calls occur, as shown in the `addComment` method below.

```javascript
angular
  .module('app', ['flux'])
  .factory('commentActions', function($http, flux) {
    var service = {
      setTitle: setTitle,
      addComment: addComment,
    }
    return service

    // An exaple of a basic dispatch with the first argument being the action key and a payload.
    // One or more stores is expected to have a handler for COMMENT_SET_TITLE
    function setTitle(title) {
      flux.dispatch('COMMENT_SET_TITLE', { title: title })
    }

    // It is not recommended to run async operations in your store handlers. The
    // reason is that you would have a harder time testing and the **waitFor**
    // method also requires the handlers to be synchronous. You solve this by having
    // async services, also called **action creators** or **API adapters**.
    function addComment(comment) {
      flux.dispatch('COMMENT_ADD', { comment: comment })
      $http
        .post('/comments', comment)
        .then(function() {
          flux.dispatch('COMMENT_ADD_SUCCESS', { comment: comment })
        })
        .catch(function(error) {
          flux.dispatch('COMMENT_ADD_ERROR', { comment: comment, error: error })
        })
    }
  })
```

### Wait for other stores to complete their handlers

The **waitFor** method allows you to let other stores handle the action before
the current store acts upon it. You can also pass an array of stores. It was
decided to run this method straight off the store, as it gives more sense and
now the callback is bound to the store itself.

```javascript
angular
  .module('app', ['flux'])
  .store('CommentsStore', function() {
    return {
      initialize: function() {
        this.state = this.immutable({ comments: [] })
      },
      handlers: {
        ADD_COMMENT: 'addComment',
      },
      addComment: function(comment) {
        this.waitFor('NotificationStore', function() {
          this.state.push('comments', comment)
        })
      },
      getComments: function() {
        return this.state.get('comments')
      },
    }
  })
  .store('NotificationStore', function() {
    return {
      initialize: function() {
        this.state = this.immutable({ notifications: [] })
      },
      handlers: {
        ADD_COMMENT: 'addNotification',
      },
      addNotification: function(comment) {
        this.state.push('notifications', 'Something happened')
      },
      exports: {
        getNotifications: function() {
          return this.state.get('notifications')
        },
      },
    }
  })
```

### Testing stores

When Angular Mock is loaded flux-angular will reset stores automatically.

```javascript
describe('adding items', function() {
  beforeEach(module('app'))

  it('it should add strings dispatched to addItem', inject(function(
    MyStore,
    flux
  ) {
    flux.dispatch('ADD_ITEM', 'foo')
    expect(MyStore.getItems()).toEqual(['foo'])
  }))

  it('it should add number dispatched to addItem', inject(function(
    MyStore,
    flux
  ) {
    flux.dispatch('ADD_ITEM', 1)
    expect(MyStore.getItems()).toEqual([1])
  }))
})
```

If you are doing integration tests using protractor you will want to disable
asynchronous event dispatching in Baobab since it relies on `setTimeout`, which
protractor can't detect:

```javascript
browser.addMockModule('protractorFixes', function() {
  angular.module('protractorFixes', []).config(function(fluxProvider) {
    fluxProvider.setImmutableDefaults({ asynchronous: false })
  })
})
```

### Performance

Any $scopes listening to stores are removed when the $scope is destroyed.
Immutability (which uses `Object.freeze`) can be [disabled in production](#configuration).

## FAQ

### Cannot call dispatch while another dispatch is executing

This is a problem/feature that is generic to the flux architecture. It can be
solved by having an action [dispatch multiple
events](https://github.com/christianalfoni/flux-angular/issues/48).

### Did you really monkeypatch Angular?

Yes. Angular has a beautiful API (except directives ;-) ) and I did not want
flux-angular to feel like an alien syntax invasion, but rather it being a
natural part of the Angular habitat. Angular 1.x is a stable codebase and I
would be very surprised if this monkeypatch would be affected in later
versions.

## Contributing

> Consider using [Visual Studio Code](https://code.visualstudio.com/) if you
> don't already have a favorite editor. The project includes a debug launch
> configuration and will recommend appropriate extensions for this project.

1. Fork the [official repository](https://github.com/christianalfoni/flux-angular)
2. Clone your fork: `git clone https://github.com/<your-username>/gatsby.git`
3. Setup the repo and install dependencies: `npm run bootstrap`
4. Make sure that tests are passing for you: `npm test`
5. Add tests and code for your changes
6. Make sure tests still pass: `npm test`
7. Commit, push, and pull request your changes

## License

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
