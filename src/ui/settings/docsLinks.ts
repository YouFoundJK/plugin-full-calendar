/**
 * @file docsLinks.ts
 * @brief Shared helpers for adding documentation links to settings descriptions.
 * @license See LICENSE.md
 */

import { t } from '../../features/i18n/i18n';
import { activeDocument, activeWindow } from 'obsidian';
import {
  createLinksFragment,
  createMarkdownLinksFragment,
  LinkItem,
  linkItemsToSegments
} from './linkTextFragments';

export interface DocsLink {
  text: string;
  path: string;
}

const DOCS_ROOT = 'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/';

export function toDocsUrl(path: string): string {
  return `${DOCS_ROOT}${path.replace(/^\/+/, '')}`;
}

export function createDocsLinksFragment(
  links: DocsLink[],
  prefix = t('global.learnMore')
): DocumentFragment {
  const doc = activeDocument ?? activeWindow?.document ?? window.document;
  if (!doc) {
    return new DocumentFragment();
  }
  if (links.length === 0) {
    return doc.createDocumentFragment();
  }

  const fragment = doc.createDocumentFragment();
  fragment.append(prefix, ' ');

  const linkItems: LinkItem[] = links.map(link => ({
    text: link.text,
    href: toDocsUrl(link.path)
  }));

  fragment.append(createLinksFragment(linkItemsToSegments(linkItems), { betweenLinksText: ' | ' }));
  return fragment;
}

export function createDescWithDocs(description: string, links: DocsLink[]): DocumentFragment {
  const doc = activeDocument ?? activeWindow?.document ?? window.document;
  if (!doc) {
    return createMarkdownLinksFragment(description);
  }
  const fragment = doc.createDocumentFragment();
  fragment.append(createMarkdownLinksFragment(description));
  if (links.length > 0) {
    fragment.append(' ');
    fragment.append(createDocsLinksFragment(links));
  }
  return fragment;
}
