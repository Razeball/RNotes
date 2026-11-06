//! The numbers that make up the `.rdocx` binary format, shared by `encoder.rs` and `decoder.rs`.
//!
//!
//! **Bumping the format** means raising `VERSION`, reading new fields behind `if version >= N` in
//! the decoder, and adding the new constants here with their pinned values in the test. The decoder
//! accepts `1..=VERSION`, so a bump can no longer leave freshly saved files unreadable — the
//! accepted range used to be a hand-written `1..=4` next to an encoder-side `VERSION`.

// Magic bytes and version
pub const MAGIC: &[u8; 3] = b"RDC";
pub const VERSION: u8 = 4;

// Node type constants
pub const NODE_PARAGRAPH: u8 = 0x01;
pub const NODE_HEADER: u8 = 0x02;
pub const NODE_HEADER2: u8 = 0x03;
pub const NODE_HEADER3: u8 = 0x04;
pub const NODE_HEADER4: u8 = 0x05;
pub const NODE_ULIST: u8 = 0x06;
pub const NODE_OLIST: u8 = 0x07;
pub const NODE_LIST_ITEM: u8 = 0x08;
pub const NODE_IMAGE: u8 = 0x09;
pub const NODE_TABLE: u8 = 0x0A;
pub const NODE_TABLE_ROW: u8 = 0x0B;
pub const NODE_TABLE_CELL: u8 = 0x0C;
pub const NODE_CHECK: u8 = 0x0D;

// Flag bit positions
pub const FLAG_HAS_ALIGNMENT: u8 = 0;
pub const FLAG_HAS_URL: u8 = 1;
pub const FLAG_HAS_IMAGE_SIZE: u8 = 2;
pub const FLAG_IMAGE_EMBEDDED: u8 = 3;
pub const FLAG_HAS_CAPTION: u8 = 4;
pub const FLAG_HAS_SUBTITLE: u8 = 5;
pub const FLAG_HAS_TITLE: u8 = 6;
// Bits 0-6 belong to image nodes and bits 4-5 carry the alignment, so the check state takes bit 7.
pub const FLAG_CHECK_CHECKED: u8 = 7;

// Image format constants
pub const IMAGE_FORMAT_PNG: u8 = 0;
pub const IMAGE_FORMAT_JPG: u8 = 1;
pub const IMAGE_FORMAT_BMP: u8 = 2;
pub const IMAGE_FORMAT_GIF: u8 = 3;
pub const IMAGE_FORMAT_WEBP: u8 = 4;

// Style flag bit positions
pub const STYLE_BOLD: u8 = 0;
pub const STYLE_ITALIC: u8 = 1;
pub const STYLE_UNDERLINE: u8 = 2;
pub const STYLE_CODE: u8 = 3;
pub const STYLE_QUOTE: u8 = 4;
pub const STYLE_CROSSED_OUT: u8 = 5;
pub const STYLE_LINK: u8 = 6;

#[cfg(test)]
mod tests {
    use super::*;

    /// Every value as it is written in files that already exist. A failure here is not a test to
    /// update: it means a change would misread every document saved before it. Add new constants
    /// with new values instead, and pin them here.
    #[test]
    fn the_on_disk_values_never_change() {
        assert_eq!(MAGIC, b"RDC");

        let node_types = [
            (NODE_PARAGRAPH, 0x01), (NODE_HEADER, 0x02), (NODE_HEADER2, 0x03), (NODE_HEADER3, 0x04),
            (NODE_HEADER4, 0x05), (NODE_ULIST, 0x06), (NODE_OLIST, 0x07), (NODE_LIST_ITEM, 0x08),
            (NODE_IMAGE, 0x09), (NODE_TABLE, 0x0A), (NODE_TABLE_ROW, 0x0B), (NODE_TABLE_CELL, 0x0C),
            (NODE_CHECK, 0x0D),
        ];
        let flags = [
            (FLAG_HAS_ALIGNMENT, 0), (FLAG_HAS_URL, 1), (FLAG_HAS_IMAGE_SIZE, 2), (FLAG_IMAGE_EMBEDDED, 3),
            (FLAG_HAS_CAPTION, 4), (FLAG_HAS_SUBTITLE, 5), (FLAG_HAS_TITLE, 6), (FLAG_CHECK_CHECKED, 7),
        ];
        let image_formats = [
            (IMAGE_FORMAT_PNG, 0), (IMAGE_FORMAT_JPG, 1), (IMAGE_FORMAT_BMP, 2), (IMAGE_FORMAT_GIF, 3),
            (IMAGE_FORMAT_WEBP, 4),
        ];
        let styles = [
            (STYLE_BOLD, 0), (STYLE_ITALIC, 1), (STYLE_UNDERLINE, 2), (STYLE_CODE, 3), (STYLE_QUOTE, 4),
            (STYLE_CROSSED_OUT, 5), (STYLE_LINK, 6),
        ];

        for (actual, pinned) in node_types.iter().chain(&flags).chain(&image_formats).chain(&styles) {
            assert_eq!(actual, pinned);
        }
    }

    /// Two node types sharing a tag would decode one as the other; the same for two style bits.
    #[test]
    fn no_two_tags_or_bits_collide() {
        let node_types = [
            NODE_PARAGRAPH, NODE_HEADER, NODE_HEADER2, NODE_HEADER3, NODE_HEADER4, NODE_ULIST, NODE_OLIST,
            NODE_LIST_ITEM, NODE_IMAGE, NODE_TABLE, NODE_TABLE_ROW, NODE_TABLE_CELL, NODE_CHECK,
        ];
        let styles = [STYLE_BOLD, STYLE_ITALIC, STYLE_UNDERLINE, STYLE_CODE, STYLE_QUOTE, STYLE_CROSSED_OUT, STYLE_LINK];
        for set in [&node_types[..], &styles[..]] {
            let mut sorted = set.to_vec();
            sorted.sort();
            sorted.dedup();
            assert_eq!(sorted.len(), set.len(), "duplicate value in {set:?}");
        }
        // A flag byte has eight bits.
        assert!(FLAG_CHECK_CHECKED < 8 && STYLE_LINK < 8);
    }
}
