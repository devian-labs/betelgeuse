//! Notion's "HTML" export -> the Markdown the editor reads and writes back unchanged.
//!
//! Unlike the Markdown export, the HTML export keeps page icons and covers, text colours and
//! highlights, callout colours, toggles, columns and the colours of select options. Pages are
//! parsed with a real HTML parser (`scraper`); the rest of the import (ids, folders, titles,
//! databases, assets, links) is shared with the Markdown importer in `importer.rs`.

use super::{pad_tables, NotionCtx, Target};
use scraper::{ElementRef, Html, Selector};
use std::collections::HashMap;
use std::sync::LazyLock;

// ---------------------------------------------------------------- colours and icons

/// Notion colour name -> Betelgeuse colour. Notion calls green "teal" in its HTML classes.
pub(super) fn notion_color(c: &str) -> Option<&'static str> {
    Some(match c {
        "gray" | "lightgray" | "grey" => "gray",
        "brown" => "brown",
        "orange" => "orange",
        "yellow" => "yellow",
        "green" | "teal" => "green",
        "blue" => "blue",
        "purple" => "purple",
        "pink" => "pink",
        "red" => "red",
        _ => return None,
    })
}

/// Notion's built-in icons (`https://www.notion.so/icons/<name>_<colour>.svg`) -> Lucide icons
/// (`lucide-react` names; `tests/notion-icons.test.mjs` checks every one exists).
const NOTION_ICONS: &[(&str, &str)] = &[
    ("activity", "Activity"),
    ("add", "Plus"),
    ("airplane", "Plane"),
    ("alarm", "AlarmClock"),
    ("alert", "TriangleAlert"),
    ("anchor", "Anchor"),
    ("apple", "Apple"),
    ("archive", "Archive"),
    ("arrow-circle-down", "CircleChevronDown"),
    ("arrow-down", "ArrowDown"),
    ("arrow-left", "ArrowLeft"),
    ("arrow-right", "ArrowRight"),
    ("arrow-up", "ArrowUp"),
    ("arrow-northeast", "ArrowUpRight"),
    ("arrow-northwest", "ArrowUpLeft"),
    ("arrow-southeast", "ArrowDownRight"),
    ("arrow-southwest", "ArrowDownLeft"),
    ("arrows-swap", "ArrowLeftRight"),
    ("at", "AtSign"),
    ("attachment", "Paperclip"),
    ("award", "Award"),
    ("baby", "Baby"),
    ("backpack", "Backpack"),
    ("bank", "Landmark"),
    ("barcode", "Barcode"),
    ("battery", "Battery"),
    ("beaker", "FlaskConical"),
    ("bed", "Bed"),
    ("bell", "Bell"),
    ("bicycle", "Bike"),
    ("binoculars", "Binoculars"),
    ("bird", "Bird"),
    ("bluetooth", "Bluetooth"),
    ("bolt", "Zap"),
    ("book", "Book"),
    ("book-closed", "Book"),
    ("book-open", "BookOpen"),
    ("bookmark", "Bookmark"),
    ("bookmark-outline", "Bookmark"),
    ("books", "Library"),
    ("box", "Box"),
    ("brain", "Brain"),
    ("briefcase", "Briefcase"),
    ("browser", "AppWindow"),
    ("brush", "Brush"),
    ("bug", "Bug"),
    ("building", "Building"),
    ("burst", "Loader"),
    ("bus", "Bus"),
    ("cake", "Cake"),
    ("calculator", "Calculator"),
    ("calendar", "Calendar"),
    ("calendar-day", "CalendarDays"),
    ("calendar-month", "CalendarRange"),
    ("camera", "Camera"),
    ("camera-roll", "Images"),
    ("car", "Car"),
    ("card", "CreditCard"),
    ("cart", "ShoppingCart"),
    ("cash", "Banknote"),
    ("cat", "Cat"),
    ("chart-bar", "ChartColumn"),
    ("chart-line", "ChartLine"),
    ("chart-pie", "ChartPie"),
    ("chat", "MessageCircle"),
    ("check", "Check"),
    ("checklist", "ListChecks"),
    ("checkmark", "Check"),
    ("checkmark-line", "Check"),
    ("checkmark-square", "SquareCheck"),
    ("checkbox", "SquareCheck"),
    ("chevron-down", "ChevronDown"),
    ("chevron-left", "ChevronLeft"),
    ("chevron-right", "ChevronRight"),
    ("chevron-up", "ChevronUp"),
    ("circle", "Circle"),
    ("circle-dashed", "CircleDashed"),
    ("clipboard", "Clipboard"),
    ("clock", "Clock"),
    ("clock-alternate", "Clock"),
    ("cloud", "Cloud"),
    ("code", "Code"),
    ("coffee", "Coffee"),
    ("cog", "Cog"),
    ("comment", "MessageSquare"),
    ("compass", "Compass"),
    ("computer", "Monitor"),
    ("copy", "Copy"),
    ("credit-card", "CreditCard"),
    ("crown", "Crown"),
    ("cursor", "MousePointer"),
    ("database", "Database"),
    ("description", "TextAlignStart"),
    ("diamond", "Diamond"),
    ("dice", "Dice5"),
    ("document", "FileText"),
    ("dog", "Dog"),
    ("dollar", "DollarSign"),
    ("download", "Download"),
    ("drafts", "NotebookPen"),
    ("drink", "CupSoda"),
    ("drop", "Droplet"),
    ("earth", "Earth"),
    ("egg", "Egg"),
    ("emoji", "FaceSlightlySmiling"),
    ("envelope", "Mail"),
    ("exclamation-mark", "CircleAlert"),
    ("eye", "Eye"),
    ("feather", "Feather"),
    ("file", "File"),
    ("film", "Film"),
    ("filter", "Funnel"),
    ("fire", "Flame"),
    ("flag", "Flag"),
    ("flash", "Zap"),
    ("flower", "Flower"),
    ("folder", "Folder"),
    ("folder-open", "FolderOpen"),
    ("food", "Utensils"),
    ("formula", "Sigma"),
    ("friends", "Users"),
    ("gear", "Settings"),
    ("gem", "Gem"),
    ("gift", "Gift"),
    ("globe", "Globe"),
    ("graduate", "GraduationCap"),
    ("grid", "LayoutGrid"),
    ("groups", "Users"),
    ("hammer", "Hammer"),
    ("hand", "Hand"),
    ("hashtag", "Hash"),
    ("headphones", "Headphones"),
    ("heart", "Heart"),
    ("help", "CircleQuestionMark"),
    ("help-alternate", "CircleQuestionMark"),
    ("home", "House"),
    ("hourglass", "Hourglass"),
    ("image", "Image"),
    ("inbox", "Inbox"),
    ("info", "Info"),
    ("info-alternate", "Info"),
    ("key", "Key"),
    ("keyboard", "Keyboard"),
    ("lab", "FlaskConical"),
    ("laptop", "Laptop"),
    ("layers", "Layers"),
    ("leaf", "Leaf"),
    ("library", "Library"),
    ("lightbulb", "Lightbulb"),
    ("lightning", "Zap"),
    ("link", "Link"),
    ("list", "List"),
    ("location", "MapPin"),
    ("lock", "Lock"),
    ("magic-wand", "WandSparkles"),
    ("mail", "Mail"),
    ("map", "Map"),
    ("map-pin", "MapPin"),
    ("megaphone", "Megaphone"),
    ("microphone", "Mic"),
    ("mobile", "Smartphone"),
    ("money", "Banknote"),
    ("moon", "Moon"),
    ("mountain", "Mountain"),
    ("music", "Music"),
    ("newspaper", "Newspaper"),
    ("note", "StickyNote"),
    ("notification", "Bell"),
    ("number", "Hash"),
    ("palette", "Palette"),
    ("paperclip", "Paperclip"),
    ("pause", "Pause"),
    ("pencil", "Pencil"),
    ("people", "Users"),
    ("person", "User"),
    ("phone", "Phone"),
    ("photo", "Image"),
    ("piggy-bank", "PiggyBank"),
    ("pin", "Pin"),
    ("pizza", "Pizza"),
    ("plant", "Sprout"),
    ("play", "Play"),
    ("plus", "Plus"),
    ("presentation", "Presentation"),
    ("printer", "Printer"),
    ("puzzle", "Puzzle"),
    ("question-mark", "CircleQuestionMark"),
    ("receipt", "Receipt"),
    ("recycle", "Recycle"),
    ("repeat", "Repeat"),
    ("rocket", "Rocket"),
    ("ruler", "Ruler"),
    ("save", "Save"),
    ("school", "School"),
    ("scissors", "Scissors"),
    ("search", "Search"),
    ("seed", "Sprout"),
    ("send", "Send"),
    ("server", "Server"),
    ("share", "Share2"),
    ("shield", "Shield"),
    ("shirt", "Shirt"),
    ("shop", "Store"),
    ("shopping-cart", "ShoppingCart"),
    ("signpost", "Signpost"),
    ("skull", "Skull"),
    ("snowflake", "Snowflake"),
    ("sparkle", "Sparkle"),
    ("sparkles", "Sparkles"),
    ("speaker", "Speaker"),
    ("star", "Star"),
    ("sticky-note", "StickyNote"),
    ("stopwatch", "Timer"),
    ("suitcase", "Luggage"),
    ("sun", "Sun"),
    ("table", "Table"),
    ("tag", "Tag"),
    ("target", "Target"),
    ("terminal", "Terminal"),
    ("thermometer", "Thermometer"),
    ("thumbs-down", "ThumbsDown"),
    ("thumbs-up", "ThumbsUp"),
    ("ticket", "Ticket"),
    ("timer", "Timer"),
    ("tools", "Wrench"),
    ("trash", "Trash"),
    ("tree", "TreePine"),
    ("trophy", "Trophy"),
    ("truck", "Truck"),
    ("umbrella", "Umbrella"),
    ("upload", "Upload"),
    ("user", "User"),
    ("user-circle", "CircleUser"),
    ("user-circle-filled", "CircleUser"),
    ("username", "AtSign"),
    ("users", "Users"),
    ("video", "Video"),
    ("video-camera", "Video"),
    ("video-game", "Gamepad2"),
    ("wallet", "Wallet"),
    ("warning", "TriangleAlert"),
    ("watch", "Watch"),
    ("wifi", "Wifi"),
    ("wrench", "Wrench"),
    ("write", "PenLine"),
    ("x", "X"),
    ("zap", "Zap"),
];

/// `https://app.notion.com/icons/globe_pink.svg` (or `/icons/…`) -> `lucide:Globe:pink`.
pub(super) fn builtin_icon(src: &str) -> Option<String> {
    let file = src.split(['?', '#']).next()?.strip_suffix(".svg")?;
    let (dir, file) = file.rsplit_once('/')?;
    if !dir.ends_with("/icons") && dir != "/icons" && dir != "icons" {
        return None;
    }
    let (name, color) = file.rsplit_once('_').unwrap_or((file, "gray"));
    let lucide = NOTION_ICONS.iter().find(|(n, _)| *n == name)?.1;
    Some(format!("lucide:{lucide}:{}", notion_color(color).unwrap_or("default")))
}

// ---------------------------------------------------------------- page metadata

/// A page icon as Notion exported it.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum RawIcon {
    Emoji(String),
    /// An image: one of Notion's built-in icons, a custom upload (relative path) or a link.
    Image(String),
}

/// One row of a database page's property table.
#[derive(Debug, Clone, Default, PartialEq)]
pub(super) struct HtmlProp {
    pub name: String,
    /// Notion's property type (`property-row-<type>`).
    pub kind: String,
    /// The value as text, in the CSV's format (multi-values joined with ", ").
    pub value: String,
    /// Select / status / multi-select options with their Notion colours.
    pub options: Vec<(String, String)>,
}

/// Everything an exported HTML page carries besides its body.
#[derive(Debug, Default)]
pub(super) struct HtmlPage {
    pub title: String,
    pub icon: Option<RawIcon>,
    pub cover: Option<String>,
    pub props: Vec<HtmlProp>,
    /// Inner HTML of `div.page-body`, converted once every page's location is known.
    pub body: String,
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).unwrap()
}

static TITLE: LazyLock<Selector> = LazyLock::new(|| sel("header .page-title"));
static ICON: LazyLock<Selector> = LazyLock::new(|| sel("header .page-header-icon"));
static COVER: LazyLock<Selector> = LazyLock::new(|| sel("header img.page-cover-image"));
static PROPS: LazyLock<Selector> = LazyLock::new(|| sel("header table.properties tr"));
static DESCRIPTION: LazyLock<Selector> = LazyLock::new(|| sel("header .page-description"));
static BODY: LazyLock<Selector> = LazyLock::new(|| sel(".page-body"));
static ARTICLE: LazyLock<Selector> = LazyLock::new(|| sel("article"));
static DOC_TITLE: LazyLock<Selector> = LazyLock::new(|| sel("head title"));

fn has_class(el: ElementRef, class: &str) -> bool {
    el.value().classes().any(|c| c == class)
}

fn text_of(el: ElementRef) -> String {
    el.text().collect::<String>()
}

/// Whitespace runs -> one space, trimmed.
fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The icon inside `.page-header-icon`, a callout's icon box or a link-to-page.
fn icon_in(el: ElementRef) -> Option<RawIcon> {
    for e in std::iter::once(el).chain(el.descendent_elements()) {
        match e.value().name() {
            "img" => return e.attr("src").filter(|s| !s.is_empty()).map(|s| RawIcon::Image(s.to_string())),
            "span" if has_class(e, "icon") => {
                let emoji = e.attr("data-emoji").map(str::to_string).unwrap_or_else(|| text_of(e).trim().to_string());
                return (!emoji.is_empty()).then_some(RawIcon::Emoji(emoji));
            }
            _ => {}
        }
    }
    None
}

fn parse_prop(tr: ElementRef) -> Option<HtmlProp> {
    let kind = tr.value().classes().find_map(|c| c.strip_prefix("property-row-"))?.to_string();
    let th = tr.child_elements().find(|e| e.value().name() == "th")?;
    let td = tr.child_elements().find(|e| e.value().name() == "td")?;
    let name = squash(&th.text().collect::<String>());
    let mut prop = HtmlProp { name, kind, ..Default::default() };
    // Options: `<span class="selected-value select-value-color-red">`; uncoloured ones are default.
    let colored: Vec<ElementRef> = td
        .descendent_elements()
        .filter(|e| e.value().classes().any(|c| c.starts_with("select-value-color-") || c == "selected-value" || c == "status-value"))
        .collect();
    let values: Vec<String> = if !colored.is_empty() {
        for e in &colored {
            let color = e.value().classes().find_map(|c| c.strip_prefix("select-value-color-")).unwrap_or("default");
            let color = notion_color(color).unwrap_or("default");
            prop.options.push((squash(&text_of(*e)), color.to_string()));
        }
        prop.options.iter().map(|(n, _)| n.clone()).collect()
    } else if prop.kind == "checkbox" {
        let on = td.descendent_elements().any(|e| has_class(e, "checkbox-on") || e.attr("checked").is_some());
        vec![if on { "Yes" } else { "No" }.to_string()]
    } else if let Some(items) = Some(td.child_elements().filter(|e| matches!(e.value().name(), "a" | "span" | "time")).collect::<Vec<_>>()).filter(|v| v.len() > 1) {
        items.iter().map(|e| squash(&text_of(*e))).collect()
    } else {
        vec![squash(&text_of(td))]
    };
    prop.value = values.into_iter().filter(|v| !v.is_empty()).collect::<Vec<_>>().join(", ");
    Some(prop)
}

/// Reads an exported page: title, icon, cover, database properties and the body's HTML.
pub(super) fn parse_page(html: &str) -> HtmlPage {
    let doc = Html::parse_document(html);
    let first = |s: &Selector| doc.select(s).next();
    let title = first(&TITLE).or_else(|| first(&DOC_TITLE)).map(|t| squash(&text_of(t))).unwrap_or_default();
    let icon = first(&ICON).and_then(icon_in).or_else(|| {
        // `<article data-notion-page-icon="/icons/globe_pink.svg">` (or an emoji / link).
        let a = first(&ARTICLE)?.attr("data-notion-page-icon")?.trim();
        (!a.is_empty()).then(|| if a.contains('/') { RawIcon::Image(a.to_string()) } else { RawIcon::Emoji(a.to_string()) })
    });
    let cover = first(&COVER).and_then(|c| c.attr("src")).map(str::to_string);
    let props = doc.select(&PROPS).filter_map(parse_prop).collect();
    let description = first(&DESCRIPTION).filter(|d| !text_of(*d).trim().is_empty()).map(|d| format!("<p>{}</p>", d.inner_html()));
    let body = first(&BODY).map(|b| b.inner_html()).unwrap_or_default();
    HtmlPage { title, icon, cover, props, body: description.unwrap_or_default() + &body }
}

/// Every link target in a page body, in document order.
pub(super) fn hrefs(body: &str) -> Vec<String> {
    static A: LazyLock<Selector> = LazyLock::new(|| sel("a[href]"));
    let frag = Html::parse_fragment(body);
    frag.select(&A).filter_map(|a| a.attr("href")).map(str::to_string).collect()
}

// ---------------------------------------------------------------- inline content

/// Formatting of a run of text. The editor writes marks in this order, outermost first.
#[derive(Clone, Default, PartialEq, Debug)]
struct Marks {
    link: Option<String>,
    bold: bool,
    italic: bool,
    strike: bool,
    code: bool,
    /// The editor's colour span: (text colour, background).
    color: (Option<String>, Option<String>),
}

#[derive(Clone, PartialEq, Debug)]
enum M {
    Link(String),
    Bold,
    Italic,
    Strike,
    Code,
    Color(Option<String>, Option<String>),
}

impl Marks {
    fn list(&self) -> Vec<M> {
        let mut v = vec![];
        if let Some(l) = &self.link {
            v.push(M::Link(l.clone()));
        }
        if self.bold {
            v.push(M::Bold);
        }
        if self.italic {
            v.push(M::Italic);
        }
        if self.strike {
            v.push(M::Strike);
        }
        if self.code {
            v.push(M::Code);
        }
        if self.color.0.is_some() || self.color.1.is_some() {
            v.push(M::Color(self.color.0.clone(), self.color.1.clone()));
        }
        v
    }

    fn intersect(&self, o: &Marks) -> Marks {
        Marks {
            link: self.link.clone().filter(|l| o.link.as_ref() == Some(l)),
            bold: self.bold && o.bold,
            italic: self.italic && o.italic,
            strike: self.strike && o.strike,
            code: self.code && o.code,
            color: if self.color == o.color { self.color.clone() } else { (None, None) },
        }
    }

    fn is_empty(&self) -> bool {
        self.list().is_empty()
    }
}

fn open(m: &M) -> String {
    match m {
        M::Link(_) => "[".into(),
        M::Bold => "**".into(),
        M::Italic => "*".into(),
        M::Strike => "~~".into(),
        M::Code => "`".into(),
        M::Color(c, b) => {
            let c = c.as_ref().map_or(String::new(), |c| format!(" data-color=\"{c}\""));
            let b = b.as_ref().map_or(String::new(), |b| format!(" data-bg=\"{b}\""));
            format!("<span{c}{b}>")
        }
    }
}

fn close(m: &M) -> String {
    match m {
        M::Link(href) => format!("]({href})"),
        M::Bold => "**".into(),
        M::Italic => "*".into(),
        M::Strike => "~~".into(),
        M::Code => "`".into(),
        M::Color(..) => "</span>".into(),
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Atom {
    Text(String, Marks),
    Break,
    /// Already-formatted Markdown that carries no marks (wikilinks, images).
    Raw(String),
}

/// Where inline content is written: line breaks and escaping differ.
#[derive(Clone, Copy, PartialEq)]
enum Ctx {
    Para,
    /// Headings and toggle summaries: a single line.
    Line,
    Cell,
}

/// The editor's escaping of plain text: Markdown punctuation and HTML's `& < >`.
fn escape(s: &str, ctx: Ctx) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' | '`' | '*' | '_' | '[' | ']' | '~' => {
                out.push('\\');
                out.push(c);
            }
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '|' if ctx == Ctx::Cell => out.push_str("\\|"),
            c => out.push(c),
        }
    }
    out
}

fn marks_of(a: &Atom) -> Marks {
    match a {
        Atom::Text(_, m) => m.clone(),
        _ => Marks::default(),
    }
}

/// Serialises inline content the way the editor does: marks open in a fixed order and stay
/// open while they continue, whitespace sits outside delimiters, line breaks close every mark.
fn render_inline(atoms: Vec<Atom>, ctx: Ctx) -> String {
    // 1. Text with line breaks (pre-wrap) -> breaks; breaks in one-line contexts -> spaces;
    //    bare URLs and emails -> links (the editor's Markdown parser links them anyway).
    let mut flat: Vec<Atom> = vec![];
    for a in atoms {
        match a {
            Atom::Text(t, m) => {
                for (i, part) in t.split('\n').enumerate() {
                    if i > 0 {
                        flat.push(Atom::Break);
                    }
                    let part = part.replace(['\r', '\u{a0}'], " ");
                    if m.link.is_some() || m.code {
                        if !part.is_empty() {
                            flat.push(Atom::Text(part, m.clone()));
                        }
                        continue;
                    }
                    let mut last = 0;
                    for (start, end, href) in autolinks(&part) {
                        if start > last {
                            flat.push(Atom::Text(part[last..start].to_string(), m.clone()));
                        }
                        flat.push(Atom::Text(part[start..end].to_string(), Marks { link: Some(href), ..m.clone() }));
                        last = end;
                    }
                    if last < part.len() {
                        flat.push(Atom::Text(part[last..].to_string(), m.clone()));
                    }
                }
            }
            Atom::Break if ctx == Ctx::Line => flat.push(Atom::Text(" ".into(), Marks::default())),
            a => flat.push(a),
        }
    }
    // 2. Split leading / trailing whitespace off marked text.
    let mut split: Vec<Atom> = vec![];
    for a in flat {
        match a {
            Atom::Text(t, m) if !m.is_empty() => {
                let core = t.trim();
                if core.is_empty() {
                    split.push(Atom::Text(t, m));
                    continue;
                }
                let start = t.len() - t.trim_start().len();
                let end = start + core.len();
                if start > 0 {
                    split.push(Atom::Text(t[..start].to_string(), m.clone()));
                }
                split.push(Atom::Text(core.to_string(), m.clone()));
                if end < t.len() {
                    split.push(Atom::Text(t[end..].to_string(), m));
                }
            }
            a => split.push(a),
        }
    }
    // 3. Whitespace keeps only the marks that continue on both sides; none next to breaks.
    let n = split.len();
    for i in 0..n {
        let Atom::Text(t, _) = &split[i] else { continue };
        if !t.trim().is_empty() {
            continue;
        }
        let prev = if i > 0 { marks_of(&split[i - 1]) } else { Marks::default() };
        let next = if i + 1 < n { marks_of(&split[i + 1]) } else { Marks::default() };
        let near_break = (i > 0 && split[i - 1] == Atom::Break) || (i + 1 < n && split[i + 1] == Atom::Break);
        let keep = prev.intersect(&next);
        if let Atom::Text(t, m) = &mut split[i] {
            *m = m.intersect(&keep);
            if near_break {
                t.clear();
            }
        }
    }
    split.retain(|a| !matches!(a, Atom::Text(t, _) if t.is_empty()));
    // 4. Merge neighbours with the same marks; trim the edges and around breaks.
    let mut atoms: Vec<Atom> = vec![];
    for a in split {
        if let (Some(Atom::Text(t, m)), Atom::Text(t2, m2)) = (atoms.last_mut(), &a) {
            if m == m2 {
                t.push_str(t2);
                continue;
            }
        }
        atoms.push(a);
    }
    while matches!(atoms.first(), Some(Atom::Break)) || matches!(atoms.first(), Some(Atom::Text(t, _)) if t.trim().is_empty()) {
        atoms.remove(0);
    }
    while matches!(atoms.last(), Some(Atom::Break)) || matches!(atoms.last(), Some(Atom::Text(t, _)) if t.trim().is_empty()) {
        atoms.pop();
    }
    let len = atoms.len();
    for i in 0..len {
        let (before, after) = (i > 0 && atoms[i - 1] == Atom::Break, i + 1 < len && atoms[i + 1] == Atom::Break);
        if let Atom::Text(t, _) = &mut atoms[i] {
            let mut s = t.as_str();
            if i == 0 || before {
                s = s.trim_start();
            }
            if i + 1 == len || after {
                s = s.trim_end();
            }
            *t = s.to_string();
        }
    }
    // 5. Write it out.
    let mut out = String::new();
    let mut stack: Vec<M> = vec![];
    let close_all = |out: &mut String, stack: &mut Vec<M>| {
        while let Some(m) = stack.pop() {
            out.push_str(&close(&m));
        }
    };
    for a in atoms {
        match a {
            Atom::Text(t, m) => {
                let want = m.list();
                let keep = stack.iter().position(|s| !want.contains(s)).unwrap_or(stack.len());
                while stack.len() > keep {
                    let m = stack.pop().unwrap();
                    out.push_str(&close(&m));
                }
                for w in want {
                    if !stack.contains(&w) {
                        out.push_str(&open(&w));
                        stack.push(w);
                    }
                }
                if m.code {
                    out.push_str(&t);
                } else {
                    out.push_str(&escape(&t, ctx));
                }
            }
            Atom::Break => {
                close_all(&mut out, &mut stack);
                out.push_str(if ctx == Ctx::Cell { "<br>" } else { "  \n" });
            }
            Atom::Raw(s) => {
                close_all(&mut out, &mut stack);
                out.push_str(&s);
            }
        }
    }
    close_all(&mut out, &mut stack);
    out
}

/// Bare URLs and email addresses that GFM (the editor's Markdown parser) turns into links:
/// (start, end, href). Mirrors `marked`'s `url` rule, trailing punctuation included.
fn autolinks(s: &str) -> Vec<(usize, usize, String)> {
    let email_run = |c: char| c.is_ascii_alphanumeric() || ".!#$%&'*+/=?_`{|}~-".contains(c);
    let mut out = vec![];
    let mut i = 0;
    let mut prev: Option<char> = None;
    while i < s.len() {
        let rest = &s[i..];
        let lower = rest.get(..8).unwrap_or(rest).to_ascii_lowercase();
        let scheme = ["https://", "http://", "ftp://"].iter().find(|p| lower.starts_with(**p)).map(|p| p.len()).or(rest.starts_with("www.").then_some(4));
        if let Some(n) = scheme.filter(|&n| rest[n..].starts_with(|c: char| c.is_ascii_alphanumeric() || c == '-')) {
            let end = rest.find(|c: char| c.is_whitespace() || c == '<').unwrap_or(rest.len());
            let url = backpedal(&rest[..end]);
            if url.len() > n {
                let href = if n == 4 && rest.starts_with("www.") { format!("http://{url}") } else { url.to_string() };
                out.push((i, i + url.len(), href));
                prev = url.chars().last();
                i += url.len();
                continue;
            }
        }
        if prev.is_none_or(|p| !email_run(p)) {
            if let Some(len) = email_at(rest) {
                out.push((i, i + len, format!("mailto:{}", &rest[..len])));
                prev = rest[..len].chars().last();
                i += len;
                continue;
            }
        }
        let c = rest.chars().next().unwrap();
        prev = Some(c);
        i += c.len_utf8();
    }
    out
}

/// `marked`'s `_backpedal`: drops trailing punctuation and unbalanced parentheses from a URL.
fn backpedal(url: &str) -> &str {
    const PUNCT: &str = "?!.,:;*_'\"~";
    let mut cur = url;
    loop {
        let b: Vec<(usize, char)> = cur.char_indices().collect();
        let mut k = 0;
        while k < b.len() {
            let c = b[k].1;
            if c == '(' {
                match b[k + 1..].iter().position(|&(_, x)| x == ')') {
                    Some(p) => k += p + 2,
                    None => break,
                }
            } else if c == '&' {
                let tail = &cur[b[k].0 + 1..];
                let entity = tail.strip_suffix(';').is_some_and(|t| !t.is_empty() && t.chars().all(|x| x.is_ascii_alphanumeric()));
                if entity {
                    break;
                }
                k += 1;
            } else if PUNCT.contains(c) || c == ')' {
                let mut j = k;
                while j < b.len() && (PUNCT.contains(b[j].1) || b[j].1 == ')') {
                    j += 1;
                }
                if j < b.len() {
                    k = j;
                } else if j - k > 1 {
                    k = j - 1;
                } else {
                    break;
                }
            } else {
                k += 1;
            }
        }
        let next = &cur[..b.get(k).map_or(cur.len(), |&(at, _)| at)];
        if next == cur {
            return cur;
        }
        cur = next;
    }
}

/// Length of an email address at the start of `s` (`marked`'s GFM email rule).
fn email_at(s: &str) -> Option<usize> {
    let local = s.find(|c: char| !(c.is_ascii_alphanumeric() || "._+-".contains(c))).unwrap_or(s.len());
    if local == 0 || !s[local..].starts_with('@') {
        return None;
    }
    let domain = &s[local + 1..];
    let run = domain.find(|c: char| !(c.is_ascii_alphanumeric() || "._-".contains(c))).unwrap_or(domain.len());
    let mut segs = domain[..run].split('.');
    let first = segs.next()?;
    if first.is_empty() {
        return None;
    }
    let mut len = first.len();
    let mut groups = 0;
    for seg in segs {
        if seg.is_empty() || !seg.ends_with(|c: char| c.is_ascii_alphanumeric()) {
            break;
        }
        len += 1 + seg.len();
        groups += 1;
    }
    let end = local + 1 + len;
    (groups > 0 && !s[end..].starts_with(['-', '_'])).then_some(end)
}

// ---------------------------------------------------------------- blocks

#[derive(Clone, Copy, PartialEq, Debug)]
enum ListKind {
    Bullet,
    Ordered,
    Task,
}

#[derive(Debug)]
enum Block {
    Paragraph(String),
    /// A block image: the editor writes it inside a list item's paragraph.
    Image(String),
    /// A GFM table (written with a blank line on each side, as the editor does).
    Table(String),
    /// Any other block.
    Other(String),
    Item { kind: ListKind, start: u32, checked: bool, text: String, children: Vec<Block> },
}

fn indent_lines(s: &str, pad: &str) -> String {
    s.split('\n').map(|l| format!("{pad}{l}")).collect::<Vec<_>>().join("\n")
}

/// `> ` before every line, a bare `>` for blank ones.
fn quote(s: &str) -> String {
    s.split('\n').map(|l| if l.is_empty() { ">".to_string() } else { format!("> {l}") }).collect::<Vec<_>>().join("\n")
}

/// Renders a list item like the editor: the first paragraph after the marker, then each child
/// on the next line (paragraphs after a blank line), indented to the item's content.
fn render_item(marker: &str, kind: ListKind, text: &str, children: &[Block]) -> String {
    let mut out = format!("{marker}{text}");
    let pad = " ".repeat(if kind == ListKind::Ordered { marker.chars().count().max(2) } else { 2 });
    for unit in units(children) {
        match unit {
            Unit::Image(md) => {
                // Images join the paragraph above (the editor's stable form).
                out.push('\n');
                out.push_str(md);
            }
            Unit::Paragraph(md) => {
                out.push_str("\n\n");
                out.push_str(&indent_lines(md, &pad));
            }
            Unit::Other(md) => {
                out.push('\n');
                out.push_str(&indent_lines(&md, &pad));
            }
        }
    }
    out
}

enum Unit<'a> {
    Paragraph(&'a str),
    Image(&'a str),
    Other(String),
}

/// Groups list items into lists and renders each block.
fn units(blocks: &[Block]) -> Vec<Unit<'_>> {
    let mut out = vec![];
    let mut i = 0;
    while i < blocks.len() {
        match &blocks[i] {
            Block::Paragraph(s) => out.push(Unit::Paragraph(s)),
            Block::Image(s) => out.push(Unit::Image(s)),
            Block::Table(s) => out.push(Unit::Other(format!("\n{s}\n"))),
            Block::Other(s) => out.push(Unit::Other(s.clone())),
            Block::Item { kind, start, .. } => {
                let (kind, mut n) = (*kind, *start);
                let mut items = vec![];
                while let Some(Block::Item { kind: k, checked, text, children, .. }) = blocks.get(i) {
                    if *k != kind {
                        break;
                    }
                    let marker = match kind {
                        ListKind::Bullet => "- ".to_string(),
                        ListKind::Task => format!("- [{}] ", if *checked { "x" } else { " " }),
                        ListKind::Ordered => format!("{n}. "),
                    };
                    items.push(render_item(&marker, kind, text, children));
                    n += 1;
                    i += 1;
                }
                out.push(Unit::Other(items.join("\n")));
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Blocks joined with blank lines, as the editor writes a document or a container's content.
fn render_blocks(blocks: &[Block]) -> String {
    units(blocks)
        .into_iter()
        .map(|u| match u {
            Unit::Paragraph(s) | Unit::Image(s) => s.to_string(),
            Unit::Other(s) => s,
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// What the editor's `normalizeMarkdown` does to a whole page (see `src/editor/markdown.ts`).
fn normalize(md: &str) -> String {
    static BEFORE_TABLE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"\n{3,}(\|)").unwrap());
    static AFTER_TABLE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"(?m)^(\|.*\|)\n{3,}").unwrap());
    let md = BEFORE_TABLE.replace_all(md, "\n\n$1");
    let md = AFTER_TABLE.replace_all(&md, "$1\n\n");
    md.trim_start_matches('\n').trim_end().to_string()
}

/// A child node of an element: text or another element.
enum Child<'a> {
    Text(&'a str),
    El(ElementRef<'a>),
}

fn children(el: ElementRef<'_>) -> Vec<Child<'_>> {
    el.children()
        .filter_map(|n| match n.value().as_text() {
            Some(t) => Some(Child::Text(t)),
            None => ElementRef::wrap(n).map(Child::El),
        })
        .collect()
}

const INLINE_TAGS: &[&str] = &[
    "a", "span", "strong", "b", "em", "i", "u", "s", "del", "strike", "code", "mark", "br", "time", "sup", "sub", "small", "img", "input", "kbd", "label", "abbr", "cite", "q",
];

fn is_inline(el: ElementRef) -> bool {
    let name = el.value().name();
    INLINE_TAGS.contains(&name) && !(name == "span" && has_class(el, "collection-content"))
}

/// `block-color-red` / `block-color-red_background` -> the colour span's (text, background).
fn block_color(el: ElementRef) -> (Option<String>, Option<String>) {
    let mut out = (None, None);
    for c in el.value().classes() {
        let Some(c) = c.strip_prefix("block-color-").or_else(|| c.strip_prefix("highlight-")) else { continue };
        match c.strip_suffix("_background") {
            Some(bg) => out.1 = notion_color(bg).map(str::to_string),
            None => out.0 = notion_color(c).map(str::to_string),
        }
    }
    out
}

/// Code languages as the editor names them.
fn code_language(raw: &str) -> String {
    let l = raw.trim().to_lowercase();
    match l.as_str() {
        "" | "plain text" | "plaintext" | "plain" | "text" | "none" => String::new(),
        "c++" => "cpp".into(),
        "c#" => "csharp".into(),
        "f#" => "fsharp".into(),
        "objective-c" => "objectivec".into(),
        "shell" | "bash" | "sh" | "zsh" => l.clone(),
        "javascript" | "typescript" | "python" | "rust" | "go" | "java" => l.clone(),
        _ => l.chars().filter(|c| !c.is_whitespace()).collect(),
    }
}

/// TeX source of a KaTeX-rendered equation.
fn tex_of(el: ElementRef) -> Option<String> {
    el.descendent_elements()
        .find(|e| e.value().name() == "annotation" && e.attr("encoding") == Some("application/x-tex"))
        .map(|e| text_of(e).trim().to_string())
}

/// Converts one page body; also used for row pages and database descriptions.
pub(super) struct Conv<'a> {
    pub ctx: &'a NotionCtx,
    pub from_dir: &'a str,
    pub me: Option<usize>,
    pub notes: &'a mut Vec<String>,
    /// Block colour inherited from an enclosing block.
    color: (Option<String>, Option<String>),
    /// Inside a table cell, where a wikilink's `|` must be escaped.
    in_table: bool,
}

impl<'a> Conv<'a> {
    pub fn new(ctx: &'a NotionCtx, from_dir: &'a str, me: Option<usize>, notes: &'a mut Vec<String>) -> Self {
        Conv { ctx, from_dir, me, notes, color: (None, None), in_table: false }
    }

    /// The page body (inner HTML of `.page-body`) as editor Markdown.
    pub fn convert(&mut self, body: &str) -> String {
        let frag = Html::parse_fragment(body);
        let blocks = self.blocks(frag.root_element());
        normalize(&render_blocks(&blocks))
    }

    fn base_marks(&self) -> Marks {
        Marks { color: self.color.clone(), ..Default::default() }
    }

    /// Runs `f` with the block colour of `el` (if any) applied to the text inside it.
    fn with_color<T>(&mut self, el: ElementRef, f: impl FnOnce(&mut Self) -> T) -> T {
        let (c, b) = block_color(el);
        let saved = self.color.clone();
        if c.is_some() || b.is_some() {
            self.color = (c.or(saved.0.clone()), b.or(saved.1.clone()));
        }
        let out = f(self);
        self.color = saved;
        out
    }

    // ---------- inline ----------

    fn inline_children(&mut self, el: ElementRef, marks: &Marks, out: &mut Vec<Atom>) {
        for c in children(el) {
            self.inline_child(c, marks, out);
        }
    }

    fn inline_child(&mut self, c: Child, marks: &Marks, out: &mut Vec<Atom>) {
        match c {
            Child::Text(t) => out.push(Atom::Text(t.to_string(), marks.clone())),
            Child::El(e) => self.inline_el(e, marks, out),
        }
    }

    fn inline_el(&mut self, e: ElementRef, marks: &Marks, out: &mut Vec<Atom>) {
        let mut m = marks.clone();
        match e.value().name() {
            "br" => return out.push(Atom::Break),
            "strong" | "b" => m.bold = true,
            "em" | "i" => m.italic = true,
            "s" | "del" | "strike" => m.strike = true,
            "code" | "kbd" => {
                m.code = true;
                m.color = (None, None); // the editor writes colour inside code as literal text
                let text = text_of(e).replace('\n', " ");
                if !text.is_empty() {
                    out.push(Atom::Text(text, m));
                }
                return;
            }
            "img" => {
                if !has_class(e, "icon") {
                    if let Some(src) = e.attr("src") {
                        out.push(Atom::Raw(self.image_md(src, e.attr("alt").unwrap_or(""))));
                    }
                }
                return;
            }
            "input" | "style" | "script" | "svg" => return,
            "time" => {
                let t = text_of(e);
                return out.push(Atom::Text(t.trim().trim_start_matches('@').to_string(), m));
            }
            "a" => return self.link(e, &m, out),
            "span" if has_class(e, "icon") => {
                if let Some(emoji) = e.attr("data-emoji") {
                    out.push(Atom::Text(emoji.to_string(), m));
                    return;
                }
            }
            "span" if e.value().classes().any(|c| c.contains("equation") || c == "katex") => {
                if let Some(tex) = tex_of(e) {
                    m.code = true;
                    m.color = (None, None);
                    out.push(Atom::Text(tex, m));
                }
                return;
            }
            _ => {}
        }
        let (c, b) = block_color(e);
        if c.is_some() {
            m.color.0 = c;
        }
        if b.is_some() {
            m.color.1 = b;
        }
        if e.value().classes().any(|c| c == "highlight-default" || c == "highlight-default_background") {
            m.color = (None, None);
        }
        if m.code {
            m.color = (None, None);
        }
        self.inline_children(e, &m, out);
    }

    /// Text of a link without the icons Notion puts in page links.
    fn link_label(e: ElementRef) -> String {
        let mut s = String::new();
        for c in children(e) {
            match c {
                Child::Text(t) => s.push_str(t),
                Child::El(x) if x.value().name() == "img" || (x.value().name() == "span" && has_class(x, "icon")) => {}
                Child::El(x) => s.push_str(&Self::link_label(x)),
            }
        }
        squash(&s)
    }

    fn link(&mut self, e: ElementRef, m: &Marks, out: &mut Vec<Atom>) {
        let href = e.attr("href").unwrap_or("").trim();
        let mut plain = |this: &mut Self, mut m: Marks, href: Option<String>| {
            m.link = href;
            let mut inner = vec![];
            for c in children(e) {
                match c {
                    Child::El(x) if x.value().name() == "img" && has_class(x, "icon") => {}
                    c => this.inline_child(c, &m, &mut inner),
                }
            }
            out.extend(inner);
        };
        if href.is_empty() || href.starts_with('#') {
            return plain(self, m.clone(), None);
        }
        match self.ctx.resolve(self.from_dir, href) {
            Some(Target::Page(t) | Target::View(t)) => {
                out.push(Atom::Raw(self.ctx.wikilink(t, &Self::link_label(e), self.in_table)));
            }
            Some(Target::Asset(asset)) => plain(self, m.clone(), Some(asset)),
            Some(Target::Missing) => plain(self, m.clone(), None),
            None => plain(self, m.clone(), Some(href.replace(' ', "%20"))),
        }
    }

    fn image_md(&self, src: &str, alt: &str) -> String {
        let (src, name) = match self.ctx.resolve(self.from_dir, src) {
            Some(Target::Asset(a)) => (a, super::percent_decode(super::file_name(src))),
            _ => (src.replace(' ', "%20"), String::new()),
        };
        let alt = if alt.trim().is_empty() { name } else { alt.to_string() };
        let alt: String = alt.chars().filter(|c| !matches!(c, '[' | ']' | '\n')).collect();
        format!("![{}]({src})", alt.trim())
    }

    fn inline_md(&mut self, el: ElementRef, ctx: Ctx) -> String {
        let mut atoms = vec![];
        let base = self.base_marks();
        self.inline_children(el, &base, &mut atoms);
        render_inline(atoms, ctx)
    }

    // ---------- blocks ----------

    /// The blocks inside a container element; loose inline content becomes paragraphs.
    fn blocks(&mut self, el: ElementRef) -> Vec<Block> {
        let mut out = vec![];
        let mut pending: Vec<Child> = vec![];
        for c in children(el) {
            match c {
                Child::El(e) if !is_inline(e) => {
                    self.flush(&mut pending, &mut out);
                    let mut b = self.with_color(e, |this| this.block(e));
                    out.append(&mut b);
                }
                c => pending.push(c),
            }
        }
        self.flush(&mut pending, &mut out);
        out
    }

    fn flush(&mut self, pending: &mut Vec<Child>, out: &mut Vec<Block>) {
        let items = std::mem::take(pending);
        // A database page's link to its own CSV, or an inline database: `<a href="X.csv">`.
        let significant: Vec<&Child> = items
            .iter()
            .filter(|c| match c {
                Child::Text(t) => !t.trim().is_empty(),
                Child::El(e) => e.value().name() != "br",
            })
            .collect();
        if let [Child::El(a)] = significant.as_slice() {
            if a.value().name() == "a" && super::percent_decode(a.attr("href").unwrap_or("")).to_lowercase().ends_with(".csv") {
                out.extend(self.database_embed(Some(*a), None));
                return;
            }
        }
        let mut atoms = vec![];
        let base = self.base_marks();
        for c in items {
            self.inline_child(c, &base, &mut atoms);
        }
        let md = render_inline(atoms, Ctx::Para);
        if !md.is_empty() {
            out.push(paragraph(md));
        }
    }

    fn block(&mut self, e: ElementRef) -> Vec<Block> {
        let name = e.value().name();
        let one = |b: Block| vec![b];
        match name {
            "p" => {
                let md = self.inline_md(e, Ctx::Para);
                if md.is_empty() { vec![] } else { one(paragraph(md)) }
            }
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                let level = name[1..].parse::<usize>().unwrap_or(1);
                let mut atoms = vec![];
                let base = self.base_marks();
                self.inline_children(e, &base, &mut atoms);
                // `### **Domains**` -> `### Domains`: headings are bold anyway.
                if atoms.iter().all(|a| matches!(a, Atom::Text(t, m) if m.bold || t.trim().is_empty())) {
                    for a in &mut atoms {
                        if let Atom::Text(_, m) = a {
                            m.bold = false;
                        }
                    }
                }
                let md = render_inline(atoms, Ctx::Line);
                if md.is_empty() { vec![] } else { one(Block::Other(format!("{} {md}", "#".repeat(level)))) }
            }
            "hr" => one(Block::Other("---".into())),
            "ul" | "ol" if has_class(e, "toggle") => e.child_elements().flat_map(|li| self.blocks(li)).collect(),
            "ul" | "ol" => self.list(e),
            "details" => self.toggle(e),
            "blockquote" => {
                let inner = render_blocks(&self.blocks(e));
                if inner.is_empty() { vec![] } else { one(Block::Other(quote(&inner))) }
            }
            "aside" => self.callout(e),
            "figure" if has_class(e, "callout") => self.callout(e),
            "figure" => self.figure(e),
            "pre" => one(self.code_block(e)),
            "table" => self.table(e).into_iter().collect(),
            "div" if has_class(e, "column-list") => self.columns(e),
            "div" if has_class(e, "collection-content") => self.database_embed(None, Some(e)),
            "div" if has_class(e, "transcription") => self.transcription(e),
            "nav" if has_class(e, "table_of_contents") => vec![], // the editor shows an outline
            "img" => e.attr("src").map(|s| vec![Block::Image(self.image_md(s, e.attr("alt").unwrap_or("")))]).unwrap_or_default(),
            "style" | "script" | "summary" | "header" | "input" => vec![],
            _ => self.blocks(e),
        }
    }

    fn list(&mut self, e: ElementRef) -> Vec<Block> {
        let kind = if has_class(e, "to-do-list") {
            ListKind::Task
        } else if e.value().name() == "ol" {
            ListKind::Ordered
        } else {
            ListKind::Bullet
        };
        let mut n: u32 = e.attr("start").and_then(|s| s.parse().ok()).unwrap_or(1);
        let mut out = vec![];
        for li in e.child_elements() {
            if li.value().name() != "li" {
                out.extend(self.block(li));
                continue;
            }
            let item = self.with_color(li, |this| this.list_item(li, kind, n));
            out.extend(item);
            n += 1;
        }
        out
    }

    fn list_item(&mut self, li: ElementRef, kind: ListKind, start: u32) -> Vec<Block> {
        let mut atoms = vec![];
        let mut children_blocks = vec![];
        let mut checked = false;
        let base = self.base_marks();
        for c in children(li) {
            match c {
                Child::El(e) if e.value().name() == "input" => checked |= e.attr("checked").is_some() || has_class(e, "checkbox-on"),
                Child::El(e) if !is_inline(e) => {
                    if e.value().name() == "p" && atoms.is_empty() && children_blocks.is_empty() {
                        let mut a = vec![];
                        self.inline_children(e, &base, &mut a);
                        atoms = a;
                    } else {
                        let mut b = self.with_color(e, |this| this.block(e));
                        children_blocks.append(&mut b);
                    }
                }
                c => self.inline_child(c, &base, &mut atoms),
            }
        }
        // Children the editor can't nest in a list item.
        children_blocks.retain(|b| !matches!(b, Block::Other(s) if s == "---"));
        let mut text = render_inline(atoms, Ctx::Para);
        if kind == ListKind::Task && text.contains("  \n") {
            // A line break in a to-do item doesn't survive the editor: make paragraphs instead.
            let mut parts = text.split("  \n").map(str::to_string).collect::<Vec<_>>().into_iter();
            let first = parts.next().unwrap_or_default();
            let rest: Vec<Block> = parts.map(Block::Paragraph).collect();
            children_blocks.splice(0..0, rest);
            text = first;
        }
        if text.is_empty() && kind != ListKind::Task {
            return children_blocks; // an empty bullet: keep what's nested under it
        }
        if text.is_empty() && !children_blocks.is_empty() {
            if let Some(Block::Paragraph(_)) = children_blocks.first() {
                if let Block::Paragraph(p) = children_blocks.remove(0) {
                    text = p;
                }
            }
        }
        vec![Block::Item { kind, start, checked, text, children: children_blocks }]
    }

    fn toggle(&mut self, e: ElementRef) -> Vec<Block> {
        let summary = e.child_elements().find(|c| c.value().name() == "summary");
        let title = summary.map_or(String::new(), |s| {
            let heading = s.child_elements().any(|c| matches!(c.value().name(), "h1" | "h2" | "h3" | "h4" | "h5" | "h6"));
            let mut atoms = vec![];
            let mut base = self.base_marks();
            base.bold = heading; // a toggle heading: bold summary
            self.inline_children_deep(s, &base, &mut atoms);
            render_inline(atoms, Ctx::Line)
        });
        let mut body = vec![];
        let mut pending: Vec<Child> = vec![];
        for c in children(e) {
            match c {
                Child::El(x) if x.value().name() == "summary" => {}
                Child::El(x) if !is_inline(x) => {
                    self.flush(&mut pending, &mut body);
                    let mut b = self.with_color(x, |this| this.block(x));
                    body.append(&mut b);
                }
                c => pending.push(c),
            }
        }
        self.flush(&mut pending, &mut body);
        let inner = normalize_inner(&render_blocks(&body));
        let open = if e.attr("open").is_some() { " open" } else { "" };
        vec![Block::Other(format!("<details{open}>\n<summary>{title}</summary>\n\n{inner}\n\n</details>"))]
    }

    /// Inline content of an element whose children may be blocks (a toggle heading's `<h3>`).
    fn inline_children_deep(&mut self, el: ElementRef, marks: &Marks, out: &mut Vec<Atom>) {
        for c in children(el) {
            match c {
                Child::El(x) if !is_inline(x) => {
                    if !out.is_empty() {
                        out.push(Atom::Text(" ".into(), Marks::default()));
                    }
                    self.inline_children_deep(x, marks, out);
                }
                c => self.inline_child(c, marks, out),
            }
        }
    }

    fn callout(&mut self, e: ElementRef) -> Vec<Block> {
        let (text, bg) = block_color(e);
        let color = bg.or(text).unwrap_or_else(|| "gray".into());
        let mut icon = "💡".to_string();
        let saved = std::mem::take(&mut self.color); // the colour is the callout's, not its text's
        let mut body = vec![];
        let kids = children(e);
        // Notion: `<div style="font-size:1.5em"><span class="icon">…</span></div><div>content</div>`.
        let icon_box = kids.iter().position(|c| matches!(c, Child::El(x) if x.value().name() == "div" && x.attr("style").is_some_and(|s| s.contains("font-size")) && icon_in(*x).is_some()));
        let mut pending: Vec<Child> = vec![];
        for (i, c) in kids.into_iter().enumerate() {
            match c {
                Child::El(x) if Some(i) == icon_box => {
                    if let Some(raw) = icon_in(x) {
                        icon = self.icon_value(&raw, true).unwrap_or(icon);
                    }
                }
                Child::El(x) if !is_inline(x) => {
                    self.flush(&mut pending, &mut body);
                    let mut b = self.with_color(x, |this| this.block(x));
                    body.append(&mut b);
                }
                c => pending.push(c),
            }
        }
        self.flush(&mut pending, &mut body);
        self.color = saved;
        // Unlike toggles and columns, the editor doesn't trim a callout's content.
        let inner = render_blocks(&body);
        vec![Block::Other(if inner.is_empty() { format!("> [!{color}] {icon}\n>") } else { format!("> [!{color}] {icon}\n{}", quote(&inner)) })]
    }

    /// A page icon (or callout icon) as the editor stores it.
    pub fn icon_value(&self, raw: &RawIcon, callout: bool) -> Option<String> {
        match raw {
            RawIcon::Emoji(e) => Some(e.clone()),
            RawIcon::Image(src) => {
                if let Some(lucide) = builtin_icon(src) {
                    return Some(lucide);
                }
                if src.contains("/icons/") && src.ends_with(".svg") && callout {
                    return None; // an unmapped built-in icon: keep the callout's default
                }
                match self.ctx.resolve(self.from_dir, src) {
                    Some(Target::Asset(a)) => Some(a),
                    Some(_) => None,
                    None if src.starts_with("http://") || src.starts_with("https://") => Some(src.clone()),
                    None if src.starts_with("/icons/") => Some(format!("https://www.notion.so{src}")),
                    None => None,
                }
            }
        }
    }

    /// A cover: Notion's gallery images and links stay links, uploads are copied into `.assets/`.
    pub fn cover_value(&self, src: &str) -> Option<String> {
        match self.ctx.resolve(self.from_dir, src) {
            Some(Target::Asset(a)) => Some(a),
            Some(_) => None,
            None if src.starts_with("/images/") => Some(format!("https://www.notion.so{src}")),
            None if src.starts_with("http://") || src.starts_with("https://") => Some(src.to_string()),
            None => None,
        }
    }

    fn figure(&mut self, e: ElementRef) -> Vec<Block> {
        let caption = e.child_elements().find(|c| c.value().name() == "figcaption").map(|c| squash(&text_of(c))).unwrap_or_default();
        if has_class(e, "link-to-page") {
            let mut atoms = vec![];
            if let Some(a) = e.child_elements().find(|c| c.value().name() == "a") {
                self.link(a, &self.base_marks(), &mut atoms);
            }
            let md = render_inline(atoms, Ctx::Para);
            return if md.is_empty() { vec![] } else { vec![Block::Paragraph(md)] };
        }
        if has_class(e, "equation") {
            return tex_of(e).map(|t| vec![Block::Other(format!("```latex\n{t}\n```"))]).unwrap_or_default();
        }
        if let Some(img) = e.descendent_elements().find(|x| x.value().name() == "img" && !has_class(*x, "icon") && !has_class(*x, "bookmark-image")) {
            if has_class(e, "image") || e.descendent_elements().all(|x| !has_class(x, "bookmark")) {
                let src = img.attr("src").unwrap_or("");
                // Notion links the image to its full-size file; prefer that.
                let full = img.parent().and_then(ElementRef::wrap).filter(|p| p.value().name() == "a").and_then(|a| a.attr("href")).unwrap_or(src);
                let alt = if caption.is_empty() { img.attr("alt").unwrap_or("") } else { &caption };
                return vec![Block::Image(self.image_md(full, alt))];
            }
        }
        // A bookmark: `<a href="…" class="bookmark source"><div class="bookmark-title">…`.
        if let Some(a) = e.descendent_elements().find(|x| x.value().name() == "a" && has_class(*x, "bookmark")) {
            let href = a.attr("href").unwrap_or("");
            let title = a.descendent_elements().find(|x| has_class(*x, "bookmark-title")).map(|t| squash(&text_of(t))).filter(|t| !t.is_empty()).unwrap_or_else(|| href.to_string());
            let m = Marks { link: Some(href.replace(' ', "%20")), ..self.base_marks() };
            let md = render_inline(vec![Atom::Text(title, m)], Ctx::Para);
            return if md.is_empty() { vec![] } else { vec![Block::Paragraph(md)] };
        }
        // Files and embeds: `<div class="source"><a href="file.pdf">file.pdf</a></div>` or a bare URL.
        if let Some(source) = e.descendent_elements().find(|x| has_class(*x, "source")) {
            let md = self.with_color(source, |this| {
                if source.descendent_elements().any(|x| x.value().name() == "a") {
                    this.inline_md(source, Ctx::Para)
                } else {
                    let url = squash(&text_of(source));
                    let m = Marks { link: Some(url.replace(' ', "%20")), ..this.base_marks() };
                    render_inline(vec![Atom::Text(url, m)], Ctx::Para)
                }
            });
            let mut out = vec![];
            if !md.is_empty() {
                out.push(Block::Paragraph(md));
            }
            if !caption.is_empty() {
                out.push(Block::Paragraph(escape(&caption, Ctx::Para)));
            }
            return out;
        }
        self.blocks(e)
    }

    fn code_block(&mut self, pre: ElementRef) -> Block {
        let code = pre.child_elements().find(|c| c.value().name() == "code");
        let lang = code
            .and_then(|c| c.value().classes().find_map(|k| k.strip_prefix("language-")).map(str::to_string))
            .or_else(|| pre.attr("data-notion-code-syntax").map(str::to_string))
            .unwrap_or_default();
        let text = text_of(code.unwrap_or(pre)).replace("\r\n", "\n");
        let text = text.strip_suffix('\n').unwrap_or(&text);
        Block::Other(format!("```{}\n{text}\n```", code_language(&lang)))
    }

    fn table(&mut self, e: ElementRef) -> Option<Block> {
        let rows: Vec<ElementRef> = e.descendent_elements().filter(|r| r.value().name() == "tr").collect();
        let mut cells: Vec<Vec<String>> = vec![];
        for row in rows {
            let r: Vec<String> = row
                .child_elements()
                .filter(|c| matches!(c.value().name(), "td" | "th"))
                .map(|c| self.with_color(c, |this| this.cell(c)))
                .collect();
            cells.push(r);
        }
        let n = cells.iter().map(Vec::len).max().unwrap_or(0);
        if n == 0 {
            return None;
        }
        let line = |r: &[String]| {
            let mut r = r.to_vec();
            r.resize(n, String::new());
            format!("| {} |", r.join(" | "))
        };
        let mut lines = vec![line(&cells[0]), format!("| {} |", vec!["---"; n].join(" | "))];
        lines.extend(cells[1..].iter().map(|r| line(r)));
        Some(Block::Table(pad_tables(&lines.join("\n"))))
    }

    fn cell(&mut self, c: ElementRef) -> String {
        let mut atoms = vec![];
        let base = self.base_marks();
        self.in_table = true;
        self.cell_atoms(c, &base, &mut atoms);
        self.in_table = false;
        render_inline(atoms, Ctx::Cell)
    }

    /// Inline content of a table cell; blocks inside it are separated by line breaks.
    fn cell_atoms(&mut self, el: ElementRef, marks: &Marks, out: &mut Vec<Atom>) {
        for c in children(el) {
            match c {
                Child::El(x) if !is_inline(x) => {
                    if !out.is_empty() {
                        out.push(Atom::Break);
                    }
                    self.cell_atoms(x, marks, out);
                }
                c => self.inline_child(c, marks, out),
            }
        }
    }

    fn columns(&mut self, e: ElementRef) -> Vec<Block> {
        let mut cols: Vec<String> = vec![];
        let mut flat: Vec<Block> = vec![];
        for col in e.child_elements() {
            let blocks = self.with_color(col, |this| this.blocks(col));
            let md = normalize_inner(&render_blocks(&blocks));
            if !md.is_empty() {
                cols.push(md);
                flat.extend(blocks);
            }
        }
        if cols.len() < 2 {
            return flat;
        }
        let inner = cols.iter().map(|c| format!("<div class=\"column\">\n\n{c}\n\n</div>")).collect::<Vec<_>>().join("\n");
        vec![Block::Other(format!("<div class=\"columns\">\n{inner}\n</div>"))]
    }

    /// An inline database (`div.collection-content`) or a link to a database's CSV.
    fn database_embed(&mut self, link: Option<ElementRef>, view: Option<ElementRef>) -> Vec<Block> {
        let title = view
            .and_then(|v| v.descendent_elements().find(|x| has_class(*x, "collection-title")))
            .map(|t| squash(&text_of(t)))
            .unwrap_or_default();
        let link = link.or_else(|| view.and_then(|v| v.descendent_elements().find(|x| x.value().name() == "a" && x.attr("href").is_some_and(|h| h.to_lowercase().ends_with(".csv")))));
        let target = match link.and_then(|a| a.attr("href")) {
            Some(href) => self.ctx.resolve(self.from_dir, href),
            None => {
                // Older exports list the rows instead: find the database those rows belong to.
                let rows = view.into_iter().flat_map(|v| v.descendent_elements()).filter_map(|x| x.attr("href").filter(|_| x.value().name() == "a"));
                let mut found = None;
                for href in rows {
                    if let Some(Target::Page(r)) = self.ctx.resolve(self.from_dir, href) {
                        found = self.ctx.database_of_row(r);
                        if found.is_some() {
                            break;
                        }
                    }
                }
                found.or_else(|| self.ctx.database_titled(&title)).map(Target::Page).or(Some(Target::Missing))
            }
        };
        match target {
            Some(Target::Page(t) | Target::View(t)) if Some(t) == self.me => vec![],
            Some(Target::Page(t) | Target::View(t)) if self.ctx.is_database(t) => vec![Block::Other(format!("![[{}]]", self.ctx.link_target(t)))],
            Some(Target::Page(t) | Target::View(t)) => vec![Block::Paragraph(self.ctx.wikilink(t, "", false))],
            _ => {
                let page = self.me.map_or(String::new(), |m| crate::vault::title_of(&self.ctx.pages[m].rel));
                let label = if title.is_empty() { link.map(|a| squash(&text_of(a))).unwrap_or_default() } else { title };
                self.notes.push(format!("{page}: a linked database that isn't in the export (“{label}”)"));
                vec![]
            }
        }
    }

    /// Notion AI meeting notes: `div.transcription` with a "Summary" / "Notes" header.
    fn transcription(&mut self, e: ElementRef) -> Vec<Block> {
        let mut kids = e.child_elements();
        let header = kids.next();
        let title = header.filter(|h| h.value().name() == "div").map(|h| squash(&text_of(h))).unwrap_or_default();
        let mut body = vec![];
        for (i, c) in e.child_elements().enumerate() {
            if i == 0 && !title.is_empty() {
                continue;
            }
            let mut b = self.with_color(c, |this| this.block(c));
            body.append(&mut b);
        }
        let inner = normalize_inner(&render_blocks(&body));
        if title.is_empty() {
            return body;
        }
        vec![Block::Other(format!("<details open>\n<summary>{}</summary>\n\n{inner}\n\n</details>", escape(&title, Ctx::Line)))]
    }
}

/// A paragraph; a lone `-` would read back as an empty bullet, which the editor writes as `- `.
fn paragraph(md: String) -> Block {
    if md == "-" || md == "+" { Block::Paragraph("- ".into()) } else { Block::Paragraph(md) }
}

/// A container's content as the editor writes it (`renderChildren(…).trim()`).
fn normalize_inner(s: &str) -> String {
    s.trim().to_string()
}

impl NotionCtx {
    /// The database a row page belongs to (its folder is the database's).
    pub(super) fn database_of_row(&self, row: usize) -> Option<usize> {
        let dir = super::parent_dir(&self.pages[row].key);
        (0..self.pages.len()).find(|&i| self.is_database(i) && self.pages[i].key.eq_ignore_ascii_case(dir))
    }

    /// The only database with this title, if there is exactly one.
    pub(super) fn database_titled(&self, title: &str) -> Option<usize> {
        let mut found = (0..self.pages.len()).filter(|&i| self.is_database(i) && !title.is_empty() && self.pages[i].title == title);
        let first = found.next()?;
        found.next().is_none().then_some(first)
    }
}

/// Database columns typed from the row pages' property tables: (type, option colours).
pub(super) fn property_hints(props: &[&HtmlProp]) -> HashMap<String, (String, HashMap<String, String>)> {
    let mut hints: HashMap<String, (String, HashMap<String, String>)> = HashMap::new();
    for p in props {
        let entry = hints.entry(p.name.clone()).or_insert_with(|| (p.kind.clone(), HashMap::new()));
        for (name, color) in &p.options {
            entry.1.entry(name.clone()).or_insert_with(|| color.clone());
        }
    }
    hints
}

/// The Betelgeuse property type for a Notion property type; `None` = work it out from the values.
pub(super) fn property_type(notion: &str) -> Option<&'static str> {
    Some(match notion {
        "text" | "phone_number" | "relation" => "text",
        "number" => "number",
        "select" => "select",
        "status" => "status",
        "multi_select" => "multi_select",
        "date" | "created_time" | "last_edited_time" => "date",
        "checkbox" => "checkbox",
        "url" => "url",
        "email" => "email",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> NotionCtx {
        NotionCtx::empty()
    }

    fn md(html: &str) -> String {
        let ctx = ctx();
        let mut notes = vec![];
        Conv::new(&ctx, "", None, &mut notes).convert(html)
    }

    #[test]
    fn maps_notion_icons_to_lucide() {
        assert_eq!(builtin_icon("https://app.notion.com/icons/globe_pink.svg").as_deref(), Some("lucide:Globe:pink"));
        assert_eq!(builtin_icon("https://www.notion.so/icons/book-closed_green.svg").as_deref(), Some("lucide:Book:green"));
        assert_eq!(builtin_icon("/icons/video-game_gray.svg").as_deref(), Some("lucide:Gamepad2:gray"));
        assert_eq!(builtin_icon("https://app.notion.com/icons/pencil_lightgray.svg").as_deref(), Some("lucide:Pencil:gray"));
        assert_eq!(builtin_icon("https://app.notion.com/icons/checklist_orange.svg?mode=light").as_deref(), Some("lucide:ListChecks:orange"));
        assert_eq!(builtin_icon("https://app.notion.com/icons/notion_gray.svg"), None, "unmapped");
        assert_eq!(builtin_icon("https://example.com/logo.svg"), None);
        assert_eq!(notion_color("teal"), Some("green"));
        // No duplicate Notion names in the table.
        let mut names: Vec<&str> = NOTION_ICONS.iter().map(|(n, _)| *n).collect();
        names.sort();
        let len = names.len();
        names.dedup();
        assert_eq!(names.len(), len);
    }

    #[test]
    fn icons_and_covers_resolve() {
        let ctx = ctx();
        let mut notes = vec![];
        let conv = Conv::new(&ctx, "", None, &mut notes);
        assert_eq!(conv.icon_value(&RawIcon::Emoji("👋".into()), false).as_deref(), Some("👋"));
        assert_eq!(conv.icon_value(&RawIcon::Image("https://app.notion.com/icons/gear_purple.svg".into()), false).as_deref(), Some("lucide:Settings:purple"));
        assert_eq!(conv.icon_value(&RawIcon::Image("https://app.notion.com/icons/notion_gray.svg".into()), false).as_deref(), Some("https://app.notion.com/icons/notion_gray.svg"));
        assert_eq!(conv.icon_value(&RawIcon::Image("https://app.notion.com/icons/notion_gray.svg".into()), true), None);
        assert_eq!(conv.cover_value("https://www.notion.so/images/page-cover/gradients_2.png").as_deref(), Some("https://www.notion.so/images/page-cover/gradients_2.png"));
    }

    #[test]
    fn reads_page_metadata() {
        let page = parse_page(concat!(
            r#"<html><head><title>T</title></head><body><article class="page sans"><header>"#,
            r#"<img class="page-cover-image" src="https://www.notion.so/images/page-cover/solid_red.png"/>"#,
            r#"<div class="page-header-icon"><span class="icon" data-emoji="🚀"></span></div><h1 class="page-title">Launch &amp; more</h1>"#,
            r#"<p class="page-description"></p><table class="properties"><tbody>"#,
            r#"<tr class="property-row property-row-status"><th><span class="icon property-icon"><img src="https://www.notion.so/icons/burst_gray.svg"/></span>Status</th><td><span class="status-value select-value-color-green"><div class="status-dot status-dot-color-green"></div>Done</span></td></tr>"#,
            r#"<tr class="property-row property-row-multi_select"><th>Tags</th><td><span class="selected-value select-value-color-teal">A</span><span class="selected-value select-value-color-default">B</span></td></tr>"#,
            r#"<tr class="property-row property-row-checkbox"><th>Done</th><td><div class="checkbox checkbox-on"></div></td></tr>"#,
            r#"<tr class="property-row property-row-date"><th>Due</th><td><time datetime="2026-03-29">March 29, 2026</time></td></tr>"#,
            r#"<tr class="property-row property-row-relation"><th>Project</th><td><a href="x.html">One</a><a href="y.html">Two</a></td></tr>"#,
            r#"<tr class="property-row property-row-status"><th>Stage</th><td><span class="status-value"><div class="status-dot"></div>To Do</span></td></tr>"#,
            r#"</tbody></table></header><div class="page-body"><p>Body</p></div></article></body></html>"#
        ));
        assert_eq!(page.title, "Launch & more");
        assert_eq!(page.icon, Some(RawIcon::Emoji("🚀".into())));
        assert_eq!(page.cover.as_deref(), Some("https://www.notion.so/images/page-cover/solid_red.png"));
        let p = |n: &str| page.props.iter().find(|p| p.name == n).unwrap().clone();
        assert_eq!((p("Status").kind.as_str(), p("Status").value.as_str()), ("status", "Done"));
        assert_eq!(p("Status").options, vec![("Done".to_string(), "green".to_string())]);
        assert_eq!(p("Tags").value, "A, B");
        assert_eq!(p("Tags").options[0].1, "green");
        assert_eq!(p("Tags").options[1].1, "default");
        assert_eq!(p("Done").value, "Yes");
        assert_eq!(p("Due").value, "March 29, 2026");
        assert_eq!(p("Project").value, "One, Two");
        assert_eq!(p("Stage").options, vec![("To Do".to_string(), "default".to_string())]);
        assert_eq!(page.body, "<p>Body</p>");
        let builtin = parse_page(r#"<article><header><div class="page-header-icon"><img class="icon notion-static-icon" src="https://app.notion.com/icons/globe_pink.svg"/></div><h1 class="page-title">X</h1></header><div class="page-body"></div></article>"#);
        assert_eq!(builtin.icon, Some(RawIcon::Image("https://app.notion.com/icons/globe_pink.svg".into())));
    }

    #[test]
    fn text_colours_and_highlights() {
        assert_eq!(md(r#"<p>Some <mark class="highlight-red">red <strong>bold</strong></mark> and <mark class="highlight-yellow_background">marked</mark>.</p>"#), r#"Some <span data-color="red">red **bold**</span> and <span data-bg="yellow">marked</span>."#);
        // Notion's "teal" is green; bold goes outside the colour, as the editor writes it.
        assert_eq!(md(r#"<p><mark class="highlight-teal"><strong>Desktop</strong></mark></p>"#), r#"**<span data-color="green">Desktop</span>**"#);
        // Block colours colour the block's text.
        assert_eq!(md(r#"<p class="block-color-blue">Blue line</p><h2 class="block-color-red_background">Head</h2>"#), "<span data-color=\"blue\">Blue line</span>\n\n## <span data-bg=\"red\">Head</span>");
        assert_eq!(md(r#"<p class="block-color-gray">a <mark class="highlight-red">b</mark></p>"#), r#"<span data-color="gray">a</span> <span data-color="red">b</span>"#);
        assert_eq!(md(r#"<p><mark class="highlight-default">plain</mark></p>"#), "plain");
    }

    #[test]
    fn inline_formatting() {
        assert_eq!(md("<p><strong>bold </strong>then <em>it</em> <del>gone</del> <code>a_b</code> a_b [x] 1 &lt; 2</p>"), "**bold** then *it* ~~gone~~ `a_b` a\\_b \\[x\\] 1 &lt; 2");
        assert_eq!(md("<p><strong>bold <em>both</em> bold</strong></p>"), "**bold *both* bold**");
        assert_eq!(md(r#"<p><a href="https://a.b/c d"><strong>link</strong></a> and <strong><a href="https://x.y">x</a></strong></p>"#), "[**link**](https://a.b/c%20d) and [**x**](https://x.y)");
        assert_eq!(md("<p>one<br/>two\nthree <br/></p>"), "one  \ntwo  \nthree");
        assert_eq!(md("<p><strong>a <br/></strong>b</p>"), "**a**  \nb");
        assert_eq!(md("<p><time>@May 6, 2026</time> with <span class=\"user\">@Ada</span></p>"), "May 6, 2026 with @Ada");
        assert_eq!(md("<p>\n</p><p>  </p>"), "");
    }

    #[test]
    fn bare_urls_and_emails_become_links() {
        assert_eq!(md("<p>see https://a.b/c_d. and www.x.com, mail a.b@c.co.</p>"), "see [https://a.b/c\\_d](https://a.b/c_d). and [www.x.com](http://www.x.com), mail [a.b@c.co](mailto:a.b@c.co).");
        assert_eq!(md("<p>x https://a.b/(p)) y</p>"), "x [https://a.b/(p)](https://a.b/(p))) y");
        assert_eq!(md(r#"<p><a href="https://a.b">https://a.b</a> and <code>https://c.d</code></p>"#), "[https://a.b](https://a.b) and `https://c.d`");
        assert_eq!(backpedal("https://a.b/x?y=1&amp;"), "https://a.b/x?y=1");
        assert_eq!(email_at("a@b"), None);
        assert_eq!(md("<p>-</p><p>x</p>"), "- \n\nx");
    }

    #[test]
    fn lists_and_todos() {
        let html = concat!(
            r#"<ul class="bulleted-list"><li>one<ul class="bulleted-list"><li>nested</li></ul></li></ul><ul class="bulleted-list"><li>two</li></ul>"#,
            r#"<ol type="1" class="numbered-list" start="1"><li>first</li></ol><ol type="1" class="numbered-list" start="2"><li>second<ol type="a" class="numbered-list" start="1"><li>inner</li></ol></li></ol>"#,
            r#"<ul class="to-do-list"><li><input type="checkbox" class="checkbox checkbox-on" checked=""/> <span class="to-do-children-checked">done</span><div class="indented"><ul class="to-do-list"><li><input type="checkbox" class="checkbox checkbox-off"/> <span class="to-do-children-unchecked">sub</span><div class="indented"></div></li></ul></div></li></ul>"#,
            r#"<ul class="to-do-list"><li><input type="checkbox" class="checkbox checkbox-off"/> <span class="to-do-children-unchecked"></span><div class="indented"></div></li></ul>"#,
            r#"<ul class="bulleted-list"><li>after</li></ul>"#,
        );
        assert_eq!(md(html), "- one\n  - nested\n- two\n\n1. first\n2. second\n   1. inner\n\n- [x] done\n  - [ ] sub\n- [ ] \n\n- after");
        // A paragraph nested under an item sits after a blank line; a to-do's line break too.
        assert_eq!(md(r#"<ul class="bulleted-list"><li>a<div class="indented"><p>b</p></div></li></ul>"#), "- a\n\n  b");
        assert_eq!(md(r#"<ul class="to-do-list"><li><input type="checkbox"/> <span>a<br/>b</span></li></ul>"#), "- [ ] a\n\n  b");
        assert_eq!(md(r#"<ul class="bulleted-list"><li>a<br/>b</li></ul>"#), "- a  \nb");
        // Empty bullets disappear; their children stay.
        assert_eq!(md(r#"<ul class="bulleted-list"><li></li></ul><ul class="bulleted-list"><li><ul class="bulleted-list"><li>child</li></ul></li></ul>"#), "- child");
    }

    #[test]
    fn callouts() {
        assert_eq!(
            md(r#"<aside class="block-color-blue_background callout"><div style="width:100%"><p>Control center.</p></div></aside>"#),
            "> [!blue] 💡\n> Control center."
        );
        assert_eq!(
            md(r#"<aside class="block-color-teal_background callout"><div style="font-size:1.5em"><span class="icon" data-emoji="✏️"></span></div><div style="width:100%">Your <strong>space</strong>.</div></aside>"#),
            "> [!green] ✏️\n> Your **space**."
        );
        assert_eq!(
            md(r#"<aside class="block-color-gray_background callout"><div style="font-size:1.5em"><img class="icon notion-static-icon" src="https://app.notion.com/icons/bell_yellow.svg"/></div><div style="width:100%"><h1>Title</h1><ul class="bulleted-list"><li>x</li></ul></div></aside>"#),
            "> [!gray] lucide:Bell:yellow\n> # Title\n>\n> - x"
        );
        // Older exports: `figure.callout`, the emoji as text.
        assert_eq!(md(r#"<figure class="block-color-red callout"><div style="font-size:1.5em"><span class="icon">⚠️</span></div><div style="width:100%">Careful</div></figure>"#), "> [!red] ⚠️\n> Careful");
        assert_eq!(md(r#"<aside class="callout"><div style="width:100%"></div></aside>"#), "> [!gray] 💡\n>");
    }

    #[test]
    fn toggles() {
        assert_eq!(
            md(r#"<details open="" class="toggle"><summary>Tips <mark class="highlight-gray">here</mark></summary><div class="indented"><p>Hidden <strong>text</strong>.</p></div></details>"#),
            "<details open>\n<summary>Tips <span data-color=\"gray\">here</span></summary>\n\nHidden **text**.\n\n</details>"
        );
        // Toggle headings: the heading is the (bold) summary.
        assert_eq!(
            md(r#"<details open=""><summary style="font-weight:600"><h3 style="display:inline-block">Phase 1 &amp; 2</h3></summary><div class="indented"><ul class="to-do-list"><li><input type="checkbox" checked=""/> <span>Init <code>x</code>.</span></li></ul></div></details>"#),
            "<details open>\n<summary>**Phase 1 &amp; 2**</summary>\n\n- [x] Init `x`.\n\n</details>"
        );
        // Older exports: `ul.toggle > li > details`, children right inside it; empty toggles.
        assert_eq!(md(r#"<ul class="toggle"><li><details><summary>More</summary><p>a</p><p>b</p></details></li></ul>"#), "<details>\n<summary>More</summary>\n\na\n\nb\n\n</details>");
        assert_eq!(md(r#"<details><summary>Empty</summary><div class="indented"></div></details>"#), "<details>\n<summary>Empty</summary>\n\n\n\n</details>");
    }

    #[test]
    fn columns() {
        assert_eq!(
            md(r#"<div class="column-list"><div class="column"><p>Left</p></div><div class="column"><ul class="bulleted-list"><li>right</li></ul></div></div>"#),
            "<div class=\"columns\">\n<div class=\"column\">\n\nLeft\n\n</div>\n<div class=\"column\">\n\n- right\n\n</div>\n</div>"
        );
        // A column-list with one non-empty column is just its content.
        assert_eq!(md(r#"<div class="column-list"><div class="column"><p>Only</p></div><div class="column"><p> </p></div></div>"#), "Only");
    }

    #[test]
    fn simple_tables() {
        let html = concat!(
            r#"<table class="simple-table"><thead class="simple-table-header"><tr><th class="block-color-gray_background simple-table-header">Products</th><th class="simple-table-header">Links</th></tr></thead>"#,
            r#"<tbody><tr><td><mark class="highlight-teal"><strong>Desktop</strong></mark><br/><br/><strong>The control center. <br/></strong>Built for devs.</td><td><a href="https://a.b">site</a> | x</td></tr>"#,
            r#"<tr><td></td><td><code>a|b</code></td></tr></tbody></table>"#,
        );
        let expected = [
            r#"| <span data-bg="gray">Products</span> | Links |"#,
            r#"| --- | --- |"#,
            r#"| **<span data-color="green">Desktop</span>**<br><br>**The control center.**<br>Built for devs. | [site](https://a.b) \| x |"#,
            r#"|  | `a\|b` |"#,
        ];
        assert_eq!(md(html), pad_tables(&expected.join("\n")));
        assert!(md(html).starts_with("| <span data-bg=\"gray\">Products</span>      "));
    }

    #[test]
    fn code_quotes_dividers_headings() {
        assert_eq!(
            md(r#"<pre class="code" data-notion-code-syntax="jsx"><code class="language-jsx">ls ~/.claude
  &lt;x&gt;</code></pre><blockquote>Let's <em>go</em>.<br/>Now.</blockquote><hr/><h1>H1</h1><h4>Small</h4>"#),
            "```jsx\nls ~/.claude\n  <x>\n```\n\n> Let's *go*.  \n> Now.\n\n---\n\n# H1\n\n#### Small"
        );
        assert_eq!(md(r#"<pre class="code"><code class="language-Plain Text">plain</code></pre>"#), "```\nplain\n```");
        assert_eq!(md("<h3><strong>Domains</strong></h3><h2><strong>A</strong> and B</h2>"), "### Domains\n\n## **A** and B");
        assert_eq!(md(r#"<pre class="code"><code class="language-C++">x</code></pre>"#), "```cpp\nx\n```");
    }

    #[test]
    fn images_bookmarks_files_and_equations() {
        assert_eq!(md(r#"<figure class="image"><a href="https://x.y/a.png"><img src="https://x.y/a.png"/></a><figcaption>Cap [1]</figcaption></figure>"#), "![Cap 1](https://x.y/a.png)");
        assert_eq!(
            md(r#"<figure><a href="https://x.y" class="bookmark source"><div class="bookmark-info"><div class="bookmark-text"><div class="bookmark-title">X site</div></div></div></a></figure>"#),
            "[X site](https://x.y)"
        );
        assert_eq!(md(r#"<figure><div class="source">https://www.figma.com/design/x</div></figure>"#), "[https://www.figma.com/design/x](https://www.figma.com/design/x)");
        assert_eq!(
            md(r#"<figure class="equation"><div class="equation-container"><span class="katex"><annotation encoding="application/x-tex">x^2</annotation></span></div></figure><p>Inline <span class="notion-text-equation-token"><span class="katex"><annotation encoding="application/x-tex">a_b</annotation></span></span>.</p>"#),
            "```latex\nx^2\n```\n\nInline `a_b`."
        );
        assert_eq!(md(r##"<nav class="table_of_contents"><div><a href="#x">Heading</a></div></nav><p>after</p>"##), "after");
    }

    #[test]
    fn images_in_list_items_join_the_paragraph() {
        assert_eq!(md(r#"<ul class="bulleted-list"><li>a<figure class="image"><img src="https://x.y/a.png"/></figure></li></ul>"#), "- a\n![](https://x.y/a.png)");
    }

    #[test]
    fn tables_inside_containers_get_blank_lines_like_the_editor() {
        let t = r#"<table class="simple-table"><tbody><tr><td>x</td></tr><tr><td>y</td></tr></tbody></table>"#;
        assert_eq!(md(t), "| x   |\n| --- |\n| y   |");
        assert_eq!(md(&format!(r#"<aside class="callout"><div style="width:100%"><p>a</p>{t}</div></aside>"#)), "> [!gray] 💡\n> a\n>\n>\n> | x   |\n> | --- |\n> | y   |\n>");
        assert_eq!(md(&format!(r#"<p>a</p>{t}<p>b</p>"#)), "a\n\n| x   |\n| --- |\n| y   |\n\nb");
    }

    #[test]
    fn meeting_notes() {
        assert_eq!(
            md(r#"<div class="transcription"><div style="border-bottom:0.05em solid">Summary<br/></div><h3>Topic</h3><ul class="bulleted-list"><li>point</li></ul></div>"#),
            "<details open>\n<summary>Summary</summary>\n\n### Topic\n\n- point\n\n</details>"
        );
    }
}
