/**
 * @file docsLinks.ts
 * @brief Shared helpers for adding documentation links to settings descriptions.
 * @license See LICENSE.md
 */

import { t } from '../../features/i18n/i18n';
import { activeDocument } from 'obsidian';
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

const DOCS_ROOT = 'https://youfoundjk.github.io/plugin-full-calendar/';

export function toDocsUrl(path: string): string {
  return `${DOCS_ROOT}${path.replace(/^\/+/, '')}`;
}

export function createDocsLinksFragment(
  links: DocsLink[],
  prefix = t('global.learnMore')
): DocumentFragment {
  const doc: Document = activeDocument;
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
  const doc: Document = activeDocument;
  const fragment = doc.createDocumentFragment();
  fragment.append(createMarkdownLinksFragment(description));
  if (links.length > 0) {
    fragment.append(' ');
    fragment.append(createDocsLinksFragment(links));
  }
  return fragment;
}
