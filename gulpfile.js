var gulp = require('gulp');
var source = require('vinyl-source-stream'); // Used to stream bundle for further handling
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

// External dependencies you do not want to rebundle while developing,
// but include in your application deployment
var dependencies = [
  'angular',
  'dispatchr',
  'util'
];

var browserifyTask = function (options) {

  // Our app bundler
  var appBundler = browserify({
    entries: [options.src], // Only need initial file, browserify finds the rest
    debug: options.development, // Gives us sourcemapping
    standalone: options.development ? null : 'flux',
    cache: {}, packageCache: {}, fullPaths: true // Requirement of watchify
  });

  // We set our dependencies as externals on our app bundler when developing    
  (options.development ? dependencies : ['angular']).forEach(function (dep) {
    appBundler.external(dep);
  });

  // The rebundle process
  var rebundle = function () {
    var start = Date.now();
    console.log('Building APP bundle');
    appBundler.bundle()
      .on('error', gutil.log)
      .pipe(source('main.js'))
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

  // We create a separate bundle for our dependencies as they
  // should not rebundle on file changes. This only happens when
  // we develop. When deploying the dependencies will be included 
  // in the application bundle
  if (options.development) {

    var testFiles = glob.sync('./specs/**/*-spec.js');
    var testBundler = browserify({
      entries: testFiles,
      debug: true, // Gives us sourcemapping
      cache: {}, packageCache: {}, fullPaths: true // Requirement of watchify
    });

    dependencies.forEach(function (dep) {
      testBundler.external(dep);
    });

    var rebundleTests = function () {
      var start = Date.now();
      console.log('Building TEST bundle');
      testBundler.bundle()
      .on('error', gutil.log)
        .pipe(source('specs.js'))
        .pipe(gulp.dest(options.dest))
        .pipe(notify(function () {
          console.log('TEST bundle built in ' + (Date.now() - start) + 'ms');
        }));
    };

    testBundler = watchify(testBundler);
    testBundler.on('update', rebundleTests);
    rebundleTests();

    var vendorsBundler = browserify({
      debug: true,
      require: dependencies
    });
    
    // Run the vendor bundle
    var start = new Date();
    console.log('Building VENDORS bundle');
    vendorsBundler.bundle()
      .on('error', gutil.log)
      .pipe(source('vendors.js'))
      .pipe(gulp.dest(options.dest))
      .pipe(notify(function () {
        console.log('VENDORS bundle built in ' + (Date.now() - start) + 'ms');
      }));
    
  }
  
};

// Starts our development workflow
gulp.task('default', function () {

  browserifyTask({
    development: true,
    src: './src/main.js',
    dest: './build'
  });

});

gulp.task('deploy', function () {

  browserifyTask({
    development: false,
    src: './src/main.js',
    dest: './dist'
  });

});

gulp.task('test', function () {
    return gulp.src('./build/testrunner-phantomjs.html').pipe(jasminePhantomJs());
});
