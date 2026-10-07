import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { WikiLinkView } from "./WikiLinkView";

const lineKey = new PluginKey<DecorationSet>("wikiLinkLine");

const WIKILINK = /^\[\[([^\]\n|]+?)(?:\|([^\]\n]+))?\]\]/;

/** Inline `[[Target|Alias]]` link, kept as literal wikilink syntax in Markdown. */
export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: { default: "" },
      alias: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wikilink]",
        getAttrs: (el) => ({ target: el.getAttribute("data-target"), alias: el.getAttribute("data-alias") }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wikilink": "",
        "data-target": node.attrs.target,
        "data-alias": node.attrs.alias,
        class: "wikilink",
      }),
      node.attrs.alias || node.attrs.target,
    ];
  },

  addProseMirrorPlugins() {
    // A paragraph that is nothing but one page link reads as a page-link block:
    // the arrow hangs in the margin and long titles wrap under the title. Display only; Markdown is unchanged.
    const lineOnly = (doc: import("@tiptap/pm/model").Node) => {
      const decos: Decoration[] = [];
      doc.descendants((n, pos) => {
        if (n.type.name === "paragraph") {
          if (n.childCount === 1 && n.firstChild?.type.name === this.name) decos.push(Decoration.node(pos, pos + n.nodeSize, { class: "page-link-line" }));
          return false;
        }
        return true;
      });
      return DecorationSet.create(doc, decos);
    };
    return [
      new Plugin({
        key: lineKey,
        state: {
          init: (_, { doc }) => lineOnly(doc),
          apply: (tr, old) => (tr.docChanged ? lineOnly(tr.doc) : old),
        },
        props: { decorations: (state) => lineKey.getState(state) },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView, { as: "span" });
  },

  renderText({ node }) {
    return `[[${node.attrs.target}${node.attrs.alias ? `|${node.attrs.alias}` : ""}]]`;
  },

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start: (src: string) => src.indexOf("[["),
    tokenize(src: string) {
      const m = WIKILINK.exec(src);
      if (!m) return undefined;
      return { type: "wikiLink", raw: m[0], target: m[1].trim(), alias: m[2]?.trim() ?? null };
    },
  },

  parseMarkdown: (token) => ({ type: "wikiLink", attrs: { target: token.target, alias: token.alias } }),

  renderMarkdown: (node) => `[[${node.attrs?.target}${node.attrs?.alias ? `|${node.attrs.alias}` : ""}]]`,
});
