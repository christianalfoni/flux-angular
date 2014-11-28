angular.module('todomvc', ['flux', 'ngRoute'])
.config(function($routeProvider) {

  $routeProvider
  .when('/', {
    template: '<todomvc></todomvc>'
  })
  .when('/:status', {
    template: '<todomvc></todomvc>'
  })
  .otherwise({
    redirectTo: '/'
  });

});