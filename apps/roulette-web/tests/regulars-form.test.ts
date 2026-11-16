import { describe, expect, it } from 'vitest';
import { MAX_GUESTS } from '@tasuki/roulette-core';
import {
  REGULARS_ERROR_BAD_NAME,
  REGULARS_ERROR_NAME_EMPTY,
  REGULARS_ERROR_NO_MEMBERS,
  REGULARS_ERROR_TOO_MANY_MEMBERS,
} from '../src/copy';
import { INITIAL_FORM, countFieldOf, formReducer, validate } from '../src/regulars-form';

describe('validate（組の欄の検証）', () => {
  it('名前が空・空白だけ・見えない文字だけなら名前の欄のエラー', () => {
    expect(validate('', [], ['a'], '', true)).toEqual({ error: REGULARS_ERROR_NAME_EMPTY, field: 'name' });
    expect(validate('   ', [], ['a'], '', true)).toEqual({ error: REGULARS_ERROR_NAME_EMPTY, field: 'name' });
    expect(validate('​', [], ['a'], '', true)).toEqual({ error: REGULARS_ERROR_NAME_EMPTY, field: 'name' });
  });

  it('名前が長すぎるなら、保存が黙って落とす前にここで止める', () => {
    expect(validate('あ'.repeat(200), [], ['a'], '', true)).toEqual({ error: REGULARS_ERROR_BAD_NAME, field: 'name' });
  });

  it('読めない行が 1 つでもあれば入力欄のエラー', () => {
    expect(validate('組', [], [], '​', false)).toEqual({ error: REGULARS_ERROR_BAD_NAME, field: 'members' });
  });

  it('保存済み・チェック・手入力を合わせて 0 人なら、チェックの一覧があれば一覧の側へ寄せる', () => {
    expect(validate('組', [], [], '', true)).toEqual({ error: REGULARS_ERROR_NO_MEMBERS, field: 'people' });
    expect(validate('組', [], [], '', false)).toEqual({ error: REGULARS_ERROR_NO_MEMBERS, field: 'members' });
  });

  it('上限を超えたら人数のエラー。手入力が足していれば入力欄の側', () => {
    const many = Array.from({ length: MAX_GUESTS + 1 }, (_, i) => `n${i}`);
    expect(validate('組', [], many, '', true)).toEqual({ error: REGULARS_ERROR_TOO_MANY_MEMBERS, field: 'people' });
    expect(validate('組', [], many.slice(0, MAX_GUESTS), 'extra', true)).toEqual({
      error: REGULARS_ERROR_TOO_MANY_MEMBERS,
      field: 'members',
    });
  });

  it('通れば、残っている保存済みの人を元の綴りで先に、新しくチェック・手入力した人を後ろに返す', () => {
    expect(validate(' 組 ', ['S'], ['c', 's'], 'm', true)).toEqual({ members: ['S', 'c', 'm'] });
  });

  it('保存済みの人でも、チェックも手入力も外れていれば落とす', () => {
    expect(validate('組', ['s'], ['c'], '', true)).toEqual({ members: ['c'] });
  });
});

describe('countFieldOf', () => {
  it('一覧が無ければ常に入力欄', () => {
    expect(countFieldOf(false, ['a'], '')).toBe('members');
  });
  it('手入力が足していなければ一覧、足していれば入力欄', () => {
    expect(countFieldOf(true, ['a'], '')).toBe('people');
    expect(countFieldOf(true, ['a'], 'a')).toBe('people');
    expect(countFieldOf(true, ['a'], 'b')).toBe('members');
  });
});

describe('formReducer', () => {
  it('open は入力を差し替えてエラーを消す（エラーの印の欄は残す）', () => {
    const failed = formReducer(INITIAL_FORM, { type: 'fail', message: 'x', field: 'name' });
    const opened = formReducer(failed, { type: 'open', name: 'N', text: 'T', rows: [{ name: 'a', checked: true }] });
    expect(opened).toEqual({ name: 'N', text: 'T', checkRows: [{ name: 'a', checked: true }], error: '', errorField: 'name' });
  });

  it('name・text は該当の欄だけを変える', () => {
    expect(formReducer(INITIAL_FORM, { type: 'name', value: 'n' })).toEqual({ ...INITIAL_FORM, name: 'n' });
    expect(formReducer(INITIAL_FORM, { type: 'text', value: 't' })).toEqual({ ...INITIAL_FORM, text: 't' });
  });

  it('check は指した行だけを切り替える', () => {
    const base = { ...INITIAL_FORM, checkRows: [{ name: 'a', checked: false }, { name: 'b', checked: false }] };
    expect(formReducer(base, { type: 'check', index: 1, on: true }).checkRows).toEqual([
      { name: 'a', checked: false },
      { name: 'b', checked: true },
    ]);
  });

  it('fail は文と欄を置き、clear-error は文だけを消す', () => {
    const failed = formReducer(INITIAL_FORM, { type: 'fail', message: 'm', field: 'people' });
    expect(failed).toMatchObject({ error: 'm', errorField: 'people' });
    expect(formReducer(failed, { type: 'clear-error' })).toMatchObject({ error: '', errorField: 'people' });
  });
});
