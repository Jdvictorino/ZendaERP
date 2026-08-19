// Setup file for tests: adds jest-dom matchers and any global mocks
import '@testing-library/jest-dom';

// Optional: provide simple mocks for browser APIs used in components
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
}
