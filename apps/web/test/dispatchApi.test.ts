// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Force API mode BEFORE store/config are first evaluated (dynamic import below).
vi.stubEnv('VITE_API_URL', 'http://localhost:3000');

afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe('dispatch outcome — API mode failure path', () => {
  it('resolves { ok: false, error } after the resync and calls the registered fail handler', async () => {
    // Every request 500s: the ratify call fails, then the tender resync also fails (swallowed).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'server refused' }), { status: 500 })));

    const { StoreProvider, useStore, useRegisterDispatchFail } = await import('../src/store');
    const fail = vi.fn();
    const { result } = renderHook(
      () => {
        useRegisterDispatchFail(fail);
        return useStore();
      },
      { wrapper: StoreProvider },
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.dispatch({
        type: 'RATIFY',
        tenderId: 't1',
        by: { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' },
      });
    });

    expect(outcome).toEqual({ ok: false, error: 'server refused' });
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledWith('server refused', 'RATIFY');
  });
});
