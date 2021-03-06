'use strict';

var yeoman = require('yeoman-generator');
var yosay = require('yosay');
var cordova = new (require('./cordovaAdapter.js'))('cordova');
var _ = require('underscore');
var OptionBuilder = require('./optionBuilder.js');
var promptConfig = require('./promptConfig.js');
var ProjectFiles = require('./projectFiles.js');

var projectBuilder = {
  create: _.bind(cordova.create, cordova),
  getAvailablePlatforms: function (callback) {
    return cordova.getAvailablePlatforms(callback);
  },
  addPlatforms: function (platforms, callback) {
    if (platforms && platforms.length > 0) {
      cordova.addPlatforms(platforms, callback);
    } else {
      callback();
    }
  },
  searchOfficialPlugins: function (callback) {
    return cordova.searchPlugin('org.apache.cordova', function (plugins) {
      // cordova plugin search error with Node.js@0.11.15
      // If plugin search failed, use default plugin list.
      if (!plugins || plugins.length <= 0) {
        plugins = require('./plugins.js').default;
      }
      callback(plugins);
    });
  },
  addPlugins: function (plugins, callback) {
    if (plugins && plugins.length > 0) {
      cordova.addPlugin(plugins, callback);
    } else {
      callback();
    }
  }
};

var GraybulletCordovaGenerator = yeoman.generators.Base.extend({
  constructor: function () {
    yeoman.Base.apply(this, arguments);

    // Delegate options from generator-webapp.
    this.optionBuilder = new OptionBuilder(this, this.env.create('webapp'));
    this.optionBuilder.copyDelegatedDefines();
  },

  initializing: function () {
    this.pkg = require('../package.json');

    this.projectOptions = {};
  },

  prompting: {
    /**
     * Prompting project information.
     */
    promptingProject: function () {
      var done = this.async();

      this.log(yosay('Welcome to the Apache Cordova generator!'));

      var prompts = [
        {
          name: 'name',
          message: 'What is the name of Apache Cordova App?',
          'default': 'HelloCordova'
        }, {
          name: 'id',
          message: 'What is the ID of Apache Cordova App?',
          'default': 'io.cordova.hellocordova'
        }
      ];

      this.prompt(prompts, function (props) {
        this.projectOptions.name = props.name;
        this.projectOptions.id = props.id;

        done();
      }.bind(this));
    },

    /**
     * Create Apache Cordova project to 'cordova' directory.
     */
    createCordovaProject: function () {
      projectBuilder.create(this.projectOptions.id,
                            this.projectOptions.name,
                            this.async());
    },

    /**
     * Prompting adding platforms.
     */
    promptingAddPlatforms: function () {
      var done = this.async();

      var prompt = function (platforms) {
        var prompts = [
          _.extend(promptConfig.getPlatforms(platforms), {
            name: 'platforms',
            message: 'What app of the platform to be created?'
          })
        ];

        this.prompt(prompts, function (props) {
          this.projectOptions.platforms = props.platforms;

          done();
        }.bind(this));
      }.bind(this);

      projectBuilder.getAvailablePlatforms(prompt);
    },

    /**
     * Before add Cordova Platforms.
     */
    beforeAddPlatforms: function () {
      var path = require('path');
      var fs = require('fs');

      var source = path.join(this.sourceRoot(),
                             '_after_platform_add_android.js');
      var destination = path.join(this.destinationRoot(),
                                  'cordova/hooks/after_platform_add/after_platform_add_android.js');

      // copy file.
      fs.mkdirSync(path.dirname(destination));
      var data = fs.readFileSync(source);
      fs.writeFileSync(destination, data);

      // syncronize stats and modification times.
      var stats = fs.statSync(source);
      fs.chmodSync(destination, stats.mode);
      fs.utimesSync(destination, stats.atime, stats.mtime);
    },

    /**
     * Add Cordova Platforms to Apache Cordova Project.
     */
    addPlatforms: function () {
      projectBuilder.addPlatforms(this.projectOptions.platforms, this.async());
    },

    /**
     * Prompting adding plugins.
     */
    promptingAddPlugins: function () {
      var done = this.async();

      var prompt = function (plugins) {
        var prompts = [
          _.extend(promptConfig.getPlugins(plugins), {
            name: 'plugins',
            message: 'Are you sure you want to add any plugins?'
          })
        ];

        this.prompt(prompts, function (props) {
          this.projectOptions.plugins = props.plugins;

          done();
        }.bind(this));
      }.bind(this);

      projectBuilder.searchOfficialPlugins(prompt);
    },

    /**
     * Add plugins.
     */
    addPlugins: function () {
      projectBuilder.addPlugins(this.projectOptions.plugins, this.async());
    },

    /**
     * Get version.
     */
    getVersion: function () {
      var done = this.async();

      cordova.getVersion(function (version) {
        this.projectOptions.version = version;

        done();
      }.bind(this));
    },

    /**
     * Run generator-webapp.
     */
    createWebappProject: function () {
      // Delegate options to generator-webapp.
      var options = this.optionBuilder.getDelegatedValues();

      var createReplaceFiles = function (generator) {
        var files = new ProjectFiles(generator);

        return function () {
          files.loadPackageJson()
            .appendToDevDependencies('cordova', this.projectOptions.version)
            .appendToDevDependencies('grunt-cordova-ng', '^0.2.0')
            .commit();

          files.loadGruntfileJs()
            .changeDistDirectory('cordova/www')
            .appendLoadNpmTasks('grunt-cordova-ng')
            .appendCordovaRoot('./cordova')
            .appendConnectRoot('./fake')
            .renameTask('build', 'buildweb')
            .appendTask('cordova-build', ['cordova:package'])
            .appendTask('cordova-emulate', ['cordova:emulate'])
            .appendTask('cordova-run', ['cordova:run'])
            .appendTask('cordova-compile', ['cordova:compile'])
            .appendTask('cordova-prepare', ['cordova:prepare'])
            .appendTask('build', ['buildweb', 'cordova-build'])
            .appendTask('emulate', ['buildweb', 'cordova-emulate'])
            .appendTask('run', ['buildweb', 'cordova-run'])
            .appendTask('compile', ['buildweb', 'cordova-compile'])
            .appendTask('prepare', ['buildweb', 'cordova-prepare'])
            .commit();

          files.loadIndexHtml()
            .appendScript('cordova.js')
            .setMetas(cordova.getMetasFromIndexHtml()) // Copy meta informations.
            .commit();

          files.loadMainJs()
            .appendToLast('$(document).on(\'deviceready\', function () {\n' +
                          '  \'use strict\';\n' +
                          '\n' +
                          '  console.log(\'deviceready\');\n' +
                          '});')
            .commit();

          files.loadGitIgnore()
            .replace(/^node_modules/, '/node_modules')
            .commit();
        };
      };

      var subGenerator = this.composeWith('webapp', {options: options});
      subGenerator.on('end', createReplaceFiles(subGenerator).bind(this));
    }
  },

  writing: function () {
    this.src.copy('_gitignore-cordova-external', 'cordova/.gitignore');
    this.src.copy('cordova.js', 'fake/cordova.js');
    this.src.copy('android_config', 'resources/android/config');
    this.src.copy('ios_config', 'resources/ios/config');
    this.dest.write('cordova/www/.gitkeep', '');
  }
});

module.exports = GraybulletCordovaGenerator;
