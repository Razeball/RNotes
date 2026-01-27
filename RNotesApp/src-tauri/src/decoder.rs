use crate::document_model::{Node, TextNode, TableRow, TableCell, ListItemNode, Alignment, ImageSize};
use std::io::{Cursor, Read, Result, Error, ErrorKind};

// Magic bytes and version
const MAGIC: &[u8; 3] = b"RDC";
const EXPECTED_VERSION: u8 = 1;

// Node type constants
const NODE_PARAGRAPH: u8 = 0x01;
const NODE_HEADER: u8 = 0x02;
const NODE_HEADER2: u8 = 0x03;
const NODE_HEADER3: u8 = 0x04;
const NODE_HEADER4: u8 = 0x05;
const NODE_ULIST: u8 = 0x06;
const NODE_OLIST: u8 = 0x07;
const NODE_LIST_ITEM: u8 = 0x08;
const NODE_IMAGE: u8 = 0x09;
const NODE_TABLE: u8 = 0x0A;
const NODE_TABLE_ROW: u8 = 0x0B;
const NODE_TABLE_CELL: u8 = 0x0C;

// Flag bit positions
const FLAG_HAS_ALIGNMENT: u8 = 0;
const FLAG_HAS_URL: u8 = 1;
const FLAG_HAS_IMAGE_SIZE: u8 = 2;
const FLAG_IMAGE_EMBEDDED: u8 = 3;
const FLAG_HAS_CAPTION: u8 = 4;
const FLAG_HAS_SUBTITLE: u8 = 5;
const FLAG_HAS_TITLE: u8 = 6;

// Image format constants
const IMAGE_FORMAT_PNG: u8 = 0;
const IMAGE_FORMAT_JPG: u8 = 1;
const IMAGE_FORMAT_BMP: u8 = 2;
const IMAGE_FORMAT_GIF: u8 = 3;
const IMAGE_FORMAT_WEBP: u8 = 4;

// Style flag bit positions
const STYLE_BOLD: u8 = 0;
const STYLE_ITALIC: u8 = 1;
const STYLE_UNDERLINE: u8 = 2;
const STYLE_CODE: u8 = 3;
const STYLE_QUOTE: u8 = 4;
const STYLE_CROSSED_OUT: u8 = 5;
const STYLE_LINK: u8 = 6;

/// Decodes a binary .rdocx document into a Vec<Node>
pub fn decode_document(data: &[u8]) -> Result<Vec<Node>> {
    let mut cursor = Cursor::new(data);
    
    // Read and verify magic bytes
    let mut magic = [0u8; 3];
    cursor.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(Error::new(ErrorKind::InvalidData, "Invalid magic bytes: not a valid .rdocx file"));
    }
    
    // Read and verify version
    let mut version = [0u8; 1];
    cursor.read_exact(&mut version)?;
    if version[0] != EXPECTED_VERSION {
        return Err(Error::new(
            ErrorKind::InvalidData, 
            format!("Unsupported version: {} (expected {})", version[0], EXPECTED_VERSION)
        ));
    }
    
    let node_count = read_u32(&mut cursor)?;
    
    let mut nodes = Vec::with_capacity(node_count as usize);
    for _ in 0..node_count {
        let node = decode_node(&mut cursor)?;
        nodes.push(node);
    }
    
    Ok(nodes)
}

fn decode_node(cursor: &mut Cursor<&[u8]>) -> Result<Node> {

    let mut node_type = [0u8; 1];
    cursor.read_exact(&mut node_type)?;
    
    match node_type[0] {
        NODE_PARAGRAPH => decode_standard_node(cursor, |alignment, children| {
            Node::Paragraph { alignment, children }
        }),
        NODE_HEADER => decode_standard_node(cursor, |alignment, children| {
            Node::Header { alignment, children }
        }),
        NODE_HEADER2 => decode_standard_node(cursor, |alignment, children| {
            Node::Header2 { alignment, children }
        }),
        NODE_HEADER3 => decode_standard_node(cursor, |alignment, children| {
            Node::Header3 { alignment, children }
        }),
        NODE_HEADER4 => decode_standard_node(cursor, |alignment, children| {
            Node::Header4 { alignment, children }
        }),
        NODE_ULIST => decode_list_node(cursor, |alignment, children| {
            Node::UList { alignment, children }
        }),
        NODE_OLIST => decode_list_node(cursor, |alignment, children| {
            Node::OList { alignment, children }
        }),
        NODE_LIST_ITEM => decode_standard_node(cursor, |alignment, children| {
            Node::ListItem { alignment, children }
        }),
        NODE_IMAGE => decode_image_node(cursor),
        NODE_TABLE => decode_table_node(cursor),
        NODE_TABLE_ROW => decode_table_row_node(cursor),
        NODE_TABLE_CELL => decode_table_cell_node(cursor),
        _ => Err(Error::new(ErrorKind::InvalidData, format!("Unknown node type: 0x{:02X}", node_type[0]))),
    }
}

fn decode_standard_node<F>(cursor: &mut Cursor<&[u8]>, constructor: F) -> Result<Node>
where
    F: FnOnce(Option<Alignment>, Vec<TextNode>) -> Node,
{

    let mut flags = [0u8; 1];
    cursor.read_exact(&mut flags)?;
    let flags = flags[0];
    

    let alignment = if flags & (1 << FLAG_HAS_ALIGNMENT) != 0 {
        let align_value = (flags >> 4) & 0x03;
        Some(u8_to_alignment(align_value))
    } else {
        None
    };
    
    let children_count = read_u32(cursor)?;
    
    let mut children = Vec::with_capacity(children_count as usize);
    for _ in 0..children_count {
        let text_node = decode_text_node(cursor)?;
        children.push(text_node);
    }
    
    Ok(constructor(alignment, children))
}

fn decode_list_node<F>(cursor: &mut Cursor<&[u8]>, constructor: F) -> Result<Node>
where
    F: FnOnce(Option<Alignment>, Vec<ListItemNode>) -> Node,
{
   
    let mut flags = [0u8; 1];
    cursor.read_exact(&mut flags)?;
    let flags = flags[0];
    
   
    let alignment = if flags & (1 << FLAG_HAS_ALIGNMENT) != 0 {
        let align_value = (flags >> 4) & 0x03;
        Some(u8_to_alignment(align_value))
    } else {
        None
    };
    
    let children_count = read_u32(cursor)?;
    
    let mut children = Vec::with_capacity(children_count as usize);
    for _ in 0..children_count {
        let mut item_flags = [0u8; 1];
        cursor.read_exact(&mut item_flags)?;
        let item_flags = item_flags[0];
        
        let item_alignment = if item_flags & (1 << FLAG_HAS_ALIGNMENT) != 0 {
            let align_value = (item_flags >> 4) & 0x03;
            Some(u8_to_alignment(align_value))
        } else {
            None
        };
        
        let text_count = read_u32(cursor)?;
        
        let mut text_nodes = Vec::with_capacity(text_count as usize);
        for _ in 0..text_count {
            let text_node = decode_text_node(cursor)?;
            text_nodes.push(text_node);
        }
        


        children.push(ListItemNode {
            node_type: "list-item".to_string(),
            alignment: item_alignment,
            children: text_nodes,
        });
    }
    
    Ok(constructor(alignment, children))
}

fn decode_image_node(cursor: &mut Cursor<&[u8]>) -> Result<Node> {

    let mut flags = [0u8; 1];
    cursor.read_exact(&mut flags)?;
    let flags = flags[0];
    
    let url = if flags & (1 << FLAG_IMAGE_EMBEDDED) != 0 {

        let mut format = [0u8; 1];
        cursor.read_exact(&mut format)?;
        let format = format[0];
        
        let data_len = read_u32(cursor)?;
        
        let mut image_data = vec![0u8; data_len as usize];
        cursor.read_exact(&mut image_data)?;
        
        Some(save_embedded_image(&image_data, format)?)
    } else if flags & (1 << FLAG_HAS_URL) != 0 {
        let url_len = read_u16(cursor)?;
        let url_str = read_utf8_string(cursor, url_len as usize)?;
        Some(url_str)
    } else {
        None
    };
    
    let size = if flags & (1 << FLAG_HAS_IMAGE_SIZE) != 0 {
        let mut size_byte = [0u8; 1];
        cursor.read_exact(&mut size_byte)?;
        Some(u8_to_image_size(size_byte[0]))
    } else {
        None
    };

    let alignment = if flags & (1 << FLAG_HAS_ALIGNMENT) != 0 {
        let mut align_byte = [0u8; 1];
        cursor.read_exact(&mut align_byte)?;
        Some(u8_to_alignment(align_byte[0]))
    } else {
        None
    };

    let caption = if flags & (1 << FLAG_HAS_CAPTION) != 0 {
        let cap_len = read_u16(cursor)?;
        Some(read_utf8_string(cursor, cap_len as usize)?)
    } else {
        None
    };

    let subtitle = if flags & (1 << FLAG_HAS_SUBTITLE) != 0 {
        let sub_len = read_u16(cursor)?;
        Some(read_utf8_string(cursor, sub_len as usize)?)
    } else {
        None
    };

    let title = if flags & (1 << FLAG_HAS_TITLE) != 0 {
        let title_len = read_u16(cursor)?;
        Some(read_utf8_string(cursor, title_len as usize)?)
    } else {
        None
    };
    
    let children_count = read_u32(cursor)?;
    
    let mut children = Vec::with_capacity(children_count as usize);
    for _ in 0..children_count {
        let text_node = decode_text_node(cursor)?;
        children.push(text_node);
    }
    
    Ok(Node::Image { url, size, alignment, caption, subtitle, title, children })
}

/// Save an embedded image to temp directory and return the path
fn save_embedded_image(data: &[u8], format: u8) -> Result<String> {
    use uuid::Uuid;
    
    let extension = match format {
        IMAGE_FORMAT_PNG => "png",
        IMAGE_FORMAT_JPG => "jpg",
        IMAGE_FORMAT_BMP => "bmp",
        IMAGE_FORMAT_GIF => "gif",
        IMAGE_FORMAT_WEBP => "webp",
        _ => "png", 
    };
    let images_dir = std::env::temp_dir().join("rnotes_images");
    if !images_dir.exists() {
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| Error::new(ErrorKind::Other, format!("Failed to create images dir: {}", e)))?;
    }
    let filename = format!("{}.{}", Uuid::new_v4(), extension);
    let filepath = images_dir.join(&filename);
    
    std::fs::write(&filepath, data)
        .map_err(|e| Error::new(ErrorKind::Other, format!("Failed to write image: {}", e)))?;
    
    Ok(filepath.to_string_lossy().to_string())
}

fn decode_table_node(cursor: &mut Cursor<&[u8]>) -> Result<Node> {

    let mut _flags = [0u8; 1];
    cursor.read_exact(&mut _flags)?;
    
    let row_count = read_u32(cursor)?;
    
    let mut children = Vec::with_capacity(row_count as usize);
    for _ in 0..row_count {
        let row = decode_table_row_inner(cursor)?;
        children.push(row);
    }
    
    Ok(Node::Table { children })
}

fn decode_table_row_node(cursor: &mut Cursor<&[u8]>) -> Result<Node> {

    let mut _flags = [0u8; 1];
    cursor.read_exact(&mut _flags)?;
    
    let row = decode_table_row_inner(cursor)?;
    Ok(Node::TableRow { children: row.children })
}

fn decode_table_row_inner(cursor: &mut Cursor<&[u8]>) -> Result<TableRow> {

    let cell_count = read_u32(cursor)?;

    let mut children = Vec::with_capacity(cell_count as usize);
    for _ in 0..cell_count {
        let cell = decode_table_cell_inner(cursor)?;
        children.push(cell);
    }
    
    Ok(TableRow {
        node_type: "table-row".to_string(),
        children,
    })
}

fn decode_table_cell_node(cursor: &mut Cursor<&[u8]>) -> Result<Node> {
    let mut _flags = [0u8; 1];
    cursor.read_exact(&mut _flags)?;
    
    let cell = decode_table_cell_inner(cursor)?;
    Ok(Node::TableCell { children: cell.children })
}

fn decode_table_cell_inner(cursor: &mut Cursor<&[u8]>) -> Result<TableCell> {
    let text_node_count = read_u32(cursor)?;
    
    let mut children = Vec::with_capacity(text_node_count as usize);
    for _ in 0..text_node_count {
        let text_node = decode_text_node(cursor)?;
        children.push(text_node);
    }
    
    Ok(TableCell {
        node_type: "table-cell".to_string(),
        children,
    })
}

fn decode_text_node(cursor: &mut Cursor<&[u8]>) -> Result<TextNode> {

    let mut style_flags = [0u8; 1];
    cursor.read_exact(&mut style_flags)?;
    let style_flags = style_flags[0];
    
    let text_len = read_u16(cursor)?;
    
    let href_len = read_u16(cursor)?;
    let href = if href_len > 0 {
        Some(read_utf8_string(cursor, href_len as usize)?)
    } else {
        None
    };
    
    let font_size_value = read_u16(cursor)?;
    let font_size = if font_size_value > 0 {
        Some(font_size_value as u32)
    } else {
        None
    };
    
    let mut color_len = [0u8; 1];
    cursor.read_exact(&mut color_len)?;
    let color = if color_len[0] > 0 {
        Some(read_utf8_string(cursor, color_len[0] as usize)?)
    } else {
        None
    };
    
    let text = read_utf8_string(cursor, text_len as usize)?;
    
    let bold = flag_to_option(style_flags, STYLE_BOLD);
    let italic = flag_to_option(style_flags, STYLE_ITALIC);
    let underline = flag_to_option(style_flags, STYLE_UNDERLINE);
    let code = flag_to_option(style_flags, STYLE_CODE);
    let quote = flag_to_option(style_flags, STYLE_QUOTE);
    let crossed_out = flag_to_option(style_flags, STYLE_CROSSED_OUT);
    let link = flag_to_option(style_flags, STYLE_LINK);
    
    Ok(TextNode {
        text,
        bold,
        italic,
        underline,
        code,
        quote,
        crossed_out,
        font_size,
        color,
        link,
        href,
    })
}

// Helper functions

fn read_u16(cursor: &mut Cursor<&[u8]>) -> Result<u16> {
    let mut buf = [0u8; 2];
    cursor.read_exact(&mut buf)?;
    Ok(u16::from_le_bytes(buf))
}

fn read_u32(cursor: &mut Cursor<&[u8]>) -> Result<u32> {
    let mut buf = [0u8; 4];
    cursor.read_exact(&mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn read_utf8_string(cursor: &mut Cursor<&[u8]>, len: usize) -> Result<String> {
    let mut buf = vec![0u8; len];
    cursor.read_exact(&mut buf)?;
    String::from_utf8(buf)
        .map_err(|e| Error::new(ErrorKind::InvalidData, format!("Invalid UTF-8: {}", e)))
}

fn flag_to_option(flags: u8, bit: u8) -> Option<bool> {
    if flags & (1 << bit) != 0 {
        Some(true)
    } else {
        None
    }
}

fn u8_to_alignment(value: u8) -> Alignment {
    match value {
        0 => Alignment::Start,
        1 => Alignment::Center,
        2 => Alignment::End,
        3 => Alignment::Justify,
        _ => Alignment::Start, 
    }
}

fn u8_to_image_size(value: u8) -> ImageSize {
    match value {
        0 => ImageSize::Small,
        1 => ImageSize::Medium,
        2 => ImageSize::Large,
        3 => ImageSize::Original,
        _ => ImageSize::Original, 
    }
}

// Test using json to try decode it
#[cfg(test)]
mod tests {
    use super::*;
    use crate::encoder::encode_document;

    #[test]
    fn test_roundtrip_simple_document() {
        let original = vec![
            Node::Paragraph {
                alignment: Some(Alignment::Center),
                children: vec![TextNode {
                    text: "Hello World".to_string(),
                    bold: Some(true),
                    italic: Some(true),
                    underline: None,
                    code: None,
                    quote: None,
                    crossed_out: None,
                    font_size: Some(16),
                    color: Some("#FF0000".to_string()),
                    link: None,
                    href: None,
                }],
            },
        ];
        
        let encoded = encode_document(&original).expect("Encoding failed");
        let decoded = decode_document(&encoded).expect("Decoding failed");
        
        assert_eq!(decoded.len(), 1);
        
        if let Node::Paragraph { alignment, children } = &decoded[0] {
            assert!(matches!(alignment, Some(Alignment::Center)));
            assert_eq!(children.len(), 1);
            assert_eq!(children[0].text, "Hello World");
            assert_eq!(children[0].bold, Some(true));
            assert_eq!(children[0].italic, Some(true));
            assert_eq!(children[0].font_size, Some(16));
            assert_eq!(children[0].color, Some("#FF0000".to_string()));
        } else {
            panic!("Expected Paragraph node");
        }
    }

    #[test]
    fn test_roundtrip_image_node() {
        let original = vec![
            Node::Image {
                url: Some("https://example.com/image.png".to_string()),
                size: Some(ImageSize::Large),
                alignment: Some(Alignment::Center),
                caption: Some("Test caption".to_string()),
                subtitle: Some("Test subtitle".to_string()),
                title: Some("Test title".to_string()),
                children: vec![TextNode {
                    text: "Alt text".to_string(),
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
                }],
            },
        ];
        
        let encoded = encode_document(&original).expect("Encoding failed");
        let decoded = decode_document(&encoded).expect("Decoding failed");
        
        assert_eq!(decoded.len(), 1);
        
        if let Node::Image { url, size, alignment, caption, subtitle, title, children } = &decoded[0] {
            assert_eq!(url, &Some("https://example.com/image.png".to_string()));
            assert!(matches!(size, Some(ImageSize::Large)));
            assert!(matches!(alignment, Some(Alignment::Center)));
            assert_eq!(caption, &Some("Test caption".to_string()));
            assert_eq!(subtitle, &Some("Test subtitle".to_string()));
            assert_eq!(title, &Some("Test title".to_string()));
            assert_eq!(children[0].text, "Alt text");
        } else {
            panic!("Expected Image node");
        }
    }

    #[test]
    fn test_roundtrip_table() {
        let original = vec![
            Node::Table {
                children: vec![
                    TableRow {
                        node_type: "table-row".to_string(),
                        children: vec![
                            TableCell {
                                node_type: "table-cell".to_string(),
                                children: vec![TextNode {
                                    text: "Cell 1".to_string(),
                                    bold: Some(true),
                                    italic: None,
                                    underline: None,
                                    code: None,
                                    quote: None,
                                    crossed_out: None,
                                    font_size: None,
                                    color: None,
                                    link: None,
                                    href: None,
                                }],
                            },
                            TableCell {
                                node_type: "table-cell".to_string(),
                                children: vec![TextNode {
                                    text: "Cell 2".to_string(),
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
                                }],
                            },
                        ],
                    },
                ],
            },
        ];
        
        let encoded = encode_document(&original).expect("Encoding failed");
        let decoded = decode_document(&encoded).expect("Decoding failed");
        
        assert_eq!(decoded.len(), 1);
        
        if let Node::Table { children } = &decoded[0] {
            assert_eq!(children.len(), 1);
            assert_eq!(children[0].children.len(), 2);
            assert_eq!(children[0].children[0].children[0].text, "Cell 1");
            assert_eq!(children[0].children[1].children[0].text, "Cell 2");
        } else {
            panic!("Expected Table node");
        }
    }

    #[test]
    fn test_invalid_magic_bytes() {
        let invalid_data = b"XXX\x01\x00\x00\x00\x00";
        let result = decode_document(invalid_data);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_version() {
        let invalid_data = b"RDC\x99\x00\x00\x00\x00";
        let result = decode_document(invalid_data);
        assert!(result.is_err());
    }

    #[test]
    fn test_roundtrip_list() {
        use crate::document_model::ListItemNode;
        
        let original = vec![
            Node::UList {
                alignment: None,
                children: vec![
                    ListItemNode {
                        node_type: "list-item".to_string(),
                        alignment: None,
                        children: vec![TextNode {
                            text: "Item 1".to_string(),
                            bold: Some(true),
                            italic: None,
                            underline: None,
                            code: None,
                            quote: None,
                            crossed_out: None,
                            font_size: None,
                            color: None,
                            link: None,
                            href: None,
                        }],
                    },
                    ListItemNode {
                        node_type: "list-item".to_string(),
                        alignment: None,
                        children: vec![TextNode {
                            text: "Item 2".to_string(),
                            bold: None,
                            italic: Some(true),
                            underline: None,
                            code: None,
                            quote: None,
                            crossed_out: None,
                            font_size: None,
                            color: None,
                            link: None,
                            href: None,
                        }],
                    },
                ],
            },
        ];
        
        let encoded = encode_document(&original).expect("Encoding failed");
        let decoded = decode_document(&encoded).expect("Decoding failed");
        
        assert_eq!(decoded.len(), 1);
        
        if let Node::UList { alignment, children } = &decoded[0] {
            assert!(alignment.is_none());
            assert_eq!(children.len(), 2);
            assert_eq!(children[0].children[0].text, "Item 1");
            assert_eq!(children[0].children[0].bold, Some(true));
            assert_eq!(children[1].children[0].text, "Item 2");
            assert_eq!(children[1].children[0].italic, Some(true));
        } else {
            panic!("Expected UList node");
        }
    }
}
