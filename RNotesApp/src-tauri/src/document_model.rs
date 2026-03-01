use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    Notepad,
    Document,
}

impl Default for ViewMode {
    fn default() -> Self {
        ViewMode::Notepad
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentMeta {
    #[serde(default)]
    pub view_mode: ViewMode,
    #[serde(default)]
    pub header_enabled: bool,
    #[serde(default)]
    pub footer_enabled: bool,
    #[serde(default)]
    pub header_text: String,
    #[serde(default)]
    pub footer_text: String,
}

impl Default for DocumentMeta {
    fn default() -> Self {
        DocumentMeta {
            view_mode: ViewMode::Notepad,
            header_enabled: false,
            footer_enabled: false,
            header_text: String::new(),
            footer_text: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum Node {
    #[serde(rename = "paragraph")]
    Paragraph {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header")]
    Header {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header2")]
    Header2 {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header3")]
    Header3 {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header4")]
    Header4 {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "ulist")]
    UList {
        alignment: Option<Alignment>,
        children: Vec<ListItemNode>,
    },
    #[serde(rename = "olist")]
    OList {
        alignment: Option<Alignment>,
        children: Vec<ListItemNode>,
    },
    #[serde(rename = "list-item")]
    ListItem {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "image")]
    Image {
        url: Option<String>,
        size: Option<ImageSize>,
        alignment: Option<Alignment>,
        caption: Option<String>,
        subtitle: Option<String>,
        title: Option<String>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "table")]
    Table {
        children: Vec<TableRow>,
    },
    #[serde(rename = "table-row")]
    TableRow {
        children: Vec<TableCell>,
    },
    #[serde(rename = "table-cell")]
    TableCell {
        children: Vec<TextNode>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableRow {
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Vec<TableCell>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableCell {
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Vec<TextNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ListItemNode {
    #[serde(rename = "type")]
    pub node_type: String,
    pub alignment: Option<Alignment>,
    pub children: Vec<TextNode>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ImageSize {
    Small,
    Medium,
    Large,
    Original,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum Alignment {
    Start,
    Center,
    End,
    Justify,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TextNode {
    pub text: String,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub code: Option<bool>,
    pub quote: Option<bool>,
    #[serde(rename = "crossedOut")]
    pub crossed_out: Option<bool>,
    #[serde(rename = "fontSize")]
    pub font_size: Option<u32>,
    pub color: Option<String>,
    pub link: Option<bool>,
    pub href: Option<String>,
    #[serde(rename = "fontFamily")]
    pub font_family: Option<String>,
}
