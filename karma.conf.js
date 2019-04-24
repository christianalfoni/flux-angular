module.exports = function(config) {
  config.set({
    basePath: '',

    frameworks: ['jasmine'],

    files: [
      // the rollup processor will watch files for us
      { pattern: 'tests/flux-angular-spec.js', watched: false },
    ],

    exclude: [],

    preprocessors: {
      'tests/flux-angular-spec.js': ['rollup'],
    },

    rollupPreprocessor: {
      output: {
        format: 'iife',
        name: 'fluxAngular',
        sourcemap: 'inline',
      },
      plugins: [
        // Resolve and include dependencies in the bundle
        require('rollup-plugin-node-resolve')({ browser: true }),
        require('rollup-plugin-commonjs')(),
        require('rollup-plugin-babel')({
          exclude: ['node_modules/**'],
        }),
      ],
    },

    // test results reporter to use
    reporters: ['progress'],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['ChromeHeadless'],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,
  })
}
