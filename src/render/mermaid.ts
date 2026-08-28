import type { TreeNode } from '../types.js';

export interface MermaidOptions {
  /** Do not descend past this depth. Default `4` — Mermaid gets unreadable fast. */
  maxDepth?: number;
  /** Hard cap on emitted nodes. Default `300`. */
  maxNodes?: number;
  /** Graph direction. Default `LR`. */
  direction?: 'LR' | 'TD' | 'RL' | 'BT';
  /** Put the subtree URL count in the node label. Default `true`. */
  counts?: boolean;
}

const PALETTE = ['#3b5bdb', '#0b7285', '#2f9e44', '#e8590c', '#9c36b5', '#c2255c'];

/** Mermaid labels are quoted, so only the quote itself has to be escaped. */
const label = (text: string): string => text.replace(/"/g, '#quot;');

/**
 * Render the tree as Mermaid `graph` source — pasteable into Markdown, GitHub,
 * Notion, or the Mermaid live editor.
 */
export function renderMermaid(root: TreeNode, options: MermaidOptions = {}): string {
  const { maxDepth = 4, maxNodes = 300, direction = 'LR', counts = true } = options;

  const lines = [`graph ${direction}`];
  const tones = new Set<number>();
  const ids = new Map<string, string>();
  let emitted = 0;
  let dropped = 0;

  const id = (node: TreeNode): string => {
    let value = ids.get(node.path);
    if (!value) {
      value = `n${ids.size}`;
      ids.set(node.path, value);
    }
    return value;
  };

  const declare = (node: TreeNode): void => {
    const tone = node.depth % PALETTE.length;
    tones.add(tone);
    const text = counts && node.count > 1 ? `${node.name} (${node.count})` : node.name;
    lines.push(`  ${id(node)}["${label(text)}"]:::d${tone}`);
    emitted++;
  };

  const walk = (node: TreeNode): void => {
    if (node.depth >= maxDepth) {
      dropped += node.count - (node.entry ? 1 : 0);
      return;
    }
    for (const child of node.children) {
      if (emitted >= maxNodes) {
        dropped += child.count;
        continue;
      }
      declare(child);
      lines.push(`  ${id(node)} --> ${id(child)}`);
      walk(child);
    }
  };

  declare(root);
  walk(root);

  for (const tone of [...tones].sort((a, b) => a - b)) {
    lines.push(`  classDef d${tone} stroke:${PALETTE[tone]},stroke-width:1.5px;`);
  }
  if (dropped > 0) lines.push(`  %% ${dropped} URLs omitted by maxDepth/maxNodes`);
  return lines.join('\n');
}
