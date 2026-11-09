import { DirectionProvider } from '@radix-ui/react-direction';

import { Toaster } from '../src/shared/ui';
import './preview.css';

import type { Decorator, Preview } from '@storybook/react-vite';

type Theme = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Locale = 'en' | 'ar';

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';
const isDirection = (value: unknown): value is Direction => value === 'ltr' || value === 'rtl';
const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'ar';

/**
 * Applies the toolbar globals the same way the app does: `data-theme`, `dir` and `lang` on <html>.
 * `lang="ar"` switches the font stack to Arabic-first (see tokens.css). Radix needs the direction
 * through its DirectionProvider for RTL keyboard navigation (arrow keys in Tabs, Select).
 */
const withAppEnvironment: Decorator = (Story, context) => {
  const theme = isTheme(context.globals.theme) ? context.globals.theme : 'light';
  const dir = isDirection(context.globals.dir) ? context.globals.dir : 'ltr';
  const locale = isLocale(context.globals.locale) ? context.globals.locale : 'en';

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('dir', dir);
  root.setAttribute('lang', locale);

  return (
    <DirectionProvider dir={dir}>
      <Story />
      <Toaster />
    </DirectionProvider>
  );
};

const preview: Preview = {
  decorators: [withAppEnvironment],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    dir: {
      description: 'Text direction',
      toolbar: {
        title: 'Direction',
        icon: 'transfer',
        items: [
          { value: 'ltr', title: 'Left to right' },
          { value: 'rtl', title: 'Right to left' },
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'Locale (font stack)',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        items: [
          { value: 'en', title: 'English (Latin font stack)' },
          { value: 'ar', title: 'العربية (Arabic font stack)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    dir: 'ltr',
    locale: 'en',
  },
  parameters: {
    layout: 'centered',
    backgrounds: { disabled: true },
    controls: {
      expanded: true,
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: {
      // Fail story tests on violations (used by the a11y addon's test integration).
      test: 'error',
    },
  },
  tags: ['autodocs'],
};

export default preview;
