import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Auto-unmount between tests so the DOM (happy-dom) does not leak across cases. The jest-dom matchers are
// registered for the whole suite here.
afterEach(() => {
  cleanup();
});
