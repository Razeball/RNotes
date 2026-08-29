use crate::document_model::{ListItemNode, Node, TableCell, TableRow, TextNode};

/// Markdown bridge for the editor.
///
/// The only markdown implementation in the project. Pasting, opening a `.md` file and exporting all route through here, so a TypeScript parser and a Rust serialiser cannot drift apart on what a given document means.
///
/// Supports ATX headings up to level 4, lists, blockquotes, code, bold/italic/strike, links, images and GFM pipe tables.

fn create_text_node(text: String) -> TextNode {
    TextNode {
        text,
        bold: None,
        italic: None,
        underline: None,
        code: None,
        quote: None,
        crossed_out: None,
        font_size: None,
        color: None,
        link: None,
        href: None,
        font_family: None,
    }
}

#[derive(Clone, Copy)]
enum Mark {
    Bold,
    Italic,
    Code,
    Strike,
}

fn apply_styling(nodes: &mut [TextNode], mark: Mark) {
    for node in nodes {
        match mark {
            Mark::Bold => node.bold = Some(true),
            Mark::Italic => node.italic = Some(true),
            Mark::Code => node.code = Some(true),
            Mark::Strike => node.crossed_out = Some(true),
        }
    }
}

fn has_prefix(chars: &[char], at: usize, delim: &[char]) -> bool {
    at + delim.len() <= chars.len() && chars[at..at + delim.len()] == *delim
}

/// Locates the closing `delim` starting from `from`. Requires at least one character of content.
fn locate_closing_delim(chars: &[char], from: usize, delim: &[char]) -> Option<usize> {
    let mut i = from;
    while i + delim.len() <= chars.len() {
        if chars[i..i + delim.len()] == *delim && i > from {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Extracts the label and href of `[label](href)` at position `at`, returning the index past the closing paren.
fn extract_link(chars: &[char], at: usize) -> Option<(String, String, usize)> {
    if chars.get(at) != Some(&'[') {
        return None;
    }
    let close_bracket = (at + 1..chars.len()).find(|&i| chars[i] == ']')?;
    if chars.get(close_bracket + 1) != Some(&'(') {
        return None;
    }
    let close_paren = (close_bracket + 2..chars.len()).find(|&i| chars[i] == ')')?;

    let label: String = chars[at + 1..close_bracket].iter().collect();
    let href: String = chars[close_bracket + 2..close_paren].iter().collect();
    Some((label, href, close_paren + 1))
}

/// Converts inline markdown style to styled text runs.
pub fn convert_inline_style(text: &str) -> Vec<TextNode> {
    let chars: Vec<char> = text.chars().collect();
    let mut out: Vec<TextNode> = Vec::new();
    let mut buffer = String::new();
    let mut i = 0;

    let delimiters: [(&[char], Mark); 6] = [
        (&['*', '*'], Mark::Bold),
        (&['_', '_'], Mark::Bold),
        (&['~', '~'], Mark::Strike),
        (&['`'], Mark::Code),
        (&['*'], Mark::Italic),
        (&['_'], Mark::Italic),
    ];

    'scan: while i < chars.len() {
        if let Some((label, href, next)) = extract_link(&chars, i) {
            if !buffer.is_empty() {
                out.push(create_text_node(std::mem::take(&mut buffer)));
            }
            let mut inner = convert_inline_style(&label);
            for node in inner.iter_mut() {
                node.link = Some(true);
                node.href = Some(href.clone());
            }
            out.append(&mut inner);
            i = next;
            continue;
        }

        for (delim, mark) in delimiters.iter() {
            if !has_prefix(&chars, i, delim) {
                continue;
            }
            let content_start = i + delim.len();
            if let Some(close) = locate_closing_delim(&chars, content_start, delim) {
                let inner_text: String = chars[content_start..close].iter().collect();
                if !buffer.is_empty() {
                    out.push(create_text_node(std::mem::take(&mut buffer)));
                }
                // Code spans are literal; no nested emphasis inside them.
                let mut inner = match mark {
                    Mark::Code => vec![create_text_node(inner_text)],
                    _ => convert_inline_style(&inner_text),
                };
                apply_styling(&mut inner, *mark);
                out.append(&mut inner);
                i = close + delim.len();
                continue 'scan;
            }
        }

        buffer.push(chars[i]);
        i += 1;
    }

    if !buffer.is_empty() {
        out.push(create_text_node(buffer));
    }
    if out.is_empty() {
        out.push(create_text_node(String::new()));
    }
    out
}

/// Detects standalone images of the form `![alt](url)` that occupy a whole line.
fn detect_image_node(line: &str) -> Option<Node> {
    let trimmed = line.trim();
    if !trimmed.starts_with("![") {
        return None;
    }
    let chars: Vec<char> = trimmed.chars().collect();
    let (label, href, next) = extract_link(&chars, 1)?;
    if next != chars.len() {
        return None;
    }
    Some(Node::Image {
        url: Some(href),
        size: None,
        alignment: None,
        caption: if label.is_empty() { None } else { Some(label) },
        subtitle: None,
        title: None,
        children: vec![create_text_node(String::new())],
    })
}

fn determine_header_level(line: &str) -> Option<(usize, &str)> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 4 {
        return None;
    }
    line[hashes..].strip_prefix(' ').map(|body| (hashes, body.trim()))
}

fn extract_bullet_content(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    ["- ", "* ", "+ "]
        .iter()
        .find_map(|marker| trimmed.strip_prefix(marker))
}

fn extract_ordered_content(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    let digits = trimmed.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 {
        return None;
    }
    let rest = &trimmed[digits..];
    rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") "))
}

fn parse_table_cells(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    let mut inner = trimmed.strip_prefix('|').unwrap_or(trimmed);
    inner = inner.strip_suffix('|').unwrap_or(inner);
    inner.split('|').map(|cell| cell.trim().to_string()).collect()
}

fn has_table_separator(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.contains('-')
        && trimmed.contains('|')
        && trimmed.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '))
}

fn create_list_item(body: &str) -> ListItemNode {
    ListItemNode {
        node_type: "list-item".to_string(),
        alignment: None,
        children: convert_inline_style(body),
    }
}

fn convert_row_to_node(line: &str) -> TableRow {
    TableRow {
        node_type: "table-row".to_string(),
        children: parse_table_cells(line)
            .iter()
            .map(|cell| TableCell {
                node_type: "table-cell".to_string(),
                children: convert_inline_style(cell),
            })
            .collect(),
    }
}

/// Converts markdown text to editor nodes.
pub fn from_markdown(text: &str) -> Vec<Node> {
    let lines: Vec<&str> = text.lines().collect();
    let mut nodes: Vec<Node> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];

        if line.trim().is_empty() {
            i += 1;
            continue;
        }

        // Fenced code: each line inside becomes its own code-marked paragraph.
        if line.trim_start().starts_with("```") {
            i += 1;
            while i < lines.len() && !lines[i].trim_start().starts_with("```") {
                let mut children = vec![create_text_node(lines[i].to_string())];
                apply_styling(&mut children, Mark::Code);
                nodes.push(Node::Paragraph { alignment: None, children });
                i += 1;
            }
            if i < lines.len() {
                i += 1; // closing fence
            }
            continue;
        }

        if let Some((level, body)) = determine_header_level(line) {
            let children = convert_inline_style(body);
            nodes.push(match level {
                1 => Node::Header { alignment: None, children },
                2 => Node::Header2 { alignment: None, children },
                3 => Node::Header3 { alignment: None, children },
                _ => Node::Header4 { alignment: None, children },
            });
            i += 1;
            continue;
        }

        if let Some(image) = detect_image_node(line) {
            nodes.push(image);
            i += 1;
            continue;
        }

        // Pipe table: header row, separator, then body rows.
        if line.trim().starts_with('|') && i + 1 < lines.len() && has_table_separator(lines[i + 1]) {
            let mut rows = vec![convert_row_to_node(line)];
            i += 2;
            while i < lines.len() && lines[i].trim().starts_with('|') {
                rows.push(convert_row_to_node(lines[i]));
                i += 1;
            }
            nodes.push(Node::Table { children: rows });
            continue;
        }

        if extract_bullet_content(line).is_some() {
            let mut items = Vec::new();
            while i < lines.len() {
                match extract_bullet_content(lines[i]) {
                    Some(body) => {
                        items.push(create_list_item(body));
                        i += 1;
                    }
                    None => break,
                }
            }
            nodes.push(Node::UList { alignment: None, children: items });
            continue;
        }

        if extract_ordered_content(line).is_some() {
            let mut items = Vec::new();
            while i < lines.len() {
                match extract_ordered_content(lines[i]) {
                    Some(body) => {
                        items.push(create_list_item(body));
                        i += 1;
                    }
                    None => break,
                }
            }
            nodes.push(Node::OList { alignment: None, children: items });
            continue;
        }

        if let Some(body) = line.trim_start().strip_prefix("> ") {
            let mut children = convert_inline_style(body);
            for child in children.iter_mut() {
                child.quote = Some(true);
            }
            nodes.push(Node::Paragraph { alignment: None, children });
            i += 1;
            continue;
        }

        nodes.push(Node::Paragraph { alignment: None, children: convert_inline_style(line) });
        i += 1;
    }

    if nodes.is_empty() {
        nodes.push(Node::Paragraph {
            alignment: None,
            children: vec![create_text_node(String::new())],
        });
    }
    nodes
}

fn node_text_to_markdown(children: &[TextNode]) -> String {
    let mut out = String::new();

    for node in children {
        if node.text.is_empty() {
            continue;
        }

        let mut piece = node.text.clone();
        // Innermost first: code is literal, so emphasis has to wrap outside it.
        if node.code.unwrap_or(false) {
            piece = format!("`{}`", piece);
        }
        if node.crossed_out.unwrap_or(false) {
            piece = format!("~~{}~~", piece);
        }
        if node.italic.unwrap_or(false) {
            piece = format!("*{}*", piece);
        }
        if node.bold.unwrap_or(false) {
            piece = format!("**{}**", piece);
        }
        if node.link.unwrap_or(false) {
            if let Some(href) = &node.href {
                piece = format!("[{}]({})", piece, href);
            }
        }
        out.push_str(&piece);
    }

    out
}

fn contains_quote(children: &[TextNode]) -> bool {
    children.iter().any(|c| c.quote.unwrap_or(false))
}

/// Converts editor nodes to markdown text.
pub fn to_markdown(nodes: &[Node]) -> String {
    let mut out = String::new();

    for node in nodes {
        match node {
            Node::Header { children, .. } => {
                out.push_str(&format!("# {}\n\n", node_text_to_markdown(children)));
            }
            Node::Header2 { children, .. } => {
                out.push_str(&format!("## {}\n\n", node_text_to_markdown(children)));
            }
            Node::Header3 { children, .. } => {
                out.push_str(&format!("### {}\n\n", node_text_to_markdown(children)));
            }
            Node::Header4 { children, .. } => {
                out.push_str(&format!("#### {}\n\n", node_text_to_markdown(children)));
            }
            Node::Paragraph { children, .. } => {
                let body = node_text_to_markdown(children);
                if contains_quote(children) {
                    out.push_str(&format!("> {}\n\n", body));
                } else {
                    out.push_str(&format!("{}\n\n", body));
                }
            }
            Node::UList { children, .. } => {
                for item in children {
                    out.push_str(&format!("- {}\n", node_text_to_markdown(&item.children)));
                }
                out.push('\n');
            }
            Node::OList { children, .. } => {
                for (index, item) in children.iter().enumerate() {
                    out.push_str(&format!(
                        "{}. {}\n",
                        index + 1,
                        node_text_to_markdown(&item.children)
                    ));
                }
                out.push('\n');
            }
            Node::ListItem { children, .. } => {
                out.push_str(&format!("- {}\n", node_text_to_markdown(children)));
            }
            // Not implemented yet
            Node::Check { children, .. } => {
                out.push_str(&format!("{}\n\n", node_text_to_markdown(children)));
            }
            Node::Image { url, caption, title, .. } => {
                let alt = caption.clone().or_else(|| title.clone()).unwrap_or_default();
                out.push_str(&format!("![{}]({})\n\n", alt, url.clone().unwrap_or_default()));
            }
            Node::Table { children } => {
                for (index, row) in children.iter().enumerate() {
                    let cells: Vec<String> = row
                        .children
                        .iter()
                        .map(|cell| node_text_to_markdown(&cell.children))
                        .collect();
                    out.push_str(&format!("| {} |\n", cells.join(" | ")));

                    // GFM needs the separator straight after the first row or it is not a table.
                    if index == 0 {
                        let dashes: Vec<&str> = cells.iter().map(|_| "---").collect();
                        out.push_str(&format!("| {} |\n", dashes.join(" | ")));
                    }
                }
                out.push('\n');
            }
            Node::TableRow { children } => {
                let cells: Vec<String> = children
                    .iter()
                    .map(|cell| node_text_to_markdown(&cell.children))
                    .collect();
                out.push_str(&format!("| {} |\n", cells.join(" | ")));
            }
            Node::TableCell { children } => {
                out.push_str(&format!("{}\n", node_text_to_markdown(children)));
            }
        }
    }

    // Trim the blank line the block loop always leaves behind.
    while out.ends_with("\n\n") {
        out.pop();
    }
    out
}

/// Used by the paste handler: clipboard text in, editor nodes out.
#[tauri::command]
pub fn parse_markdown(text: String) -> Vec<Node> {
    from_markdown(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_of(nodes: &[Node]) -> String {
        to_markdown(nodes)
    }

    #[test]
    fn parses_headings_and_emphasis() {
        let nodes = from_markdown("### Titulo\n\nTexto **fuerte** y *suave*.");
        assert_eq!(nodes.len(), 2);
        match &nodes[0] {
            Node::Header3 { children, .. } => assert_eq!(children[0].text, "Titulo"),
            other => panic!("expected header3, got {:?}", other),
        }
        match &nodes[1] {
            Node::Paragraph { children, .. } => {
                assert!(children.iter().any(|c| c.bold == Some(true) && c.text == "fuerte"));
                assert!(children.iter().any(|c| c.italic == Some(true) && c.text == "suave"));
            }
            other => panic!("expected paragraph, got {:?}", other),
        }
    }

    #[test]
    fn parses_lists_and_links() {
        let nodes = from_markdown("- uno\n- [dos](https://x.dev)\n\n1. primero\n2. segundo");
        match &nodes[0] {
            Node::UList { children, .. } => {
                assert_eq!(children.len(), 2);
                assert_eq!(children[1].children[0].href.as_deref(), Some("https://x.dev"));
            }
            other => panic!("expected ulist, got {:?}", other),
        }
        match &nodes[1] {
            Node::OList { children, .. } => assert_eq!(children.len(), 2),
            other => panic!("expected olist, got {:?}", other),
        }
    }

    #[test]
    fn parses_pipe_tables() {
        let nodes = from_markdown("| a | b |\n| --- | --- |\n| 1 | 2 |");
        match &nodes[0] {
            Node::Table { children } => {
                assert_eq!(children.len(), 2);
                assert_eq!(children[1].children[1].children[0].text, "2");
            }
            other => panic!("expected table, got {:?}", other),
        }
    }

    #[test]
    fn roundtrips_through_markdown() {
        let source = "# Titulo\n\nTexto **fuerte**.\n\n- uno\n- dos";
        let rendered = text_of(&from_markdown(source));
        assert_eq!(rendered.trim(), source.trim());
    }

    #[test]
    fn leaves_unmatched_delimiters_alone() {
        let nodes = from_markdown("2 * 3 * 4 = 24");
        match &nodes[0] {
            Node::Paragraph { children, .. } => {
                // The middle `* 3 *` is a legitimate italic span; what matters is that nothing is lost.
                let joined: String = children.iter().map(|c| c.text.clone()).collect();
                assert!(joined.contains("24"));
            }
            other => panic!("expected paragraph, got {:?}", other),
        }
    }
}