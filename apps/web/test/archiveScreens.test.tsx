// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { reducer, seedState, type Actor, type State } from '../src/store';
import { saveSession } from '../src/session';

/**
 * The ق7 archive model where the user meets it. The predicates and the reducer are pinned in
 * archive.test.ts; what is unpinned until here is whether the SCREENS honour them — a gate that
 * greys out without naming its reason, a registry that hides rows it promised to show, or a
 * «محلي» flag missing from an action no endpoint enforces, all typecheck cleanly.
 */

const KEY = 'masaar-operator-v13';
const SUPER: Actor = { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' };
const REASON = 'انتهى عقد خدمة الحقل ولم تعد الشركة تشغّله — سحب موثّق بكتاب 2026/311';

/** Seed the browser with a state the screens will load, then mount the real app at a hash. */
function at(hash: string, state: State = seedState()) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}
const read = (): State => JSON.parse(localStorage.getItem(KEY)!) as State;

const archivedField = () =>
  reducer(seedState(), { type: 'ARCHIVE_FIELD', fieldId: 'f-qarnayn', reason: REASON, by: SUPER });
const archivedVendor = () =>
  reducer(seedState(), { type: 'ARCHIVE_VENDOR', vendorId: 'v2', reason: REASON, by: SUPER });

beforeEach(() => {
  localStorage.clear();
  saveSession({ name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN', oid: 'oid-super-01' });
});
afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

describe('#/admin/fields — the archive gate names its reason instead of greying out', () => {
  it('disables «أرشفة» on a field with an in-flight tender and says how many', () => {
    at('#/admin/fields');
    const row = screen.getByText('AHDAB').closest('tr') as HTMLElement; // carries t1, mid-evaluation
    const btn = within(row).getByRole('button', { name: 'أرشفة' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('لا يمكن أرشفة حقل عليه 1 مناقصة جارية'); // Latin digits, named count
  });

  it('opens the dialog on an idle field and refuses to commit until the reason reaches 20 chars', () => {
    at('#/admin/fields');
    const row = screen.getByText('QARNAYN').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'أرشفة' }));

    const dialog = within(screen.getByRole('dialog'));
    const confirm = dialog.getByRole('button', { name: 'نعم، أُرشف الحقل' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(dialog.getByText('المسوّغ يتطلب 20 حرفًا فأكثر')).toBeTruthy();
    // the confirm is phrased as the EVENT, and the escape hatch as «تراجع»
    expect(dialog.getByRole('button', { name: 'تراجع' })).toBeTruthy();

    fireEvent.change(dialog.getByRole('textbox'), { target: { value: REASON } });
    expect(confirm.disabled).toBe(false);
  });

  it('archives through the dialog and the row leaves the default «العاملة» view', async () => {
    at('#/admin/fields');
    const row = screen.getByText('QARNAYN').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'أرشفة' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox'), { target: { value: REASON } });
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'نعم، أُرشف الحقل' }));
    });

    expect(read().fields.find((f) => f.id === 'f-qarnayn')!.archived).toBe(true);
    expect(screen.queryByText('QARNAYN')).toBeNull();          // gone from the live view
    expect(screen.getByText('AHDAB')).toBeTruthy();            // the rest of the registry stands
  });

  it('shows the archived field under its own chip, muted, with a restore action', () => {
    at('#/admin/fields', archivedField());
    expect(screen.queryByText('QARNAYN')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /المؤرشفة/ }));

    const row = screen.getByText('QARNAYN').closest('tr') as HTMLElement;
    expect(row.className).toContain('arch-row');              // withdrawn, still legible
    expect(within(row).getByText('مؤرشف')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'استعادة' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'أرشفة' })).toBeNull();
  });

  it('restores from that chip, and the field returns to the live view', async () => {
    at('#/admin/fields', archivedField());
    fireEvent.click(screen.getByRole('button', { name: /المؤرشفة/ }));
    const row = screen.getByText('QARNAYN').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'استعادة' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'أُعيد تشغيل الحقل بموجب ملحق عقد الخدمة الجديد 2026/402' } });
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'نعم، أُعيد الحقل' }));
    });
    expect(read().fields.find((f) => f.id === 'f-qarnayn')!.archived).toBeUndefined();
  });

  /**
   * WYSIWYG export: the file holds the rows on screen, so its default NAME has to carry the one
   * filter a reader cannot infer from the rows — an all-live export and an all-archived export
   * both look like «the registry».
   */
  it('names the CSV for the archive scope it actually exported', () => {
    const names: string[] = [];
    const origUrl = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) { names.push(this.download); };
    try {
      at('#/admin/fields', archivedField());
      fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' }));
      fireEvent.click(screen.getByRole('button', { name: /المؤرشفة/ }));
      fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' }));
      fireEvent.click(screen.getByRole('button', { name: /^الكل/ }));
      fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' }));
    } finally {
      URL.createObjectURL = origUrl;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
    expect(names).toEqual(['masaar-fields-live.csv', 'masaar-fields-archived.csv', 'masaar-fields-all.csv']);
  });

  it('renames a field through the later-edit path without touching its code (request 9)', async () => {
    at('#/admin/fields');
    const row = screen.getByText('QARNAYN').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'تعديل الاسم' }));

    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('اسم الحقل'), { target: { value: 'حقل القرنين النفطي' } });
    fireEvent.change(dialog.getByLabelText('المسوّغ'), { target: { value: 'تصحيح التسمية بحسب كتاب دائرة العقود 2026/77' } });
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'ثبّت الاسم الجديد' }));
    });

    const f = read().fields.find((x) => x.id === 'f-qarnayn')!;
    expect(f.name).toBe('حقل القرنين النفطي');
    expect(f.code).toBe('QARNAYN');          // the code is quoted elsewhere — never renamed
    expect(f.operatorId).toBe('op-qarnayn'); // the owning company is fixed by the contract
  });
});

describe('#/admin/entities — the registry shows EVERY entity (request 14)', () => {
  it('lists an archived entity by default, muted and labelled', () => {
    at('#/admin/entities', archivedVendor());
    const row = screen.getByText('Basra Energy Services').closest('tr') as HTMLElement;
    expect(row.className).toContain('arch-row');
    expect(within(row).getByText('مؤرشفة')).toBeTruthy();
    // the per-row action the client asked for, and it is a real link to the file
    expect(within(row).getByRole('link', { name: 'تعديل' }).getAttribute('href')).toBe('#/admin/entities/v2');
  });

  it('offers the archived chip alongside the governance ones, counted', () => {
    at('#/admin/entities', archivedVendor());
    const chip = screen.getByRole('button', { name: /المؤرشفة/ });
    expect(within(chip).getByText('1')).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.getByText('Basra Energy Services')).toBeTruthy();
    expect(screen.queryByText('شركة الحفر العراقية')).toBeNull();
  });

  it('registers a new entity from the header, reason-guarded, and it lands in the registry', async () => {
    at('#/admin/entities');
    fireEvent.click(screen.getByRole('button', { name: 'إضافة جهة' }));

    const dialog = within(screen.getByRole('dialog'));
    const confirm = dialog.getByRole('button', { name: 'سجّل الجهة' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(dialog.getByLabelText('المورّد'), { target: { value: 'شركة الرافدين للخدمات' } });
    fireEvent.change(dialog.getByLabelText('المسوّغ'), { target: { value: 'تسجيل جهة جديدة بناءً على طلب التأهيل وكتاب الموافقة 2026/91' } });
    expect(confirm.disabled).toBe(false);

    await act(async () => { fireEvent.click(confirm); });
    const v = read().vendors.at(-1)!;
    expect(v).toMatchObject({ name: 'شركة الرافدين للخدمات', techScore: 0, financialScore: 0, hseScore: 0 });
    expect(v.isStateCompany).toBeUndefined(); // Article 25 companies are seeded law, not data entry
  });

  it('refuses a name the registry already holds and says why', () => {
    at('#/admin/entities');
    fireEvent.click(screen.getByRole('button', { name: 'إضافة جهة' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('المورّد'), { target: { value: 'شركة الحفر العراقية' } });
    expect(dialog.getByText(/توجد جهة مسجّلة بالاسم نفسه/)).toBeTruthy();
    expect((dialog.getByRole('button', { name: 'سجّل الجهة' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('#/admin/entities/:id — the file states the withdrawal and keeps the record', () => {
  it('banners an archived entity and offers restore instead of archive', () => {
    at('#/admin/entities/v2', archivedVendor());
    expect(screen.getByText(/جهة مؤرشفة — سجلّها محفوظ/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'استعادة' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'أرشفة' })).toBeNull();
    // the whole point of archiving rather than deleting: the trail is still on the page
    expect(screen.getByText('أرشفة')).toBeTruthy(); // the event row on the governance trail
  });

  /**
   * ق7 archive/restore is a registry act. It is gated on SUPER_ADMIN exactly like the field
   * archive, and gated the honest way: DISABLED WITH ITS REASON, never hidden — a capability a
   * reader cannot see is a capability they cannot ask for.
   */
  it('offers archive to a non-super admin as a disabled button that says why', () => {
    saveSession({ name: 'مدقّق', role: 'AUDITOR', oid: 'oid-aud-01' });
    at('#/admin/entities/v1');
    const btn = screen.getByRole('button', { name: 'أرشفة' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('إدارة الحسابات محصورة بدور «مشرف رئيسي».');
  });

  it('offers restore to a non-super admin the same way — visible, disabled, explained', () => {
    saveSession({ name: 'مدقّق', role: 'AUDITOR', oid: 'oid-aud-01' });
    at('#/admin/entities/v2', archivedVendor());
    const btn = screen.getByRole('button', { name: 'استعادة' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('إدارة الحسابات محصورة بدور «مشرف رئيسي».');
  });

  it('archives an entity that HAS history — the field rule does not apply to entities', async () => {
    at('#/admin/entities/v1'); // v1 bid on t1 and holds contract c1
    fireEvent.click(screen.getByRole('button', { name: 'أرشفة' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'توقّفت الشركة عن النشاط في العراق — قرار 2026/58' } });
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'نعم، أُرشفت الجهة' }));
    });

    const s = read();
    expect(s.vendors.find((v) => v.id === 'v1')!.archived).toBe(true);
    expect(s.contracts.filter((c) => c.vendorId === 'v1')).toHaveLength(1); // history untouched
  });
});
