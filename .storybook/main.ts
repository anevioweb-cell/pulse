import type { StorybookConfig } from '@storybook/react-vite';

// The Vite builder loads the project's vite.config.ts (React plugin, Tailwind v4 plugin, aliases),
// so stories get exactly the app's CSS pipeline. Storybook builds to storybook-static/ and is never
// part of the app bundle (stories are not imported from the app entry).
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
};

export default config;
