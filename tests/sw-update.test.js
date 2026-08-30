import { describe, it, expect, vi } from 'vitest';
import { startUpdateChecks, UPDATE_CHECK_INTERVAL_MS } from '../src/lib/sw-update.js';

function fakeRegistration(updateImpl = () => Promise.resolve()) {
  return { update: vi.fn(updateImpl) };
}

describe('startUpdateChecks', () => {
  it('varsayılan aralık makul bir aralıkta (1 dk - 1 saat)', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBeLessThanOrEqual(60 * 60_000);
  });

  it('registration yoksa hiçbir zamanlayıcı kurmaz', () => {
    const schedule = vi.fn();
    expect(startUpdateChecks(undefined, { schedule })).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('update metodu olmayan registration için zamanlayıcı kurmaz', () => {
    const schedule = vi.fn();
    expect(startUpdateChecks({}, { schedule })).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('verilen aralıkla zamanlayıcı kurar', () => {
    const schedule = vi.fn(() => 'timer-id');
    const id = startUpdateChecks(fakeRegistration(), { schedule, intervalMs: 1234 });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][1]).toBe(1234);
    expect(id).toBe('timer-id');
  });

  it('çevrimiçiyken registration.update çağrılır', () => {
    const registration = fakeRegistration();
    let tick;
    startUpdateChecks(registration, { schedule: (fn) => { tick = fn; }, isOnline: () => true });
    tick();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('çevrimdışıyken registration.update çağrılmaz', () => {
    const registration = fakeRegistration();
    let tick;
    startUpdateChecks(registration, { schedule: (fn) => { tick = fn; }, isOnline: () => false });
    tick();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('update reddedilirse hata dışarı sızmaz (yakalanmamış promise reddi olmaz)', async () => {
    const registration = fakeRegistration(() => Promise.reject(new Error('ağ yok')));
    let tick;
    startUpdateChecks(registration, { schedule: (fn) => { tick = fn; }, isOnline: () => true });
    await expect(Promise.resolve(tick())).resolves.not.toThrow();
  });

  it('update senkron fırlatırsa da hata dışarı sızmaz', () => {
    const registration = fakeRegistration(() => { throw new Error('patladı'); });
    let tick;
    startUpdateChecks(registration, { schedule: (fn) => { tick = fn; }, isOnline: () => true });
    expect(() => tick()).not.toThrow();
  });
});
