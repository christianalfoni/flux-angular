describe('FLUX-ANGULAR', function () {

  describe('Using the store method', function () {

    beforeEach(function () {

      angular.module('test', ['flux'])
        .store('MyStore', function () {
          return {
            items: [],
            handlers: {
              addItem: 'addItem'
            },
            addItem: function (item) {
              this.items.push(item);
            },
            exports: {
              getItems: function () {
                return this.items;
              }
            }
          };
        });

      module('test');

    });

    it('should expose the exports object of the store', inject(function (MyStore) {
      expect(MyStore.getItems).toBeDefined();
    }));

    it('should clone state values when exported', inject(function (MyStore, flux) {
      var store = flux.getStore(MyStore);
      expect(MyStore.getItems()).not.toBe(store.items);
    }));

    it('should handle a dispatched message', inject(function (MyStore, flux) {
      flux.dispatch('addItem', 'foo');
      expect(MyStore.getItems()[0]).toEqual('foo');
    }));

  });

  describe('Using the store method', function () {

    beforeEach(function () {

      angular.module('test', ['flux'])
        .factory('MyStore', function (flux) {
          return flux.createStore('MyStore', {
            items: [],
            handlers: {
              addItem: 'addItem'
            },
            addItem: function (item) {
              this.items.push(item);
            },
            exports: {
              getItems: function () {
                return this.items;
              }
            }
          });
        });

      module('test');

    });

    it('should expose the exports object of the store', inject(function (MyStore) {
      expect(MyStore.getItems).toBeDefined();
    }));

    it('should clone state values when exported', inject(function (MyStore, flux) {
      var store = flux.getStore(MyStore);
      expect(MyStore.getItems()).not.toBe(store.items);
    }));

    it('should handle a dispatched message', inject(function (MyStore, flux) {
      flux.dispatch('addItem', 'foo');
      expect(MyStore.getItems()[0]).toEqual('foo');
    }));

  });

  describe('Waiting for other stores', function () {

    beforeEach(function () {

      angular.module('test', ['flux'])
        .store('StoreA', function () {
          return {
            items: [],
            handlers: {
              addItem: 'addItem',
              addItems: 'addItems'
            },
            addItem: function (item) {
              this.waitFor('StoreB', function () {
                item.stores.push('StoreA');
                this.items.push(item);
              });
            },
            addItems: function (items) {
              this.items = this.items.concat(items);
            },
            exports: {
              getItems: function () {
                return this.items;
              }
            }
          };
        })
        .store('StoreB', function () {
          return {
            items: [],
            handlers: {
              addItem: 'addItem',
              addItems: 'addItems'
            },
            addItem: function (item) {
              item.stores.push('StoreB');
              this.items.push(item);
            },
            addItems: function (items) {
              this.waitFor(['StoreA'], function () {
                this.items = this.items.concat(items);
              });
            },
            exports: {}
          };
        });

      module('test');

    });

    it('should wait for other store defined to finish first', inject(function (StoreA, StoreB, flux) {
      flux.dispatch('addItem', {
        stores: []
      });
      expect(StoreA.getItems()[0].stores).toEqual(['StoreB', 'StoreA']);
    }));

    it('should be able to wait for stores using an array', inject(function (StoreA, StoreB, flux) {
      flux.dispatch('addItems', ['foo']);
      expect(StoreA.getItems()).toEqual(['foo']);
    }));

    it('should give error when store waited for is not injected', inject(function (StoreA, flux) {
      expect(flux.dispatch.bind(flux, 'addItem', 'foo')).toThrow();
    }));

  });

  describe('Using the store method', function () {

    beforeEach(function () {

      angular.module('test', ['flux'])
        .store('MyStore', function () {
          return {
            items: [],
            handlers: {
              addItem: 'addItem'
            },
            addItem: function (item) {
              this.items.push(item);
            },
            exports: {
              getItems: function () {
                return this.items;
              }
            }
          };
        });

      module('test');

    });

    it('should expose the exports object of the store', inject(function (MyStore) {
      expect(MyStore.getItems).toBeDefined();
    }));

    it('should clone state values when exported', inject(function (MyStore, flux) {
      var store = flux.getStore(MyStore);
      expect(MyStore.getItems()).not.toBe(store.items);
    }));

    it('should handle a dispatched message', inject(function (MyStore, flux) {
      flux.dispatch('addItem', 'foo');
      expect(MyStore.getItems()[0]).toEqual('foo');
    }));

  });

  describe('Listening to events', function () {

    beforeEach(function () {

      angular.module('test', ['flux'])
        .factory('MyStore', function (flux) {
          return flux.createStore('MyStore', {
            items: [],
            handlers: {
              addItem: 'addItem',
              triggerEvent: 'triggerEvent'
            },
            addItem: function (item) {
              this.items.push(item);
              this.emitChange();
            },
            triggerEvent: function () {
              this.emit('event');
            },
            exports: {
              getItems: function () {
                return this.items;
              }
            }
          });
        });

      module('test');

    });

    it('should have a $listenTo method', inject(function (MyStore, $rootScope) {
      var $scope = $rootScope.$new();
      expect($scope.$listenTo).toBeDefined();
    }));

    it('should call the callback when change event is emitted', inject(function (MyStore, $rootScope, flux) {
      var $scope = $rootScope.$new();
      var cb = jasmine.createSpy('callback');
      $scope.$listenTo(MyStore, cb);
      flux.dispatch('addItem', 'foo');
      expect(cb.calls.count()).toEqual(1);
    }));

    it('should call the callback if specific event is listened to and emitted', inject(function (MyStore, $rootScope, flux) {
      var $scope = $rootScope.$new();
      var cb = jasmine.createSpy('callback');
      $scope.$listenTo(MyStore, 'event', cb);
      flux.dispatch('triggerEvent');
      expect(cb.calls.count()).toEqual(1);
    }));

  });

});
