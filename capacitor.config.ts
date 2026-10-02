import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.vmunoz.thelister',
  appName: 'The Lister',
  webDir: 'dist/the-lister-ionic/browser',
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover'
    }
  }
};

export default config;
