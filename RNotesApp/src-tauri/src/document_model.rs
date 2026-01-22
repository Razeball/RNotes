use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
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
        children: Vec<TextNode>,
    },
    #[serde(rename = "olist")]
    OList {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct TableRow {
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Vec<TableCell>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableCell {
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Vec<TextNode>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ImageSize {
    Small,
    Medium,
    Large,
    Original,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Alignment {
    Start,
    Center,
    End,
    Justify,
}

#[derive(Serialize, Deserialize, Debug)]
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
}
