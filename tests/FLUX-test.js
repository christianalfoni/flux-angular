/** @jsx React.DOM */
var expect = require('chai').expect;

/*
describe('FLUX', function() {
  it('should create a component with merged properties', function() {

    var TestUtils = require('react/addons').addons.TestUtils;
    var React = require('../app/main.js');
    var Component = React.createClass({
      foo: 'bar',
      render: function () {
        return (
          <div/>
        )
      }
    });
    var component = TestUtils.renderIntoDocument(
      <Component/>
    );
    expect(component.foo).to.equal('bar');
  });
  it('should create a store with props passed', function() {
    var React = require('../app/main.js');
    var store = React.createStore({
      foo: 'bar'
    });
    expect(store.foo).to.equal('bar');
  });
  it('should trigger storesDidUpdate() on components when stores flush', function() {

    var TestUtils = require('react/addons').addons.TestUtils;
    var React = require('../app/main.js');
    var storeA = React.createStore({dispatch: function () { this.flush(); }});
    var storesDidUpdateCalled = false;
    var Component = React.createClass({
      stores: [storeA],
      storesDidUpdate: function () {
        storesDidUpdateCalled = true;
      },
      render: function () {
        return (
          <div/>
        )
      }
    });
    var component = TestUtils.renderIntoDocument(
      <Component/>
    );
    storeA.dispatch();
    expect(storesDidUpdateCalled).to.equal(true); 
  });
});
*/
