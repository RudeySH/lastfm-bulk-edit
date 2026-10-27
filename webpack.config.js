const path = require('path');
const { Compilation, sources } = require('webpack');
const { UserscriptPlugin } = require('webpack-userscript');

// installs of v1 know the script as "Last.fm Bulk Edit" and check the old file names for updates,
// userscript managers identify scripts by @name and @namespace and may refuse updates that change them,
// so keep publishing copies under the old file names, with the old @name and @namespace,
// and with @updateURL and @downloadURL pointing to those copies
class LegacyFileNamesPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('LegacyFileNamesPlugin', (compilation) => {
      compilation.hooks.processAssets.tap({
        name: 'LegacyFileNamesPlugin',
        stage: Compilation.PROCESS_ASSETS_STAGE_REPORT, // after UserscriptPlugin emits the userscript files
      }, () => {
        for (const extension of ['user.js', 'meta.js']) {
          const asset = compilation.getAsset(`lastfm-advanced.${extension}`);

          if (asset) {
            const source = asset.source.source().toString()
              .replace(/^\/\/ @name .*$/m, '// @name Last.fm Bulk Edit')
              .replace(/^\/\/ @namespace .*$/m, '// @namespace https://github.com/RudeySH/lastfm-bulk-edit')
              .replace(/^\/\/ @description .*$/m, '// @description Outdated installation! Uninstall this script and reinstall it from https://github.com/RudeySH/lastfm-advanced')
              .replace(/^(\/\/ @(?:downloadURL|updateURL) .*\/)lastfm-advanced\.(user|meta)\.js$/gm, '$1lastfm-bulk-edit.$2.js');

            compilation.emitAsset(`lastfm-bulk-edit.${extension}`, new sources.RawSource(source));
          }
        }
      });
    });
  }
}

var config = {
  entry: './src/index.ts',
  externals: {
    'he': 'he',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  mode: 'production',
  optimization: {
    minimize: false,
  },
  output: {
    filename: 'lastfm-advanced.js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new UserscriptPlugin({
      headers: {
        name: 'Last.fm Advanced (Bulk Edit)',
        match: 'https://www.last.fm/*',
        grant: 'none',
        icon: 'https://raw.githubusercontent.com/RudeySH/lastfm-advanced/HEAD/img/icon.png',
        license: 'AGPL-3.0-or-later',
        namespace: 'https://github.com/RudeySH/lastfm-advanced',
        require: [
          'https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js',
        ],
      },
      downloadBaseURL: 'https://raw.githubusercontent.com/RudeySH/lastfm-advanced/HEAD/dist/',
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.devtool = 'inline-source-map';
    config.output.path = path.resolve(__dirname, 'dist', 'development');
    config.watch = true;
  } else {
    config.plugins.push(new LegacyFileNamesPlugin());
  }

  return config;
};
