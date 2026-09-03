import { useMemo, useState } from "react";
import type { TreeEntry } from "../lib/bridge.ts";

type Node = { entry: TreeEntry; children: Node[] };

function buildTree(entries: TreeEntry[]): Node[] {
  const byPath = new Map<string, Node>();
  const roots: Node[] = [];
  for (const entry of entries) {
    const node: Node = { entry, children: [] };
    byPath.set(entry.path, node);
    const parentPath = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
    const parent = parentPath ? byPath.get(parentPath) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.entry.kind === b.entry.kind ? a.entry.name.localeCompare(b.entry.name) : a.entry.kind === "dir" ? -1 : 1));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function FileTree({ entries, truncated, activePath, onOpen }: {
  entries: TreeEntry[];
  truncated: boolean;
  activePath: string | null;
  onOpen: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(entries), [entries]);

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const render = (nodes: Node[], depth: number) => nodes.map((node) => {
    const { entry } = node;
    const isDir = entry.kind === "dir";
    const isCollapsed = collapsed.has(entry.path);
    return (
      <div key={entry.path}>
        <button
          type="button"
          className={`tree-row${activePath === entry.path ? " active" : ""}`}
          style={{ paddingLeft: 6 + depth * 12 }}
          data-qd-file={isDir ? undefined : entry.path}
          data-qd-dir={isDir ? entry.path : undefined}
          onClick={() => (isDir ? toggle(entry.path) : onOpen(entry.path))}
          title={entry.path}
        >
          <span className="chev">{isDir ? (isCollapsed ? "▸" : "▾") : ""}</span>
          <span className="name">{entry.name}</span>
        </button>
        {isDir && !isCollapsed ? render(node.children, depth + 1) : null}
      </div>
    );
  });

  return (
    <div className="tree" data-qd-file-tree="true">
      {entries.length === 0 ? <div className="faint" style={{ padding: "6px 8px" }}>Empty folder.</div> : render(tree, 0)}
      {truncated ? <div className="faint" style={{ padding: "6px 8px" }}>Showing the first 5,000 entries.</div> : null}
    </div>
  );
}
