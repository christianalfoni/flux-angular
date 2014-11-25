## Experiment 1: EventEmitter

```javascript
.factory('AppActions', function (flux) {

  return flux.actions(['addComment']);

})
.factory('AppStore', function (flux, AppActions) {

  return flux.store({
    comments: [],
    actions: [AppActions.addComment],
    addComment: function (comment) {
      this.comments.push(comment);
      this.emit('comment:added');
    },
    exports: {
      getComments: function () {
        return this.comments;
      }
    }
  });

})
.controller('AppCtrl', function ($scope, AppStore, AppActions) {
  
  $scope.comment = '';
  $scope.comments = AppStore.getComments();

  $scope.addComment = function () {
    AppActions.addComment($scope.comment);
    $scope.comment = '';
  };

  $scope.$listenTo(AppStore, 'all', function () {
    $scope.comments = AppStore.getComments();
    // this.comments = AppStore.getComments(); scope is bound to callback
  });

 

});
```

```html
<body ng-app="app">
<div ng-controller="AppCtrl">
  <form ng-submit="addComment()">
    <input type="text" ng-model="comment"/>
  </form>
  <ul>
    <li ng-repeat="comment in comments">{{comment}}</li>
  </ul>
</div>
</body>
```

## Experiment 2: Extended angular with components, bye bye controllers!
```javascript
.actions('AppActions', ['addComment'])
.store('AppStore', function (AppActions) {

  return {
    comments: [],
    actions: [AppActions.addComment],
    addComment: function (comment) {
      this.comments.push(comment);
      this.emit('comment:added');
    },
    exports: {
      getComments: function () {
        return this.comments;
      }
    }
  };

})
.component('App', function (AppStore, AppActions) {

  return {
    templateUrl: 'App.html',
    comments: AppStore.getComments(),
    comment: '',
    init: function () {
      this.$listenTo(AppStore, 'all', this.updateComments);
    },
    updateComments: function () {
      this.comments = AppStore.getComments();
    },
    addComment: function () {
      AppActions.addComment(this.comment);
      this.comment = '';
    }
  };

});
```

```html
<body ng-app="app">
  <app/>
</body>
```

```html
<div>
  <form ng-submit="addComment()">
    <input type="text" ng-model="comment"/>
  </form>
  <ul>
    <li ng-repeat="comment in comments">{{comment}}</li>
  </ul>
</div>
```