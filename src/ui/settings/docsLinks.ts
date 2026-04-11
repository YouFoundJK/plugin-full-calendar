/**
 * @file docsLinks.ts
 * @brief Shared helpers for adding documentation links to settings descriptions.
 * @license See LICENSE.md
 */

export interface DocsLink {
  text: string;
  path: string;
}

const DOCS_ROOT = 'https://youfoundjk.github.io/plugin-full-calendar/';

export function toDocsUrl(path: string): string {
  return `${DOCS_ROOT}${path.replace(/^\/+/, '')}`;
}

export function createDocsLinksFragment(
  links: DocsLink[],
  prefix = 'Learn more: '
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (links.length === 0) {
    return fragment;
  }

  fragment.appendText(prefix);
  links.forEach((link, index) => {
    if (index > 0) {
      fragment.appendText(' | ');
    }
    fragment.createEl('a', {
      text: link.text,
      href: toDocsUrl(link.path)
    });
  });
  return fragment;
}

export function createDescWithDocs(description: string, links: DocsLink[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.appendText(description);
  if (links.length > 0) {
    fragment.appendText(' ');
    fragment.append(createDocsLinksFragment(links));
  }
  return fragment;
}
