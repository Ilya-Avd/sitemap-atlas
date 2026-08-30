import type { TreeNode, SitemapEntry } from '../types.js';

export interface CsvOptions {
  /** Field separator. Default `,`; pass `\t` for a TSV. */
  delimiter?: string;
  /** Emit the header row. Default `true`. */
  header?: boolean;
}

const COLUMNS = ['loc', 'depth', 'lastmod', 'changefreq', 'priority', 'images', 'videos', 'status'];

/** Quote only when the value would otherwise break the row. */
function cell(value: string | number | undefined, delimiter: string): string {
  if (value === undefined) return '';
  const text = String(value);
  if (!text.includes(delimiter) && !/["\n\r]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Flatten the tree back to one row per URL, in tree order.
 *
 * The tree is the point of this tool, but a spreadsheet is where the next
 * question usually gets answered, and `depth` carries enough of the structure
 * to group by section there.
 */
export function renderCsv(root: TreeNode, options: CsvOptions = {}): string {
  const { delimiter = ',', header = true } = options;
  const rows: string[] = [];
  if (header) rows.push(COLUMNS.join(delimiter));

  const emit = (entry: SitemapEntry, depth: number): void => {
    rows.push(
      [
        cell(entry.loc, delimiter),
        cell(depth, delimiter),
        cell(entry.lastmod, delimiter),
        cell(entry.changefreq, delimiter),
        cell(entry.priority, delimiter),
        cell(entry.images, delimiter),
        cell(entry.videos, delimiter),
        cell(entry.status, delimiter),
      ].join(delimiter),
    );
  };

  const visit = (node: TreeNode): void => {
    if (node.entry) emit(node.entry, node.depth);
    const duplicates = (node as TreeNode & { duplicates?: SitemapEntry[] }).duplicates;
    if (duplicates) for (const entry of duplicates) emit(entry, node.depth);
    for (const child of node.children) visit(child);
  };

  visit(root);

  return rows.join('\n');
}
