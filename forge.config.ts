import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';

import { mainConfig } from './webpack.main.config';
import { preloadConfig } from './webpack.preload.config';
import { rendererConfig } from './webpack.renderer.config';

const ICON_PATH = path.resolve(__dirname, 'build', 'icon.ico');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: ICON_PATH,
    extraResources: [
      {
        from: 'build',
        to: 'build',
        filter: ['**/*.ico', '**/*.png'],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: ICON_PATH,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      // Override the dev server's default CSP (which doesn't include atlas-img:).
      // Must match the <meta> in src/index.html so dev and packaged behavior agree.
      devContentSecurityPolicy:
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:*; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com data:; " +
        "connect-src 'self' http://localhost:* ws://localhost:*; " +
        "img-src 'self' data: blob: atlas-img: https:; " +
        "object-src 'none'; base-uri 'none'; form-action 'none';",
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
              config: preloadConfig,
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
