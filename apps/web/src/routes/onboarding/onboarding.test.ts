import type { Countries } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { countryOptions, localeCountry } from './countries';
import { nextState, pathOf, previousStep, reachable, stepLabel } from './steps';

describe('the onboarding steps', () => {
  it('run country, segment, start and basics, then Home', () => {
    expect(pathOf('country')).toBe('/onboarding/country');
    expect(pathOf('segment')).toBe('/onboarding/segment');
    expect(pathOf('start')).toBe('/onboarding/start');
    expect(pathOf('basics')).toBe('/onboarding/basics');
    expect(pathOf('done')).toBe('/');
    expect(nextState('country')).toBe('segment');
    expect(nextState('segment')).toBe('start');
    expect(nextState('start')).toBe('basics');
    expect(nextState('basics')).toBe('done');
  });

  it('count the questions and know the one before', () => {
    expect(stepLabel('country')).toBe('1 of 2');
    expect(stepLabel('segment')).toBe('2 of 2');
    expect(stepLabel('start')).toBeUndefined();
    expect(stepLabel('basics')).toBeUndefined();
    expect(previousStep('country')).toBeUndefined();
    expect(previousStep('segment')?.state).toBe('country');
    expect(previousStep('start')?.state).toBe('segment');
    expect(previousStep('basics')?.state).toBe('start');
  });

  it('open any step up to the saved one, none ahead of it, none once done', () => {
    expect(reachable('country', 'segment')).toBe(true);
    expect(reachable('segment', 'segment')).toBe(true);
    expect(reachable('segment', 'country')).toBe(false);
    expect(reachable('start', 'basics')).toBe(true);
    expect(reachable('basics', 'start')).toBe(false);
    expect(reachable('basics', 'basics')).toBe(true);
    expect(reachable('country', 'done')).toBe(false);
  });
});

/** A few fictional entries in countries.json's shape. */
const COUNTRIES: Countries = {
  SG: { currency: 'SGD', pack: 'sg' },
  AT: { currency: 'EUR' },
  DE: { currency: 'EUR' },
  MY: { currency: 'MYR', pack: 'my' },
  AF: { currency: 'AFN' },
  ZA: { currency: 'ZAR' },
};

describe('countryOptions()', () => {
  it('lists every country, alphabetical in the reader’s language, none pinned', () => {
    const english = countryOptions(COUNTRIES, ['en-SG']);
    expect(english.map((c) => c.name)).toStrictEqual([
      'Afghanistan',
      'Austria',
      'Germany',
      'Malaysia',
      'Singapore',
      'South Africa',
    ]);
    expect(english.find((c) => c.code === 'MY')?.currency).toBe('MYR');
  });

  it('names and sorts them in another language', () => {
    const german = countryOptions(COUNTRIES, ['de-DE']).map((c) => c.name);
    expect(german[0]).toBe('Afghanistan');
    expect(german).toContain('Deutschland');
    expect(german.indexOf('Österreich')).toBeGreaterThan(german.indexOf('Malaysia'));
  });
});

describe('localeCountry()', () => {
  it('takes a region the reader’s language states, when NetNet knows it', () => {
    expect(localeCountry(['en-SG', 'en'], COUNTRIES)).toBe('SG');
    expect(localeCountry(['en', 'ms-MY'], COUNTRIES)).toBe('MY');
  });

  it('never guesses one from a language alone', () => {
    expect(localeCountry(['en', 'de'], COUNTRIES)).toBeNull();
    expect(localeCountry(['en-US'], COUNTRIES)).toBeNull();
    expect(localeCountry(['not a tag'], COUNTRIES)).toBeNull();
  });
});
