import type { TreeNode } from '../types.js';

export interface TextOptions {
  /** Do not descend past this depth. Default unlimited. */
  maxDepth?: number;
  /** Stop after this many lines. Default `Infinity`. */
  maxNodes?: number;
  /** Append the subtree URL count to every branch. Default `true`. */
  counts?: boolean;
  /** Wrap output in ANSI colours. Default `false`. */
  color?: boolean;
}

const ESC = '\u001b[';
const DEPTH_ANSI = [`${ESC}34m`, `${ESC}36m`, `${ESC}32m`, `${ESC}33m`, `${ESC}35m`, `${ESC}31m`];
const DIM = `${ESC}2m`;
const RESET = `${ESC}0m`;

/** Render the tree the way `tree(1)` would, with URL counts on the branches. */
export function renderText(root: TreeNode, options: TextOptions = {}): string {
  const {
    maxDepth = Number.POSITIVE_INFINITY,
    maxNodes = Number.POSITIVE_INFINITY,
    counts = true,
    color = false,
  } = options;

  const lines: string[] = [];
  const paint = (text: string, code: string): string => (color ? `${code}${text}${RESET}` : text);

  const label = (node: TreeNode): string => {
    const name = paint(node.name, DEPTH_ANSI[node.depth % DEPTH_ANSI.length] as string);
    const count =
      counts && node.count > 1 ? paint(`  ${node.count.toLocaleString('en-US')}`, DIM) : '';
    const deeper = node.truncated ? paint(`  +${node.truncated} deeper`, DIM) : '';
    return `${name}${count}${deeper}`;
  };

  let cut = false;
  const walk = (node: TreeNode, prefix: string): void => {
    if (node.depth >= maxDepth) return;
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      if (lines.length >= maxNodes) {
        // The budget runs out once, not once per level on the way back up.
        if (!cut) {
          cut = true;
          lines.push(`${prefix}...`);
        }
        return;
      }
      const child = children[i] as TreeNode;
      const last = i === children.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${label(child)}`);
      walk(child, `${prefix}${last ? '    ' : '│   '}`);
    }
  };

  lines.push(label(root));
  walk(root, '');
  return lines.join('\n');
}
