import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for Node.js < 18
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
