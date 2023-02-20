const webpack = require('webpack')
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin')

// Phaser webpack config
// const phaserModule = path.join(__dirname, '/node_modules/phaser/')
// const phaser = path.join(phaserModule, 'src/phaser.js')


module.exports = {
  // entry: {
  //   app: [
  //     path.resolve(__dirname, './src/game.ts')
  //   ],
  //   vendor: ['phaser']
  // },
  entry: './src/game.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // alias: {
    //   'phaser': phaser,
    // }
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: './src/index.html',
      // chunks: ['vendor', 'app'],
      chunksSortMode: 'manual',
      minify: {
        removeAttributeQuotes: false,
        collapseWhitespace: false,
        html5: false,
        minifyCSS: false,
        minifyJS: false,
        minifyURLs: false,
        removeComments: false,
        removeEmptyAttributes: false
      },
      hash: false
    }),
  ],
  optimization: {
    splitChunks: {
      name: 'vendor'/* chunkName= */, filename: 'vendor.bundle.js'/* filename= */
    }
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, 'src'),
        loader: 'ts-loader'
      },
      {
        test: [/\.vert$/, /\.frag$/],
        use: 'raw-loader'
      },
      {
        test: require.resolve('Phaser'),
        loader: 'expose-loader',
        options: { exposes: { globalName: 'Phaser', override: true } }
      },
      {
        test: /\.(jpe?g|png|gif|svg)$/i,
        type: "asset/resource",
        generator: {
          filename: 'assets/images/[name]-[hash][ext][query]'
        },
      },
      {
        test: /\.html$/,
        exclude: /node_modules/,
        loader: 'html-loader',
        options: {minimize: false, sources: false}
      },
    ]
  },
  devtool: 'cheap-source-map',
  devServer: {
    // static: path.resolve(__dirname, './'),
    // host: 'localhost',
    // port: 3000,
    open: true
  },
};
