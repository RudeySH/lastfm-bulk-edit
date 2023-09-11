const path = require('path');
const { UserscriptPlugin } = require('webpack-userscript');

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
    filename: 'lastfm-bulk-edit.js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new UserscriptPlugin({
      headers: {
        name: 'Last.fm Bulk Edit',
        match: 'https://www.last.fm/*',
        icon: 'https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/main/img/icon.png',
        license: 'AGPL-3.0-or-later',
        namespace: 'https://github.com/RudeySH/lastfm-bulk-edit',
        require: [
          'https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js',
        ],
      },
      downloadBaseURL: 'https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/main/dist/',
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
