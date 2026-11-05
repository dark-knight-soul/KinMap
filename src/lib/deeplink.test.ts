import { describe, expect, it } from 'vitest';
import { parseDeepLink } from './deeplinkParse';

describe('ссылки #demo', () => {
  it('разбирает параметры', () => {
    expect(parseDeepLink('#demo&chart=fan&lang=en&theme=dark&card')).toEqual({
      demo: true,
      chart: 'fan',
      mode: undefined,
      lang: 'en',
      theme: 'dark',
      card: true,
    });
  });

  it('незнакомые значения игнорируются', () => {
    expect(parseDeepLink('#chart=evil&mode=x&theme=<script>')).toEqual({
      demo: false,
      chart: undefined,
      mode: undefined,
      lang: undefined,
      theme: undefined,
      card: false,
    });
  });
});
