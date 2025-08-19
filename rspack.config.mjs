import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rspack } from '@rspack/core';
import { RunScriptWebpackPlugin } from 'run-script-webpack-plugin';

import pkgJson from './package.json' with { type: 'json' };

const isProd = process.env.NODE_ENV === 'production';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const LAZY_IMPORTS = ['zlib-sync', 'bufferutil', 'utf-8-validate'];

/**
 * @type {import('@rspack/core').Configuration}
 */
export default {
  context: __dirname,
  target: 'node',
  entry: {
    main: [
      !isProd && '@rspack/core/hot/poll?100', // Hot reload support
      './src/main.ts',
    ].filter(Boolean),
  },
  output: {
    clean: true,
  },
  devtool: false,
  resolve: {
    extensions: ['...', '.ts', '.tsx', '.jsx'],
    tsConfig: path.resolve(__dirname, 'tsconfig.json'),
  },
  ignoreWarnings: [/Critical dependency/],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                decorators: true,
              },
              transform: {
                legacyDecorator: true,
                decoratorMetadata: true,
              },
            },
          },
        },
      },
      {
        test: /\.node$/,
        use: [
          {
            loader: 'node-loader',
            options: {
              name: '[path][name].[ext]',
            },
          },
        ],
      },
    ],
  },
  optimization: {
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin({
        minimizerOptions: {
          compress: {
            keep_classnames: true,
            keep_fnames: true,
          },
          mangle: {
            keep_classnames: true,
            keep_fnames: true,
          },
        },
      }),
    ],
  },
  externalsType: 'commonjs',
  plugins: [
    !isProd &&
      new RunScriptWebpackPlugin({
        name: 'main.js',
        autoRestart: false,
      }),
    new rspack.DefinePlugin({
      __APP_VERSION__: JSON.stringify(pkgJson.version),
    }),
  ].filter(Boolean),
  devServer: {
    devMiddleware: {
      writeToDisk: true,
    },
    // Some random ipv6 port to avoid conflicts
    // Not used and should be disabled
    host: '::1',
    port: '9675',
  },
  externals: [
    function (obj, callback) {
      const resource = obj.request;
      if (!LAZY_IMPORTS.includes(resource)) {
        return callback();
      }
      try {
        require.resolve(resource);
      } catch {
        callback(null, resource);
      }
      callback();
    },
  ],
};
