---
name: electron-react-tailwind-setup
description: >
  Use esta skill para configurar React, TailwindCSS v3 e PostCSS em um projeto Electron Forge com
  template webpack-typescript. Cobre instalação de dependências, ajustes no tsconfig.json (jsx),
  atualização do forge.config.ts para apontar ao renderer.tsx, inicialização e configuração do
  tailwind.config.js e postcss.config.js, e adição do postcss-loader ao webpack.renderer.config.ts
  na ordem correta de loaders. Acione quando o usuário mencionar erro de JSX, Tailwind não aplicando
  estilos, postcss-loader, forge.config, ou ao iniciar um projeto Electron do zero com React.
compatibility: "Electron Forge + webpack-typescript template"
license: Proprietary
---

# Electron React + Tailwind Setup

> Siga **todos** os passos abaixo em ordem. Pular qualquer um causa falhas silenciosas de build.

---

## 1. Instalar React

```bash
npm install react react-dom
npm install -D @types/react @types/react-dom
```

---

## 2. Atualizar `tsconfig.json`

Adicionar `"jsx": "react-jsx"` em `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES6",
    "allowJs": true,
    "module": "commonjs",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noImplicitAny": true,
    "sourceMap": true,
    "baseUrl": ".",
    "outDir": "dist",
    "jsx": "react-jsx",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "paths": {
      "*": ["node_modules/*"]
    }
  },
  "include": ["src/**/*"]
}
```

---

## 3. Atualizar `forge.config.ts`

O `js` do `entryPoints` deve apontar para o arquivo que exporta o componente React (normalmente `renderer.tsx`):

```typescript
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

const config: ForgeConfig = {
  packagerConfig: { asar: true },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/index.html",
            js: "./src/renderer.tsx", // ← aponta para o arquivo React
            name: "main_window",
            preload: {
              js: "./src/preload.ts",
            },
          },
        ],
      },
    }),
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
```

---

## 4. Instalar TailwindCSS v3

```bash
npm install -D tailwindcss@3 postcss autoprefixer
```

> **Use a v3** — não a v4. A v4 tem integração diferente com PostCSS e não funciona diretamente com este setup.

---

## 5. Inicializar e configurar Tailwind

```bash
npx tailwindcss init
```

Editar o `tailwind.config.js` gerado:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Criar `postcss.config.js` na raiz:

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Adicionar as diretivas ao CSS principal (`src/index.css`):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 6. Instalar `postcss-loader`

```bash
npm install --save-dev postcss-loader
```

---

## 7. Atualizar `webpack.renderer.config.ts`

Adicionar `postcss-loader` à regra de CSS. **A ordem dos loaders importa** — são processados de baixo para cima:

```typescript
// ANTES (incorreto — Tailwind não é processado)
rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
});

// DEPOIS (correto)
rules.push({
  test: /\.css$/,
  use: [
    { loader: "style-loader" }, // 3. injeta CSS no DOM
    { loader: "css-loader", options: { importLoaders: 1 } }, // 2. resolve @import e url()
    { loader: "postcss-loader" }, // 1. converte @tailwind → CSS
  ],
});
```

---

## Verificação

Após todos os passos, execute:

```bash
npm start
```

Se o Tailwind não aplicar estilos, verificar:

1. `postcss.config.js` existe na raiz do projeto (mesmo nível do `package.json`)
2. `tailwind.config.js` tem o `content` apontando para `./src/**/*.{js,ts,jsx,tsx}`
3. `src/index.css` tem as três diretivas `@tailwind`
4. O `index.css` é importado em `renderer.tsx`: `import './index.css'`
5. A ordem dos loaders no Webpack está correta (postcss-loader por último na lista)
