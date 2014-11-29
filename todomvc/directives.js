angular.module('todomvc')
.directive('todomvc', function () {
  return {
    restrict: 'E',
    scope: {},
    templateUrl: 'templates/todomvc.html'
  };
})
.directive('addTodo', function (TodoStore, flux) {
  return {
    restrict: 'E',
    scope: {},
    templateUrl: 'templates/addtodo.html',
    link: function (scope) {
      scope.newTodo = '';
      scope.addTodo = function () {
        flux.dispatch('addTodo', scope.newTodo);
        scope.newTodo = '';
      };
      scope.$listenTo(TodoStore, 'todos.saving', function () {
        scope.saving = TodoStore.isSaving();
      });
    }
  };
})
.directive('todosList', function (TodoStore, flux) {
  return {
    restrict: 'E',
    scope: {},
    templateUrl: 'templates/todoslist.html',
    link: function (scope) {
      scope.editedTodo = null;

      scope.$listenTo(TodoStore, 'todos.*', function() {
        scope.todos = TodoStore.getTodos();
        scope.allChecked = TodoStore.isAllChecked();
        scope.statusFilter = TodoStore.getFilter();
      });
    }
  };
});
