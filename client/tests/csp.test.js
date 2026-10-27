import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');

// The no-flash theme script is inline, so production CSP allows it by hash. If someone edits the script without
// updating the hash in nginx.conf and vercel.json, the browser blocks it and users get a flash of the wrong theme
// (or worse, a broken first paint). This test makes that impossible to merge.
describe('Content-Security-Policy hash for the inline theme script', () => {
  const html = read('index.html');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const hash = `sha256-${createHash('sha256').update(inline[0] ?? '', 'utf8').digest('base64')}`;

  it('index.html has exactly one inline script, and it reads the same storage key as ThemeContext', () => {
    expect(inline).toHaveLength(1);
    expect(inline[0]).toContain("localStorage.getItem('fdp-theme')");
  });

  it('nginx.conf allows exactly that hash', () => {
    expect(read('nginx.conf')).toContain(`'${hash}'`);
  });

  it('vercel.json allows exactly that hash', () => {
    const v = JSON.parse(read('vercel.json'));
    const csp = v.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
    expect(csp).toContain(`'${hash}'`);
  });

  it('neither policy allows unsafe-inline or unsafe-eval scripts', () => {
    for (const text of [read('nginx.conf'), read('vercel.json')]) {
      const script = text.match(/script-src([^;"]*)/)[1];
      expect(script).not.toMatch(/unsafe-/);
    }
  });

  it('the vercel.json SPA rewrite is still present (deep links must not 404)', () => {
    const v = JSON.parse(read('vercel.json'));
    expect(v.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  });
});
