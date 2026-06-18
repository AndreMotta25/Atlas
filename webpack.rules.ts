import type { ModuleOptions } from 'webpack';

const isDev = process.env.NODE_ENV !== 'production';
// react-refresh-typescript transformer is a no-op for non-React files,
// so it's safe to apply to the shared ts-loader rule (also used by main process).
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
];
