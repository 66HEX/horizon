use regex::Regex;
use once_cell::sync::Lazy;


pub static CODE_BLOCK_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"```(\w+)?\n?([\s\S]*?)```").unwrap());
pub static INLINE_CODE_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"`([^`]+)`").unwrap());
pub static HEADERS_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(#{1,6})\s+(.*)$").unwrap());
pub static LINK_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());
pub static EMPHASIS_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"\*\*(.*?)\*\*|__(.*?)__").unwrap());
pub static ITALIC_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"\*([^*]+)\*").unwrap());
pub static LIST_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\s*)([-*+]|\d+\.)\s+(.*)$").unwrap());
pub static TABLE_ROW_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\|(?:[^|]+\|)+$").unwrap());
pub static TABLE_SEPARATOR_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\|?(\s*:?-+:?\s*\|)+\s*$").unwrap());
pub static SIGNATURE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| vec![
    Regex::new(r"\b(pub\s+)?fn\s+(\w+)\s*\((.*?)\)(\s*->\s*[^{]+)?").unwrap(),
    Regex::new(r"\b(pub\s+)?struct\s+(\w+)\s*[<{]?").unwrap(),
    Regex::new(r"\b(pub\s+)?enum\s+(\w+)\s*[<{]?").unwrap(),
    Regex::new(r"\b(const|let)\s+(\w+)\s*:?\s*([^=]+)?=?").unwrap(),
    Regex::new(r"\b(function|var|const|let)\s+(\w+)\s*\((.*?)\)(\s*:\s*[^{]+)?").unwrap(), 
]);


#[derive(Debug, Default)]
pub struct MarkdownSections {
    pub title: Option<String>,
    pub signatures: Vec<String>,
    pub documentation_lines: Vec<String>,
    pub code_blocks: Vec<String>,
    pub inline_code: Vec<String>,
    pub links: Vec<(String, String)>,
    pub emphasized_text: Vec<String>,
    pub italic_text: Vec<String>,
    pub list_items: Vec<(u32, String)>,
    pub tables: Vec<Vec<Vec<String>>>,
}

impl MarkdownSections {
    pub fn new() -> Self {
        MarkdownSections::default()
    }
}


#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Section {
    Title,
    Signature, 
    Documentation,
    CodeBlock,
    Unknown,
}


pub fn extract_markdown_sections(content: &str) -> MarkdownSections {
    let mut sections = MarkdownSections::new();
    
    
    for cap in CODE_BLOCK_PATTERN.captures_iter(content) {
        if let Some(code) = cap.get(2) {
            sections.code_blocks.push(code.as_str().trim().to_string());
        }
    }
    
    
    for cap in INLINE_CODE_PATTERN.captures_iter(content) {
        if let Some(code) = cap.get(1) {
            sections.inline_code.push(code.as_str().to_string());
        }
    }
    
    
    for cap in LINK_PATTERN.captures_iter(content) {
        if let (Some(text), Some(url)) = (cap.get(1), cap.get(2)) {
            sections.links.push((text.as_str().to_string(), url.as_str().to_string()));
        }
    }
    
    
    for cap in EMPHASIS_PATTERN.captures_iter(content) {
        if let Some(text) = cap.get(1).or_else(|| cap.get(2)) {
            sections.emphasized_text.push(text.as_str().to_string());
        }
    }
    
    
    for cap in ITALIC_PATTERN.captures_iter(content) {
        if let Some(text) = cap.get(1) {
            sections.italic_text.push(text.as_str().to_string());
        }
    }
    
    
    for (_idx, line) in content.lines().enumerate() {
        if let Some(cap) = LIST_PATTERN.captures(line) {
            if let Some(content) = cap.get(3) {
                sections.list_items.push((0, content.as_str().to_string()));
            }
        }
    }
    
    
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    
    while i < lines.len() {
        let line = lines[i];
        
        
        if TABLE_ROW_PATTERN.is_match(line) {
            
            let mut current_table: Vec<Vec<String>> = Vec::new();
            let mut j = i;
            
            
            while j < lines.len() && 
                  (TABLE_ROW_PATTERN.is_match(lines[j]) || 
                   TABLE_SEPARATOR_PATTERN.is_match(lines[j])) {
                
                let row = lines[j];
                
                
                if !TABLE_SEPARATOR_PATTERN.is_match(row) {
                    
                    let cells: Vec<String> = row
                        .trim()
                        .trim_start_matches('|')
                        .trim_end_matches('|')
                        .split('|')
                        .map(|cell| cell.trim().to_string())
                        .collect();
                    
                    if !cells.is_empty() {
                        current_table.push(cells);
                    }
                }
                
                j += 1;
            }
            
            
            if !current_table.is_empty() {
                sections.tables.push(current_table);
            }
            
            
            i = j;
        } else {
            i += 1;
        }
    }
    
    
    for pattern in SIGNATURE_PATTERNS.iter() {
        for cap in pattern.captures_iter(content) {
            if let Some(sig) = cap.get(0) {
                sections.signatures.push(sig.as_str().to_string());
            }
        }
    }
    
    
    if let Some(cap) = HEADERS_PATTERN.captures(content) {
        if let Some(header_content) = cap.get(2) {
            sections.title = Some(header_content.as_str().to_string());
        }
    }
    
    
    let mut in_code_block = false;
    let mut in_table = false;
    
    for line in &lines {
        let trimmed = line.trim();
        
        
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        
        
        if !in_code_block {
            let is_table_row = TABLE_ROW_PATTERN.is_match(trimmed);
            let is_separator = TABLE_SEPARATOR_PATTERN.is_match(trimmed);
            
            if is_table_row || is_separator {
                in_table = true;
            } else if in_table {
                in_table = false;
            }
        }
        
        if !in_code_block && !trimmed.is_empty() {
            
            let is_signature = SIGNATURE_PATTERNS.iter().any(|pattern| pattern.is_match(trimmed));
            
            if !is_signature && !in_table {
                sections.documentation_lines.push(trimmed.to_string());
            }
        }
        
    }
    
    sections
}


pub fn sanitize_markdown_comprehensive(text: &str) -> String {
    let mut result = text.to_string();
    
    
    let special_chars = vec!['*', '_', '#', '>', '+', '-', '.', '!', 
                             '[', ']', '(', ')', '{', '}', '\\', '|'];
    
    let mut i = 0;
    while i < result.len() {
        for &ch in &special_chars {
            if result[i..].starts_with(ch) && !is_in_code_context(&result, i) {
                result.replace_range(i..i+1, &format!("\\{}", ch));
                i += 1; 
                break;
            }
        }
        i += 1;
    }
    
    result
}

pub fn is_in_code_context(text: &str, position: usize) -> bool {
    let before = &text[..position];
    
    
    let backticks_before = before.matches('`').count();
    
    
    let code_blocks_before = before.matches("```").count();
    
    
    
    (backticks_before % 2 == 1) || (code_blocks_before % 2 == 1)
}

pub fn format_markdown_safely(content: &str) -> String {
    let mut result = String::with_capacity(content.len() * 2);
    let mut chars = content.chars().peekable();
    let mut in_code = false;
    let mut in_code_block = false;
    
    while let Some(ch) = chars.next() {
        match ch {
            '`' => {
                if chars.peek() == Some(&'`') {
                    
                    let mut block_marker = String::new();
                    block_marker.push('`');
                    block_marker.push(chars.next().unwrap());
                    block_marker.push(chars.next().unwrap_or('`'));
                    
                    if block_marker == "```" {
                        in_code_block = !in_code_block;
                        result.push_str("```");
                    }
                } else {
                    in_code = !in_code;
                    result.push('`');
                }
            },
            '\\' if !in_code && !in_code_block => {
                
                result.push('\\');
                if let Some(next) = chars.next() {
                    result.push(next);
                }
            },
            '*' | '_' if !in_code && !in_code_block => {
                
                result.push('\\');
                result.push(ch);
            },
            '#' if !in_code && !in_code_block => {
                
                result.push('\\');
                result.push(ch);
            },
            '>' if !in_code && !in_code_block => {
                
                result.push('\\');
                result.push(ch);
            },
            '[' | ']' | '(' | ')' if !in_code && !in_code_block => {
                
                result.push('\\');
                result.push(ch);
            },
            '|' if !in_code && !in_code_block => {
                
                result.push('\\');
                result.push(ch);
            },
            _ => result.push(ch),
        }
    }
    
    result
}

pub fn format_code_safely(code: &str) -> String {
    let lines: Vec<&str> = code.lines().collect();
    let mut formatted = Vec::new();
    
    for line in lines {
        
        formatted.push(line.to_string());
    }
    
    formatted.join("\n")
}

pub fn clean_title(title: &str) -> String {
    let title = title.trim();
    
    
    let cleaned = title
        .replace("# ", "")
        .replace("## ", "")
        .replace("### ", "")
        .replace("#### ", "")
        .replace("**", "")
        .replace("*", "")
        .replace("`", "");
    
    
    if cleaned.len() > 100 {
        format!("{}...", &cleaned[..97])
    } else {
        cleaned
    }
}