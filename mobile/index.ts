import { registerRootComponent } from 'expo';
import { Buffer } from 'buffer';

if (!(globalThis as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

import App from './App';

registerRootComponent(App);

