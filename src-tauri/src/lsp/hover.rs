use serde::Serialize;
use crate::lsp::markdown::{MarkdownSections, extract_markdown_sections};
use crate::lsp::types::ContentType;

#[derive(Debug, Clone, Serialize)]
pub struct EnhancedHoverData {
    pub title: String,
    pub signature: Option<String>,
    pub documentation: Option<String>,
    pub source_code: Option<String>,
    pub raw: String,
    pub metadata: DocumentationMetadata,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocumentationMetadata {
    pub has_code_blocks: bool,
    pub has_tables: bool,
    pub has_lists: bool,
    pub content_type: ContentType,
    pub warning_messages: Vec<String>,
}

pub fn format_hover_data_enhanced(contents: String) -> Result<EnhancedHoverData, String> {
    if contents.is_empty() {
        return Err("Empty hover contents".to_string());
    }

    let mut metadata = DocumentationMetadata {
        has_code_blocks: false,
        has_tables: false,
        has_lists: false,
        content_type: ContentType::Generic,
        warning_messages: Vec::new(),
    };

    let sections = extract_markdown_sections(&contents);
    
    let content_type = determine_content_type(&sections);
    metadata.content_type = content_type.clone();

    let title = extract_title(&sections, &content_type);
    
    let signature = extract_signature(&sections);
    
    
    let documentation = Some(contents.clone());
    
    let source_code = extract_source_code(&sections, &mut metadata);

    
    metadata.has_code_blocks = !sections.code_blocks.is_empty();
    metadata.has_tables = !sections.tables.is_empty();
    metadata.has_lists = !sections.list_items.is_empty();

    Ok(EnhancedHoverData {
        title,
        signature,
        documentation,
        source_code,
        raw: contents,
        metadata,
    })
}

fn determine_content_type(sections: &MarkdownSections) -> ContentType {
    if sections.signatures.iter().any(|s| s.contains("fn ") || s.contains("function")) {
        ContentType::Function
    } else if sections.signatures.iter().any(|s| s.contains("struct ")) {
        ContentType::Struct
    } else if sections.signatures.iter().any(|s| s.contains("let ") || s.contains("const ")) {
        ContentType::Variable
    } else if sections.signatures.iter().any(|s| s.contains("mod ") || s.contains("module")) {
        ContentType::Module
    } else {
        ContentType::Generic
    }
}

fn extract_title(sections: &MarkdownSections, content_type: &ContentType) -> String {
    
    
    
    
    
    if let Some(title) = &sections.title {
        return title.clone();
    }
    
    if let Some(signature) = sections.signatures.first() {
        return extract_name_from_signature(signature, content_type);
    }
    
    match content_type {
        ContentType::Function => "Function".to_string(),
        ContentType::Struct => "Struct".to_string(),
        ContentType::Variable => "Variable".to_string(),
        ContentType::Module => "Module".to_string(),
        ContentType::Generic => "Documentation".to_string(),
    }
}

fn extract_name_from_signature(signature: &str, content_type: &ContentType) -> String {
    match content_type {
        ContentType::Function => {
            for pattern in crate::lsp::markdown::SIGNATURE_PATTERNS.iter() {
                if let Some(cap) = pattern.captures(signature) {
                    if let Some(name) = cap.get(2) {
                        return name.as_str().to_string();
                    }
                }
            }
            "Unnamed Function".to_string()
        },
        ContentType::Struct | ContentType::Module => {
            for pattern in crate::lsp::markdown::SIGNATURE_PATTERNS.iter() {
                if let Some(cap) = pattern.captures(signature) {
                    if let Some(name) = cap.get(2) {
                        return name.as_str().to_string();
                    }
                }
            }
            format!("Unnamed {}", content_type.to_string())
        },
        ContentType::Variable => {
            for pattern in crate::lsp::markdown::SIGNATURE_PATTERNS.iter() {
                if let Some(cap) = pattern.captures(signature) {
                    if let Some(name) = cap.get(2) {
                        return name.as_str().to_string();
                    }
                }
            }
            "Unnamed Variable".to_string()
        },
        ContentType::Generic => signature.chars().take(30).collect::<String>(),
    }
}

fn extract_source_code(sections: &MarkdownSections, metadata: &mut DocumentationMetadata) -> Option<String> {
    if sections.code_blocks.is_empty() {
        return None;
    }
    
    metadata.has_code_blocks = true;
    
    let combined_code = sections.code_blocks.join("\n\n");
    
    Some(combined_code)
}

fn extract_signature(sections: &MarkdownSections) -> Option<String> {
    sections.signatures.first().cloned()
}