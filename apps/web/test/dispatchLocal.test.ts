// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoreProvider, useStore, type DispatchOutcome } from '../src/store';

// No VITE_API_URL → local mode: dispatch applies the reducer and resolves ok:true.
describe('dispatch outcome — local mode', () => {
  it('resolves { ok: true } after the reducer applies', async () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    let outcome: DispatchOutcome | undefined;
    await act(async () => {
      outcome = await result.current.dispatch({ type: 'RESET' });
    });
    expect(outcome).toEqual({ ok: true });
  });
});
