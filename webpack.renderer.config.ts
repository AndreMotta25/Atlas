import type { Configuration } from 'webpack';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

const isDev = process.env.NODE_ENV !== 'production';

export const rendererConfig: Configuration = {
  devtool: 'inline-source-map',
  module: {
    rules: [
      ...rules,
      {
        test: /\.css$/,
        use: [
          { loader: 'style-loader' },
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                config: __dirname + '/postcss.config.mjs',
              },
            },
          },
        ],
      },
    ],
  },
  // Clone shared plugins and add ReactRefreshWebpackPlugin in dev only.
  // Never add it to the main process config — it would break the Node-targeted build.
  plugins: isDev ? [...plugins, new ReactRefreshWebpackPlugin()] : plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
