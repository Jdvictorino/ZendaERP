import { describe, it, expect } from 'vitest';
import { terminalUrl } from '../src/api/client.js';

describe('terminalUrl', () => {
  it('relativo usa el origen de la página', () => {
    expect(terminalUrl('a b', '/api')).toBe(`${window.location.origin.replace(/^http/, 'ws')}/api/admin/console/terminal?ticket=a%20b`);
  });
  it('http -> ws y https -> wss', () => {
    expect(terminalUrl('t', 'http://h:3000/api')).toBe('ws://h:3000/api/admin/console/terminal?ticket=t');
    expect(terminalUrl('t+/=', 'https://h.com/api')).toBe('wss://h.com/api/admin/console/terminal?ticket=t%2B%2F%3D');
  });
});
