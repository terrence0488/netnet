import { describe, expect, it } from 'vitest';
import { documentTitle, mergeHandles } from './handle';
import { activeEntry, entriesFor, NAV, type NavEntry } from './nav';
import { routes } from './routes';

describe('the nav', () => {
  it('marks the entry a screen belongs to', () => {
    expect(activeEntry('/')?.label).toBe('Home');
    expect(activeEntry('/add')?.label).toBe('Home');
    expect(activeEntry('/holdings/hld_01')?.label).toBe('Home');
    expect(activeEntry('/agent')?.label).toBe('Agent');
    expect(activeEntry('/connect/claude')?.label).toBe('Agent');
    expect(activeEntry('/agents')).toBeUndefined();
    expect(activeEntry('/gallery')).toBeUndefined();
  });

  it('is data: a new entry is one line, and may live in the sidebar only', () => {
    const activity: NavEntry = {
      to: '/activity',
      label: 'Activity',
      icon: 'activity',
      owns: ['/activity'],
      places: ['sidebar'],
    };
    const nav = [...NAV, activity];
    expect(entriesFor('sidebar', nav).map((e) => e.label)).toStrictEqual([
      'Home',
      'Agent',
      'Activity',
    ]);
    expect(entriesFor('tabs', nav).map((e) => e.label)).toStrictEqual(['Home', 'Agent']);
    expect(activeEntry('/activity', nav)).toBe(activity);
  });

  it('leads only to screens that exist', () => {
    const paths = new Set(
      (routes[0]?.children ?? [])
        .flatMap((group) => group.children ?? [group])
        .map((route) => (route.index ? '/' : `/${route.path ?? ''}`)),
    );
    for (const entry of NAV) expect(paths, entry.to).toContain(entry.to);
  });
});

describe('route handles', () => {
  it('merge from the outside in, the deepest route winning', () => {
    expect(mergeHandles([undefined, { title: 'Gallery' }, { chrome: false }])).toStrictEqual({
      title: 'Gallery',
      chrome: false,
    });
    expect(mergeHandles([{ title: 'A' }, { title: 'B' }]).title).toBe('B');
    expect(mergeHandles([])).toStrictEqual({});
  });

  it('name the screen in the title bar', () => {
    expect(documentTitle({ title: 'Home' })).toBe('Home · NetNet');
    expect(documentTitle({})).toBe('NetNet');
  });
});
