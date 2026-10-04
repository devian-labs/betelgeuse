import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileText, Table2 } from "lucide-react";
import { PageIcon } from "../components/PageIcon";
import { useVault } from "../lib/vault";
import { resolveWikiLink } from "../lib/tree";

/** A page link: the linked page's icon (the same fallback icons as the sidebar) followed by its title. */
export function WikiLinkView({ node }: NodeViewProps) {
  const { notes } = useVault();
  const target = resolveWikiLink(node.attrs.target, notes);
  const title = node.attrs.alias || node.attrs.target;
  return (
    <NodeViewWrapper
      as="span"
      className={`wikilink${target ? "" : " missing"}`}
      data-wikilink=""
      data-target={node.attrs.target}
      data-alias={node.attrs.alias ?? undefined}
      title={title}
    >
      <span className="wikilink-icon" contentEditable={false}>
        {target?.icon ? (
          <PageIcon icon={target.icon} size={16} />
        ) : target?.kind === "database" ? (
          <Table2 size={16} />
        ) : (
          <FileText size={16} />
        )}
      </span>
      <span className="wikilink-title">{title}</span>
    </NodeViewWrapper>
  );
}
