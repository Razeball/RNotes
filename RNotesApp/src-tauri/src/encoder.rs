use crate::document_model::{Node, TextNode, TableRow, TableCell, ListItemNode, Alignment, ImageSize};
use std::io::{Write, Result, Error, ErrorKind};

// Magic bytes and version
const MAGIC: &[u8; 3] = b"RDC";
const VERSION: u8 = 1;

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

/// Encodes a document to the binary .rdocx format
pub fn encode_document(nodes: &[Node]) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
      
    buffer.write_all(MAGIC)?;
    
    buffer.write_all(&[VERSION])?;
    
    // Write node count (u32 little-endian)
    let node_count = nodes.len() as u32;
    buffer.write_all(&node_count.to_le_bytes())?;
    
    for node in nodes {
        encode_node(&mut buffer, node)?;
    }
    
    Ok(buffer)
}

// Encode base on each node 
fn encode_node(buffer: &mut Vec<u8>, node: &Node) -> Result<()> {
    match node {
        Node::Paragraph { alignment, children } => {
            encode_standard_node(buffer, NODE_PARAGRAPH, alignment, children)?;
        }
        Node::Header { alignment, children } => {
            encode_standard_node(buffer, NODE_HEADER, alignment, children)?;
        }
        Node::Header2 { alignment, children } => {
            encode_standard_node(buffer, NODE_HEADER2, alignment, children)?;
        }
        Node::Header3 { alignment, children } => {
            encode_standard_node(buffer, NODE_HEADER3, alignment, children)?;
        }
        Node::Header4 { alignment, children } => {
            encode_standard_node(buffer, NODE_HEADER4, alignment, children)?;
        }
        Node::UList { alignment, children } => {
            encode_list_node(buffer, NODE_ULIST, alignment, children)?;
        }
        Node::OList { alignment, children } => {
            encode_list_node(buffer, NODE_OLIST, alignment, children)?;
        }
        Node::ListItem { alignment, children } => {
            encode_standard_node(buffer, NODE_LIST_ITEM, alignment, children)?;
        }
        Node::Image { url, size, alignment, caption, subtitle, title, children } => {
            encode_image_node(buffer, url, size, alignment, caption, subtitle, title, children)?;
        }
        Node::Table { children } => {
            encode_table_node(buffer, children)?;
        }
        Node::TableRow { children } => {
            encode_table_row(buffer, children)?;
        }
        Node::TableCell { children } => {
            encode_table_cell(buffer, children)?;
        }
    }
    
    Ok(())
}

fn encode_standard_node(
    buffer: &mut Vec<u8>,
    node_type: u8,
    alignment: &Option<Alignment>,
    children: &[TextNode],
) -> Result<()> {

    buffer.write_all(&[node_type])?;
    

    let mut flags: u8 = 0;
    if let Some(align) = alignment {
        flags |= 1 << FLAG_HAS_ALIGNMENT;
        flags |= (alignment_to_u8(align) & 0x03) << 4;
    }
    buffer.write_all(&[flags])?;
    
    let children_count = children.len() as u32;
    buffer.write_all(&children_count.to_le_bytes())?;
    
    for text_node in children {
        encode_text_node(buffer, text_node)?;
    }
    
    Ok(())
}

fn encode_list_node(
    buffer: &mut Vec<u8>,
    node_type: u8,
    alignment: &Option<Alignment>,
    children: &[ListItemNode],
) -> Result<()> {
  
    buffer.write_all(&[node_type])?;
    
   
    let mut flags: u8 = 0;
    if let Some(align) = alignment {
        flags |= 1 << FLAG_HAS_ALIGNMENT;
        flags |= (alignment_to_u8(align) & 0x03) << 4;
    }
    buffer.write_all(&[flags])?;
    
    
    let children_count = children.len() as u32;
    buffer.write_all(&children_count.to_le_bytes())?;
    
    
    for list_item in children {
      
        let mut item_flags: u8 = 0;
        if let Some(align) = &list_item.alignment {
            item_flags |= 1 << FLAG_HAS_ALIGNMENT;
            item_flags |= (alignment_to_u8(align) & 0x03) << 4;
        }
        buffer.write_all(&[item_flags])?;
        
        
        let text_count = list_item.children.len() as u32;
        buffer.write_all(&text_count.to_le_bytes())?;
        
        
        for text_node in &list_item.children {
            encode_text_node(buffer, text_node)?;
        }
    }
    
    Ok(())
}

fn encode_image_node(
    buffer: &mut Vec<u8>,
    url: &Option<String>,
    size: &Option<ImageSize>,
    alignment: &Option<Alignment>,
    caption: &Option<String>,
    subtitle: &Option<String>,
    title: &Option<String>,
    children: &[TextNode],
) -> Result<()> {
    buffer.write_all(&[NODE_IMAGE])?;
    
    // Check if it is possible to embed the image
    let embedded_image = url.as_ref().and_then(|url_str| {
        try_read_local_image(url_str)
    });
    
    let mut flags: u8 = 0;
    if embedded_image.is_some() {
        flags |= 1 << FLAG_IMAGE_EMBEDDED;
    } else if url.is_some() {
        flags |= 1 << FLAG_HAS_URL;
    }
    if size.is_some() {
        flags |= 1 << FLAG_HAS_IMAGE_SIZE;
    }
    if alignment.is_some() {
        flags |= 1 << FLAG_HAS_ALIGNMENT;
    }
    if caption.is_some() {
        flags |= 1 << FLAG_HAS_CAPTION;
    }
    if subtitle.is_some() {
        flags |= 1 << FLAG_HAS_SUBTITLE;
    }
    if title.is_some() {
        flags |= 1 << FLAG_HAS_TITLE;
    }
    buffer.write_all(&[flags])?;
    

    if let Some((format, image_data)) = embedded_image {

        buffer.write_all(&[format])?;

        let data_len = image_data.len() as u32;
        buffer.write_all(&data_len.to_le_bytes())?;

        buffer.write_all(&image_data)?;
    } else if let Some(url_str) = url {
        let url_bytes = url_str.as_bytes();
        let url_len = url_bytes.len() as u16;
        buffer.write_all(&url_len.to_le_bytes())?;
        buffer.write_all(url_bytes)?;
    }
    
    // Write image size if present
    if let Some(img_size) = size {
        buffer.write_all(&[image_size_to_u8(img_size)])?;
    }

    // Write alignment if present
    if let Some(align) = alignment {
        buffer.write_all(&[alignment_to_u8(align)])?;
    }

    // Write caption if present
    if let Some(cap) = caption {
        let cap_bytes = cap.as_bytes();
        let cap_len = cap_bytes.len() as u16;
        buffer.write_all(&cap_len.to_le_bytes())?;
        buffer.write_all(cap_bytes)?;
    }

    // Write subtitle if present
    if let Some(sub) = subtitle {
        let sub_bytes = sub.as_bytes();
        let sub_len = sub_bytes.len() as u16;
        buffer.write_all(&sub_len.to_le_bytes())?;
        buffer.write_all(sub_bytes)?;
    }

    // Write title if present
    if let Some(t) = title {
        let t_bytes = t.as_bytes();
        let t_len = t_bytes.len() as u16;
        buffer.write_all(&t_len.to_le_bytes())?;
        buffer.write_all(t_bytes)?;
    }
    
    let children_count = children.len() as u32;
    buffer.write_all(&children_count.to_le_bytes())?;
    
    for text_node in children {
        encode_text_node(buffer, text_node)?;
    }
    
    Ok(())
}

/// Tries to read a local image file and convert it to a suitable format for embedding
fn try_read_local_image(url: &str) -> Option<(u8, Vec<u8>)> {
    use std::path::Path;
    
    let path = Path::new(url);
    
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("data:") {
        return None;
    }
    
    let image_data = std::fs::read(path).ok()?;
    
    let extension = path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    
    let format = match extension.as_deref() {
        Some("png") => IMAGE_FORMAT_PNG,
        Some("jpg") | Some("jpeg") => IMAGE_FORMAT_JPG,
        Some("bmp") => IMAGE_FORMAT_BMP,
        Some("gif") => IMAGE_FORMAT_GIF,
        Some("webp") => IMAGE_FORMAT_WEBP,
        _ => {
            if let Some(detected_format) = detect_image_format(&image_data) {
                detected_format
            } else {
                return convert_to_png(&image_data);
            }
        }
    };
    
    Some((format, image_data))
}

fn detect_image_format(data: &[u8]) -> Option<u8> {
    if data.len() < 4 {
        return None;
    }
    
    // PNG: 89 50 4E 47
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return Some(IMAGE_FORMAT_PNG);
    }
    // JPEG: FF D8 FF
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(IMAGE_FORMAT_JPG);
    }
    // BMP: 42 4D
    if data.starts_with(&[0x42, 0x4D]) {
        return Some(IMAGE_FORMAT_BMP);
    }
    // GIF: 47 49 46 38
    if data.starts_with(&[0x47, 0x49, 0x46, 0x38]) {
        return Some(IMAGE_FORMAT_GIF);
    }
    // WEBP: 52 49 46 46 ... 57 45 42 50
    if data.len() >= 12 && data.starts_with(&[0x52, 0x49, 0x46, 0x46]) && &data[8..12] == b"WEBP" {
        return Some(IMAGE_FORMAT_WEBP);
    }
    
    None
}

/// Convert unknown image format to PNG as fallback
fn convert_to_png(data: &[u8]) -> Option<(u8, Vec<u8>)> {
    use std::io::Cursor;
    use image::ImageFormat;
    
    let img = image::load_from_memory(data).ok()?;
    
    let mut buffer = Cursor::new(Vec::new());
    img.write_to(&mut buffer, ImageFormat::Png).ok()?;
    
    Some((IMAGE_FORMAT_PNG, buffer.into_inner()))
}

fn encode_table_node(buffer: &mut Vec<u8>, rows: &[TableRow]) -> Result<()> {

    buffer.write_all(&[NODE_TABLE])?;
    
    buffer.write_all(&[0u8])?;
    
    let row_count = rows.len() as u32;
    buffer.write_all(&row_count.to_le_bytes())?;
    
    for row in rows {
        encode_table_row_inner(buffer, &row.children)?;
    }
    
    Ok(())
}

fn encode_table_row(buffer: &mut Vec<u8>, cells: &[TableCell]) -> Result<()> {

    buffer.write_all(&[NODE_TABLE_ROW])?;
    
    buffer.write_all(&[0u8])?;
    
    encode_table_row_inner(buffer, cells)
}

fn encode_table_row_inner(buffer: &mut Vec<u8>, cells: &[TableCell]) -> Result<()> {
    let cell_count = cells.len() as u32;
    buffer.write_all(&cell_count.to_le_bytes())?;
    
    for cell in cells {
        encode_table_cell_inner(buffer, &cell.children)?;
    }
    
    Ok(())
}

fn encode_table_cell(buffer: &mut Vec<u8>, children: &[TextNode]) -> Result<()> {

    buffer.write_all(&[NODE_TABLE_CELL])?;
    
    buffer.write_all(&[0u8])?;
    
    encode_table_cell_inner(buffer, children)
}

fn encode_table_cell_inner(buffer: &mut Vec<u8>, children: &[TextNode]) -> Result<()> {

    let text_node_count = children.len() as u32;
    buffer.write_all(&text_node_count.to_le_bytes())?;
    
    for text_node in children {
        encode_text_node(buffer, text_node)?;
    }
    
    Ok(())
}

fn encode_text_node(buffer: &mut Vec<u8>, text_node: &TextNode) -> Result<()> {

    let mut style_flags: u8 = 0;
    if text_node.bold.unwrap_or(false) {
        style_flags |= 1 << STYLE_BOLD;
    }
    if text_node.italic.unwrap_or(false) {
        style_flags |= 1 << STYLE_ITALIC;
    }
    if text_node.underline.unwrap_or(false) {
        style_flags |= 1 << STYLE_UNDERLINE;
    }
    if text_node.code.unwrap_or(false) {
        style_flags |= 1 << STYLE_CODE;
    }
    if text_node.quote.unwrap_or(false) {
        style_flags |= 1 << STYLE_QUOTE;
    }
    if text_node.crossed_out.unwrap_or(false) {
        style_flags |= 1 << STYLE_CROSSED_OUT;
    }
    if text_node.link.unwrap_or(false) {
        style_flags |= 1 << STYLE_LINK;
    }
    buffer.write_all(&[style_flags])?;
    
    let text_bytes = text_node.text.as_bytes();
    let text_len = text_bytes.len();
    if text_len > u16::MAX as usize {
        return Err(Error::new(ErrorKind::InvalidData, "Text too long for u16 length"));
    }
    buffer.write_all(&(text_len as u16).to_le_bytes())?;
    
    let href_bytes = text_node.href.as_ref().map(|s| s.as_bytes()).unwrap_or(&[]);
    let href_len = href_bytes.len();
    if href_len > u16::MAX as usize {
        return Err(Error::new(ErrorKind::InvalidData, "Href too long for u16 length"));
    }
    buffer.write_all(&(href_len as u16).to_le_bytes())?;
    buffer.write_all(href_bytes)?;
    
    let font_size = text_node.font_size.unwrap_or(0) as u16;
    buffer.write_all(&font_size.to_le_bytes())?;
    

    let color_bytes = text_node.color.as_ref().map(|s| s.as_bytes()).unwrap_or(&[]);
    let color_len = color_bytes.len();
    if color_len > u8::MAX as usize {
        return Err(Error::new(ErrorKind::InvalidData, "Color string too long for u8 length"));
    }
    buffer.write_all(&[color_len as u8])?;
    buffer.write_all(color_bytes)?;
    
    buffer.write_all(text_bytes)?;
    
    Ok(())
}

fn alignment_to_u8(alignment: &Alignment) -> u8 {
    match alignment {
        Alignment::Start => 0,
        Alignment::Center => 1,
        Alignment::End => 2,
        Alignment::Justify => 3,
    }
}

fn image_size_to_u8(size: &ImageSize) -> u8 {
    match size {
        ImageSize::Small => 0,
        ImageSize::Medium => 1,
        ImageSize::Large => 2,
        ImageSize::Original => 3,
    }
}

//Test to check if the encoding works 
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_simple_document() {
        let doc = vec![
            Node::Paragraph {
                alignment: Some(Alignment::Center),
                children: vec![TextNode {
                    text: "Hello".to_string(),
                    bold: Some(true),
                    italic: None,
                    underline: None,
                    code: None,
                    quote: None,
                    crossed_out: None,
                    font_size: Some(16),
                    color: None,
                    link: None,
                    href: None,
                }],
            },
        ];
        
        let result = encode_document(&doc);
        assert!(result.is_ok());
        
        let bytes = result.unwrap();
        // Check magic bytes
        assert_eq!(&bytes[0..3], b"RDC");
        // Check version
        assert_eq!(bytes[3], 1);
        // Check node count
        assert_eq!(&bytes[4..8], &1u32.to_le_bytes());
    }
}
