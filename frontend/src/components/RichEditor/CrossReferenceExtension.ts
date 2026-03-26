import { Mark, mergeAttributes } from '@tiptap/core';

export interface CrossReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    crossReference: {
      setCrossReference: (attrs: {
        targetSection: string;
        targetTitle: string;
      }) => ReturnType;
      unsetCrossReference: () => ReturnType;
    };
  }
}

export const CrossReference = Mark.create<CrossReferenceOptions>({
  name: 'crossReference',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      targetSection: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-target-section'),
        renderHTML: (attributes) => ({
          'data-target-section': attributes.targetSection,
        }),
      },
      targetTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-target-title'),
        renderHTML: (attributes) => ({
          'data-target-title': attributes.targetTitle,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-target-section]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'cross-reference',
        href: `#${HTMLAttributes['data-target-section']}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCrossReference:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },
      unsetCrossReference:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

export default CrossReference;
