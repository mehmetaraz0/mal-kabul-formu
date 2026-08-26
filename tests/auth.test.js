import { describe, it, expect } from 'vitest';
import { hasRole } from '../src/lib/role.js';

describe('hasRole', () => {
  it('profil rolü eşleşince true döner', () => {
    expect(hasRole({ role: 'kalite_ekibi' }, 'kalite_ekibi')).toBe(true);
  });

  it('profil rolü eşleşmeyince false döner', () => {
    expect(hasRole({ role: 'depo_yonetici' }, 'kalite_ekibi')).toBe(false);
  });

  it('profil null ise false döner', () => {
    expect(hasRole(null, 'kalite_ekibi')).toBe(false);
  });
});
