// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { TOAST_CAP, queueReducer, type ToastItem } from '../src/Toasts';

const mk = (id: number, kind: ToastItem['kind'] = 'success'): ToastItem => ({ id, msg: `m${id}`, kind });

describe('queueReducer', () => {
  it('pushes in arrival order while under the cap', () => {
    let q: ToastItem[] = [];
    q = queueReducer(q, { type: 'push', toast: mk(1) });
    q = queueReducer(q, { type: 'push', toast: mk(2) });
    expect(q.map((t) => t.id)).toEqual([1, 2]);
  });

  it('caps at 3 visible and drops the oldest (FIFO) on push-over-cap', () => {
    let q: ToastItem[] = [];
    for (let i = 1; i <= 5; i++) q = queueReducer(q, { type: 'push', toast: mk(i) });
    expect(q).toHaveLength(TOAST_CAP);
    expect(q.map((t) => t.id)).toEqual([3, 4, 5]); // 1 then 2 evicted, oldest-first
  });

  it('dismiss removes the targeted toast and preserves order', () => {
    let q = [mk(1), mk(2), mk(3)];
    q = queueReducer(q, { type: 'dismiss', id: 2 });
    expect(q.map((t) => t.id)).toEqual([1, 3]);
  });

  it('expire removes the targeted toast (oldest expiring first)', () => {
    let q = [mk(1), mk(2), mk(3)];
    q = queueReducer(q, { type: 'expire', id: 1 });
    expect(q.map((t) => t.id)).toEqual([2, 3]);
  });

  it('is a no-op for an unknown id on dismiss and expire', () => {
    const q = [mk(1)];
    expect(queueReducer(q, { type: 'dismiss', id: 99 })).toEqual(q);
    expect(queueReducer(q, { type: 'expire', id: 99 })).toEqual(q);
  });

  it('carries kind and desc through a push', () => {
    const q = queueReducer([], { type: 'push', toast: { id: 7, msg: 'done', kind: 'error', desc: 'boom' } });
    expect(q[0]).toEqual({ id: 7, msg: 'done', kind: 'error', desc: 'boom' });
  });
});
