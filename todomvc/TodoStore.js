angular.module('todomvc')
.store('TodoStore', function ($routeParams) {
  return {
    todos: [],
    saving: false,
    filter: null,
    initialize: function () {
      var status = $routeParams.status || '';
      this.filter = (status === 'active') ?
        { completed: false } : (status === 'completed') ?
        { completed: true } : null;
    },

    handlers: {
      'addTodo': 'addTodo'
    },
    addTodo: function (todo) {

      if (!todo) {
        return;
      }

      this.todos.push({
        title: todo,
        completed: false
      });

      this.emit('todos.add');

    },

    getTodos: function () {
      return this.todos;
    },
    isAllChecked: function () {
      return this.todos.filter(function (todo) {
        return todo.completed;
      }).length === this.todos.length;
    },
    getFilter: function () {
      return this.filter;
    }
  };
});