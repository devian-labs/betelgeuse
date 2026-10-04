import { Node, mergeAttributes } from "@tiptap/core";

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
