var gulp = require('gulp');
// Used to stream bundle for further handling
var source = require('vinyl-source-stream'); 
var browserify = require('browserify');
var watchify = require('watchify');
var notify = require('gulp-notify');
var gutil = require('gulp-util');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');

var scripts = ['./src/*.js', './gulpfile.js'];

var browserifyTask = function (options) {
  // Our app bundler
  var appBundler = browserify({
    entries: [options.src], // Only need initial file, browserify finds the rest
    debug: options.development, // Gives us sourcemapping
    standalone: options.development ? null : 'flux',
    cache: {}, packageCache: {}, fullPaths: options.development // Requirement of watchify
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
  gulp.run('lint', 'build', 'watch');
});

gulp.task('build', function () {
  browserifyTask({
    development: true,
    src: './src/flux-angular.js',
    dest: './build'
  });
});

gulp.task('lint', function () {
  gulp.src(scripts)
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task('watch', function() {
  gulp.watch(scripts, ['lint']);
});

gulp.task('deploy', function () {

  gulp.run('lint');

  browserifyTask({
    development: false,
    src: './src/flux-angular.js',
    dest: './release'
  });

});
