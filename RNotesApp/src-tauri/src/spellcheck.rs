use crate::config::Config;
use serde::Serialize;
use spellbook::Dictionary;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{command, State};

/// Spell checker component that includes 4 dictionary files compiled into the binary instead of shipped as Tauri resources: 
/// two English (en/aff, en/dic) and two Spanish (es/aff, es/dic). 
/// This approach removes a whole class of "works on my machine" issues because the resource path resolves identically 
/// in both tauri dev and installed builds. 

const EN_AFF: &str = include_str!("../dictionaries/en/index.aff");
const EN_DIC: &str = include_str!("../dictionaries/en/index.dic");
const ES_AFF: &str = include_str!("../dictionaries/es/index.aff");
const ES_DIC: &str = include_str!("../dictionaries/es/index.dic");

const FALLBACK_LANGUAGE: &str = "en";
const MAX_SUGGESTIONS: usize = 8;

/// Words that legitimately end in a period, so the sentence after them is not a new one. 
const ABBREVIATIONS: [&str; 24] = [
    "etc", "vs", "sr", "sra", "srta", "dr", "dra", "ud", "uds", "av", "pag", "num", "ej", "mr",
    "mrs", "ms", "jr", "st", "inc", "ltd", "no", "vol", "fig", "cf",
];

/// One thing worth underlining, with offsets the frontend can use directly. 
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SpellIssue {
    /// UTF-16 offsets because that is what a JavaScript string and therefore a Slate offset counts in. Byte offsets would land in the wrong place on any accented word.
    pub start: usize,
    pub end: usize,
    /// The exact slice being flagged so a replacement does not have to re-slice the text.
    pub text: String,
    /// Stable id the frontend turns into a translated message.
    pub rule: String,
    pub suggestions: Vec<String>,
}

impl SpellIssue {
    fn new(start: usize, end: usize, text: &str, rule: &str, suggestions: Vec<String>) -> Self {
        SpellIssue {
            start,
            end,
            text: text.to_string(),
            rule: rule.to_string(),
            suggestions,
        }
    }
}

/// Parses a dictionary once and caches it for the life of the process rather than parsing per keystroke because parsing takes long enough. There are only ever two dictionaries loaded so caching makes sense. 
fn load_dictionary_cached(language: &str) -> Option<&'static Dictionary> {
    static CACHE: OnceLock<Mutex<HashMap<String, &'static Dictionary>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut loaded = cache.lock().unwrap();

    if let Some(dictionary) = loaded.get(language) {
        return Some(*dictionary);
    }

    let (aff, dic) = match language {
        "en" => (EN_AFF, EN_DIC),
        "es" => (ES_AFF, ES_DIC),
        _ => return None,
    };

    let parsed = Dictionary::new(aff, dic).ok()?;
    let dictionary: &'static Dictionary = Box::leak(Box::new(parsed));
    loaded.insert(language.to_string(), dictionary);
    Some(dictionary)
}

/// Reduces a tag like es-AR to the dictionary that covers it by taking only the language code part and falling back to English. 
fn normalize_language_code(requested: &str) -> &'static str {
    match requested.split(['-', '_']).next().unwrap_or("").to_lowercase().as_str() {
        "es" => "es",
        _ => FALLBACK_LANGUAGE,
    }
}

struct SpellToken<'a> {
    text: &'a str,
    /// Byte range for looking at the surrounding characters.
    byte_start: usize,
    byte_end: usize,
    /// UTF-16 range for the frontend.
    start: usize,
    end: usize,
}

/// Returns true if a character is a letter or an apostrophe variant including curly quotes. 
fn has_letter_or_apostrophe(c: char) -> bool {
    c.is_alphabetic() || c == '\'' || c == '\u{2019}'
}

/// Checks whether a character is any kind of apostrophe mark including straight and curly variants. 
fn is_curly_quote_mark(c: char) -> bool {
    c == '\'' || c == '\u{2019}'
}

/// Creates a token with both byte and UTF-16 offsets by splitting into candidate words, carrying both ranges. Leading and trailing apostrophes are trimmed so dogs checks as dogs. 
fn create_token<'a>(
    tokens: &mut Vec<SpellToken<'a>>,
    text: &'a str,
    byte_start: usize,
    byte_end: usize,
    start: usize,
    end: usize,
) {
    let raw = &text[byte_start..byte_end];
    let trimmed_front = raw.len() - raw.trim_start_matches(is_curly_quote_mark).len();
    let body = raw.trim_matches(is_curly_quote_mark);
    if body.is_empty() {
        return;
    }

    let lead = raw[..trimmed_front].chars().map(char::len_utf16).sum::<usize>();
    let trail = raw[trimmed_front + body.len()..]
        .chars()
        .map(char::len_utf16)
        .sum::<usize>();

    tokens.push(SpellToken {
        text: body,
        byte_start: byte_start + trimmed_front,
        byte_end: byte_start + trimmed_front + body.len(),
        start: start + lead,
        end: end - trail,
    });
}

/// Breaks text into tokens carrying both byte and UTF-16 offsets by iterating through characters and creating tokens around word characters. 
fn break_text_into_tokens(text: &str) -> Vec<SpellToken<'_>> {
    let mut tokens = Vec::new();
    let mut open: Option<(usize, usize)> = None;
    let mut utf16 = 0usize;

    for (byte_index, ch) in text.char_indices() {
        if has_letter_or_apostrophe(ch) {
            if open.is_none() {
                open = Some((byte_index, utf16));
            }
        } else if let Some((byte_start, start)) = open.take() {
            create_token(&mut tokens, text, byte_start, byte_index, start, utf16);
        }
        utf16 += ch.len_utf16();
    }

    if let Some((byte_start, start)) = open {
        create_token(&mut tokens, text, byte_start, text.len(), start, utf16);
    }

    tokens
}

/// Finds URL email or path ranges that hold protected content so everything inside them is left alone from spelling checks. 
fn find_url_email_path_ranges(text: &str) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut chunk_start: Option<usize> = None;

    let close = |spans: &mut Vec<(usize, usize)>, start: usize, end: usize| {
        let chunk = &text[start..end];
        if chunk.contains("://") || chunk.contains('@') || chunk.starts_with("www.") {
            spans.push((start, end));
        }
    };

    for (index, ch) in text.char_indices() {
        if ch.is_whitespace() {
            if let Some(start) = chunk_start.take() {
                close(&mut spans, start, index);
            }
        } else if chunk_start.is_none() {
            chunk_start = Some(index);
        }
    }
    if let Some(start) = chunk_start {
        close(&mut spans, start, text.len());
    }

    spans
}

/// Looks at the character immediately before a byte index and returns it if available. 
fn peek_char_at_end_of_string(text: &str, byte_index: usize) -> Option<char> {
    text[..byte_index].chars().next_back()
}

/// Looks at the character immediately after a byte index and returns it if available. 
fn peek_char_at_start_of_string(text: &str, byte_index: usize) -> Option<char> {
    text[byte_index..].chars().next()
}

/// Returns true when a token is glued to a digit making it part of something like utf8 or A4 rather than a standalone word to check. 
fn has_adjacent_digit(text: &str, token: &SpellToken<'_>) -> bool {
    peek_char_at_end_of_string(text, token.byte_start).is_some_and(|c| c.is_numeric())
        || peek_char_at_start_of_string(text, token.byte_end).is_some_and(|c| c.is_numeric())
}

/// Capitalizes a word by converting its first letter to uppercase. 
fn first_letter_uppercase(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Detects misspelled words by checking each token against the dictionary and collecting issues with suggestions. 
fn detect_typos(
    text: &str,
    tokens: &[SpellToken<'_>],
    dictionary: &Dictionary,
    user_words: &[String],
    protected: &[(usize, usize)],
    issues: &mut Vec<SpellIssue>,
) {
    for token in tokens {
        if token.text.chars().count() < 2 {
            continue;
        }
        if protected.iter().any(|(s, e)| token.byte_start >= *s && token.byte_end <= *e) {
            continue;
        }
        if has_adjacent_digit(text, token) {
            continue;
        }

        let lowered = token.text.to_lowercase();
        if user_words.iter().any(|w| w.to_lowercase() == lowered) {
            continue;
        }
        if dictionary.check(token.text) {
            continue;
        }

        let mut suggestions = Vec::new();
        dictionary.suggest(token.text, &mut suggestions);
        suggestions.truncate(MAX_SUGGESTIONS);
        issues.push(SpellIssue::new(token.start, token.end, token.text, "spelling", suggestions));
    }
}

/// Detects mechanical grammar rules with no judgement call in them by checking for repeated words double spaces and space before punctuation. 
fn detect_mechanical_errors(text: &str, tokens: &[SpellToken<'_>], protected: &[(usize, usize)], issues: &mut Vec<SpellIssue>) {
    let is_protected = |start: usize, end: usize| protected.iter().any(|(s, e)| start >= *s && end <= *e);

    // The same word twice in a row with nothing but blanks between them. 
    for pair in tokens.windows(2) {
        let (first, second) = (&pair[0], &pair[1]);
        if is_protected(first.byte_start, second.byte_end) {
            continue;
        }
        let between = &text[first.byte_end..second.byte_start];
        if between.is_empty() || !between.chars().all(|c| c == ' ') {
            continue;
        }
        if first.text.to_lowercase() == second.text.to_lowercase() {
            issues.push(SpellIssue::new(
                first.start,
                second.end,
                &text[first.byte_start..second.byte_end],
                "repeated-word",
                vec![first.text.to_string()],
            ));
        }
    }

    // Two or more spaces where one belongs. 
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut utf16_at = Vec::with_capacity(chars.len() + 1);
    let mut running = 0usize;
    for (_, ch) in &chars {
        utf16_at.push(running);
        running += ch.len_utf16();
    }
    utf16_at.push(running);

    let mut index = 0usize;
    while index < chars.len() {
        let (byte_index, ch) = chars[index];

        if ch == ' ' {
            let mut run_end = index;
            while run_end < chars.len() && chars[run_end].1 == ' ' {
                run_end += 1;
            }
            if run_end - index > 1 && !is_protected(byte_index, chars[run_end - 1].0 + 1) {
                issues.push(SpellIssue::new(
                    utf16_at[index],
                    utf16_at[run_end],
                    &text[byte_index..chars[run_end - 1].0 + 1],
                    "double-space",
                    vec![" ".to_string()],
                ));
            }
            index = run_end;
            continue;
        }
        index += 1;
    }

    // A blank pushed up against closing punctuation. 
    for (position, (byte_index, ch)) in chars.iter().enumerate() {
        if *ch != ' ' {
            continue;
        }
        let Some((_, next)) = chars.get(position + 1) else { continue };
        if !matches!(next, ',' | ';' | ':' | '.' | '!' | '?' | '%') {
            continue;
        }
        // A run of spaces is already reported as a double space. 
        if position > 0 && chars[position - 1].1 == ' ' {
            continue;
        }
        if is_protected(*byte_index, byte_index + 1) {
            continue;
        }
        issues.push(SpellIssue::new(
            utf16_at[position],
            utf16_at[position + 1],
            " ",
            "space-before-punctuation",
            vec![String::new()],
        ));
    }

    // A sentence that starts in lower case. 
    for window in tokens.windows(2) {
        let (previous, word) = (&window[0], &window[1]);
        let between = &text[previous.byte_end..word.byte_start];
        let Some(stop) = between.chars().next() else { continue };
        if !matches!(stop, '.' | '!' | '?') {
            continue;
        }
        if between.len() < 2 || !between[1..].chars().all(char::is_whitespace) {
            continue;
        }
        if peek_char_at_end_of_string(text, previous.byte_end).is_some_and(|c| c.is_numeric()) {
            continue;
        }
        if ABBREVIATIONS.contains(&previous.text.to_lowercase().as_str()) {
            continue;
        }
        let Some(first) = word.text.chars().next() else { continue };
        if !first.is_lowercase() {
            continue;
        }
        if is_protected(word.byte_start, word.byte_end) {
            continue;
        }
        issues.push(SpellIssue::new(
            word.start,
            word.end,
            word.text,
            "lowercase-after-period",
            vec![first_letter_uppercase(word.text)],
        ));
    }
}

/// Checks one run of text by tokenizing protecting URLs and detecting both spelling and grammar issues. 
/// Called per block so the frontend can cache per block and only redo the one the caret is in. 
pub fn fast_check(text: &str, language: &str, user_words: &[String]) -> Vec<SpellIssue> {
    let Some(dictionary) = load_dictionary_cached(normalize_language_code(language)) else {
        return Vec::new();
    };

    let tokens = break_text_into_tokens(text);
    let protected = find_url_email_path_ranges(text);
    let mut issues = Vec::new();

    detect_typos(text, &tokens, dictionary, user_words, &protected, &mut issues);
    detect_mechanical_errors(text, &tokens, &protected, &mut issues);

    issues.sort_by_key(|issue| (issue.start, issue.end));
    issues
}

/// Checks spelling and grammar in text by validating words against the dictionary and applying mechanical rules like repeated words double spaces and lowercase after periods. 
#[command]
pub fn check_spelling(text: String, language: String, state: State<Config>) -> Vec<SpellIssue> {
    fast_check(&text, &language, &state.get_settings().personal_dictionary)
}

/// Checks a whole document in one call so the review dialog does not fire one command per block. 
#[command]
pub fn check_spelling_batch(blocks: Vec<String>, language: String, state: State<Config>) -> Vec<Vec<SpellIssue>> {
    let user_words = state.get_settings().personal_dictionary;
    blocks.iter().map(|block| fast_check(block, &language, &user_words)).collect()
}

/// Gets all words currently in the personal dictionary from the settings state. 
#[command]
pub fn get_dictionary_words(state: State<Config>) -> Vec<String> {
    state.get_settings().personal_dictionary
}

/// Adds a word to the personal dictionary by calling the state methods to store it. 
#[command]
pub fn add_dictionary_word(word: String, state: State<Config>) -> Vec<String> {
    state.add_word_to_dictionary(&word)
}

/// Removes a word from the personal dictionary by calling the state methods to delete it. 
#[command]
pub fn remove_dictionary_word(word: String, state: State<Config>) -> Vec<String> {
    state.delete_word_from_dictionary(&word)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(issues: &[SpellIssue]) -> Vec<&str> {
        issues.iter().map(|i| i.rule.as_str()).collect()
    }

    /// Tests UTF-16 offsets so accents do not shift them because "café" is 5 bytes but 4 UTF-16 units and the emoji is 2 units on its own. 
    #[test]
    fn offsets_are_utf16_so_accents_do_not_shift_them() {
        let text = "café 🧐📸 xyzzyx";
        let issues = fast_check(text, "es", &[]);
        let misspelled: Vec<_> = issues.iter().filter(|i| i.rule == "spelling").collect();
        assert_eq!(misspelled.len(), 1, "only the invented word should be flagged");
        assert_eq!(misspelled[0].text, "xyzzyx");
        // café is 4 units the space 1 the emojis 4 and the next space 1 so the word starts at 10. 
        assert_eq!(misspelled[0].start, 10);
        assert_eq!(misspelled[0].end, 16);
    }

    /// Tests that user words are accepted case-insensitively by flagging a misspelling without the word in dictionary and confirming it is accepted when added. 
    #[test]
    fn user_words_are_accepted_case_insensitively() {
        let invented = "Razeball";
        assert_eq!(rules(&fast_check(invented, "en", &[])), vec!["spelling"]);
        assert!(fast_check(invented, "en", &["razeball".to_string()]).is_empty());
    }

    /// Tests mechanical grammar rules like repeated words double spaces space before punctuation and lowercase after period. 
    #[test]
    fn catches_the_mechanical_grammar_rules() {
        let repeated = fast_check("the the cat", "en", &[]);
        assert!(rules(&repeated).contains(&"repeated-word"));

        let spaced = fast_check("hello  world", "en", &[]);
        assert!(rules(&spaced).contains(&"double-space"));

        let punctuated = fast_check("hello , world", "en", &[]);
        assert!(rules(&punctuated).contains(&"space-before-punctuation"));

        let sentence = fast_check("One thing. two things", "en", &[]);
        let lowercase: Vec<_> = sentence.iter().filter(|i| i.rule == "lowercase-after-period").collect();
        assert_eq!(lowercase.len(), 1);
        assert_eq!(lowercase[0].suggestions, vec!["Two".to_string()]);
    }
}