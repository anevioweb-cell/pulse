// Demo Mode worker: a thin wrapper that connects the worker global to the simulator host.
import { createSimulatorHost } from './simulator-host';

const host = createSimulatorHost({
  post: (event) => {
    self.postMessage(event);
  },
  now: () => Date.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => {
    clearInterval(handle);
  },
});

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  host.handle(event.data);
});
