const path = require('path');
const WebpackUserscript = require('webpack-userscript');

var config = {
  entry: './src/index.ts',
  externals: {
    he: 'he',
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
    filename: 'lastfm-bulk-edit.user.js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new WebpackUserscript({
      headers: {
        name: 'Last.fm Bulk Edit',
        match: 'https://www.last.fm/*',
        license: 'AGPL-3.0-or-later',
        icon: 'https://github.com/RudeySH/lastfm-bulk-edit/raw/main/img/icon.png',
        namespace: 'https://github.com/RudeySH/lastfm-bulk-edit',
        require: [
          'https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js',
        ],
      },
      downloadBaseUrl: 'https://github.com/RudeySH/lastfm-bulk-edit/raw/main/dist/',
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.devtool = 'inline-source-map';
    config.output.path = path.resolve(__dirname, 'dist', 'development');
    config.watch = true;
  }

  return config;
};
