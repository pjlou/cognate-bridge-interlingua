import { describe, expect, it } from 'vitest';
import { stripAnkiHtml } from './stripAnkiHtml.js';

describe('stripAnkiHtml', () => {
  it('passes plain text through unchanged (aside from trimming)', () => {
    expect(stripAnkiHtml('hello world')).toBe('hello world');
  });

  it('strips tags but keeps their text content, inserting a space at tag boundaries', () => {
    expect(stripAnkiHtml('<b>Hello</b><i>World</i>')).toBe('Hello World');
    expect(stripAnkiHtml('<div>line one</div><div>line two</div>')).toBe('line one line two');
  });

  it('decodes common HTML entities', () => {
    expect(stripAnkiHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(stripAnkiHtml('&lt;tag&gt; &quot;quoted&quot; &#39;apos&#39;')).toBe('<tag> "quoted" \'apos\'');
    expect(stripAnkiHtml('a&nbsp;b')).toBe('a b');
    expect(stripAnkiHtml('&#65;&#x42;')).toBe('AB');
  });

  it('collapses cloze deletions to just the answer text', () => {
    expect(stripAnkiHtml('{{c1::answer}}')).toBe('answer');
    expect(stripAnkiHtml('{{c1::answer::hint}}')).toBe('answer');
    expect(stripAnkiHtml('The capital is {{c1::Paris::city}}.')).toBe('The capital is Paris.');
  });

  it('strips [sound:...] references entirely', () => {
    expect(stripAnkiHtml('[sound:recording.mp3]')).toBe('');
    expect(stripAnkiHtml('Hello [sound:recording.mp3] World')).toBe('Hello World');
  });

  it('handles a realistic combined example: tags + cloze + sound reference', () => {
    const input = '<div>{{c1::Hallo::greeting}}</div><br>[sound:hallo.mp3] <b>Welt</b>';
    expect(stripAnkiHtml(input)).toBe('Hallo Welt');
  });

  it('does not crash on empty or malformed input', () => {
    expect(stripAnkiHtml('')).toBe('');
    expect(stripAnkiHtml('<div><span>unclosed')).toBe('unclosed');
  });
});
