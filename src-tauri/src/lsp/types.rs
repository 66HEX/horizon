use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentType {
    Function,
    Struct, 
    Variable,
    Module,
    Generic,
}

impl std::fmt::Display for ContentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContentType::Function => write!(f, "Function"),
            ContentType::Struct => write!(f, "Struct"),
            ContentType::Variable => write!(f, "Variable"),
            ContentType::Module => write!(f, "Module"),
            ContentType::Generic => write!(f, "Generic"),
        }
    }
} 