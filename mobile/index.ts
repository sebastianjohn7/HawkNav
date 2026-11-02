import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
// EXPO_PUBLIC_PANORAMA_DEMO=1 opens the standalone 360 viewer instead of the app.
registerRootComponent(
  process.env.EXPO_PUBLIC_PANORAMA_DEMO === '1'
    ? require('./screens/PanoramaDemo').default
    : App
);
