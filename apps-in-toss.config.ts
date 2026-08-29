import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'reunion',
  brand: {
    primaryColor: '#C2694A',
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: false,
    theme: 'light',
  },
  webBundleDir: 'dist',
});
