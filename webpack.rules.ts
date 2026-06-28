import type { ModuleOptions } from 'webpack';

// Only enable React Refresh when explicitly in development.
// `electron-forge package`/`make` do NOT set NODE_ENV, so checking
// `!== 'production'` would wrongly treat the packaged build as dev and
// inject $RefreshSig$ calls without the matching runtime -> ReferenceError.
const isDev = process.env.NODE_ENV === 'development';
const reactRefreshTransformer = isDev
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('react-refresh-typescript').default()
  : undefined;

export const rules: Required<ModuleOptions>['rules'] = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
        ...(reactRefreshTransformer && {
          getCustomTransformers: () => ({ before: [reactRefreshTransformer] }),
        }),
      },
    },
  },
  {
    test: /\.(png|jpg|jpeg|gif|webp|ico)$/,
    type: 'asset/resource',
    generator: {
      filename: 'assets/[name].[contenthash:8][ext]',
    },
  },
];
