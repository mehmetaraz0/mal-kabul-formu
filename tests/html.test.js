import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/lib/html.js';

describe('escapeHtml', () => {
  it('tehlikeli HTML karakterlerini escape eder', () => {
    const result = escapeHtml('<img src=x onerror=alert(1)>');
    expect(result).not.toContain('<img');
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('düz metni değiştirmeden döner', () => {
    expect(escapeHtml('Ahmet Yılmaz')).toBe('Ahmet Yılmaz');
  });

  it('çift ve tek tırnak karakterlerini escape eder (attribute context için)', () => {
    const result = escapeHtml('He said "hi" and \'bye\'');
    expect(result).not.toContain('"');
    expect(result).not.toContain("'");
    expect(result).toContain('&quot;');
    expect(result).toContain('&#39;');
  });
});
