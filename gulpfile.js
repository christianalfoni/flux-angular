var gulp = require('gulp');
// Used to stream bundle for further handling
var source = require('vinyl-source-stream'); 
var browserify = require('browserify');
var watchify = require('watchify');
var gulpif = require('gulp-if');
var streamify = require('gulp-streamify');
var notify = require('gulp-notify');
var concat = require('gulp-concat');
var gutil = require('gulp-util');
var shell = require('gulp-shell');
var glob = require('glob');
var jasminePhantomJs = require('gulp-jasmine2-phantomjs');

var browserifyTask = function (options) {
  // Our app bundler
  var appBundler = browserify({
    entries: [options.src], // Only need initial file, browserify finds the rest
    debug: options.development, // Gives us sourcemapping
    standalone: options.development ? null : 'flux',
    cache: {}, packageCache: {}, fullPaths: true // Requirement of watchify
  });

  appBundler.external('angular');

  // The rebundle process
  var rebundle = function () {
    var start = Date.now();
    console.log('Building APP bundle');
    appBundler.bundle()
      .on('error', gutil.log)
      .pipe(source('flux-angular.js'))
      .pipe(gulp.dest(options.dest))
      .pipe(notify(function () {
        console.log('APP bundle built in ' + (Date.now() - start) + 'ms');
      }));
  };

  // Fire up Watchify when developing
  if (options.development) {
    appBundler = watchify(appBundler);
    appBundler.on('update', rebundle);
  }
      
  rebundle();
};

// Starts our development workflow
gulp.task('default', function () {

  browserifyTask({
    development: true,
    src: './src/flux-angular.js',
    dest: './build'
  });

});

gulp.task('release', function () {

  browserifyTask({
    development: false,
    src: './src/flux-angular.js',
    dest: './release'
  });

});
