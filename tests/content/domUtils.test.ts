import { describe, expect, it } from 'vitest';
import {
  dataUrlToFile,
  focusFirstInput,
  querySelectorCandidates,
  snapshotAttachmentCount
} from '../../src/content/domUtils';

function makeVisible(element: Element) {
  element.getBoundingClientRect = () =>
    ({
      bottom: 10,
      height: 10,
      left: 0,
      right: 10,
      top: 0,
      width: 10,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
}

describe('dom utilities', () => {
  it('converts clipboard data urls into files', () => {
    const file = dataUrlToFile({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'screenshot.png',
      lastModified: 123,
      mimeType: 'image/png',
      size: 5
    });

    expect(file.name).toBe('screenshot.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(5);
  });

  it('deduplicates selector candidates and ignores invalid selectors', () => {
    document.body.innerHTML = '<button class="target">Attach</button>';
    const button = document.querySelector('button')!;
    makeVisible(button);

    expect(querySelectorCandidates(['button', '.target', '[']).map((element) => element.tagName)).toEqual(['BUTTON']);
  });

  it('filters attachment previews to visible elements', () => {
    document.body.innerHTML =
      '<img src="data:image/png;base64,aGVsbG8=" alt="preview"><img src="data:image/png;base64,aGVsbG8=" alt="hidden">';
    makeVisible(document.querySelector('img')!);

    expect(snapshotAttachmentCount([])).toBe(1);
  });

  it('focuses the first visible input and moves the caret to the end', () => {
    document.body.innerHTML = '<textarea>hello</textarea>';
    const textarea = document.querySelector('textarea')!;
    makeVisible(textarea);

    focusFirstInput(['textarea']);

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
  });
});
