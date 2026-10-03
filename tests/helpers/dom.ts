import { vi } from 'vitest';

export function makeVisible(element: Element) {
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

export function installClipboardEventMocks() {
  class TestDataTransfer {
    files: File[] = [];
    items = {
      add: (file: File) => {
        this.files.push(file);
      }
    };
  }

  class TestClipboardEvent extends Event {
    clipboardData: TestDataTransfer;

    constructor(type: string, init: EventInit & { clipboardData: TestDataTransfer }) {
      super(type, init);
      this.clipboardData = init.clipboardData;
    }
  }

  class TestDragEvent extends Event {
    dataTransfer: TestDataTransfer;

    constructor(type: string, init: EventInit & { dataTransfer: TestDataTransfer }) {
      super(type, init);
      this.dataTransfer = init.dataTransfer;
    }
  }

  vi.stubGlobal('DataTransfer', TestDataTransfer);
  vi.stubGlobal('ClipboardEvent', TestClipboardEvent);
  vi.stubGlobal('DragEvent', TestDragEvent);
}
