use git2::{Repository, Oid, ObjectType, BranchType, Time};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub commit_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommit {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub current_branch: Option<String>,
    pub is_repo: bool,
    pub has_changes: bool,
    pub ahead: usize,
    pub behind: usize,
}

fn format_timestamp(time: Time) -> String {
    let datetime = chrono::DateTime::from_timestamp(time.seconds(), 0)
        .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}

#[command]
pub fn get_git_status(path: String) -> Result<GitStatus, String> {
    let repo = match Repository::open(&path) {
        Ok(repo) => repo,
        Err(_) => {
            return Ok(GitStatus {
                current_branch: None,
                is_repo: false,
                has_changes: false,
                ahead: 0,
                behind: 0,
            });
        }
    };

    let head = repo.head().map_err(|e| e.to_string())?;
    let current_branch = if head.is_branch() {
        head.shorthand().map(|s| s.to_string())
    } else {
        None
    };

    let statuses = repo.statuses(None).map_err(|e| e.to_string())?;
    let has_changes = !statuses.is_empty();

    Ok(GitStatus {
        current_branch,
        is_repo: true,
        has_changes,
        ahead: 0, // TODO: implement ahead/behind calculation
        behind: 0,
    })
}

#[command]
pub fn get_git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut branches = Vec::new();

    let current_branch_name = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()));

    // Get local branches
    let local_branches = repo.branches(Some(BranchType::Local)).map_err(|e| e.to_string())?;
    for branch_result in local_branches {
        let (branch, _) = branch_result.map_err(|e| e.to_string())?;
        if let Some(name) = branch.name().map_err(|e| e.to_string())? {
            let is_current = current_branch_name.as_ref() == Some(&name.to_string());
            let commit_id = branch
                .get()
                .target()
                .map(|oid| oid.to_string())
                .unwrap_or_default();

            branches.push(GitBranch {
                name: name.to_string(),
                is_current,
                is_remote: false,
                commit_id,
            });
        }
    }

    // Get remote branches
    let remote_branches = repo.branches(Some(BranchType::Remote)).map_err(|e| e.to_string())?;
    for branch_result in remote_branches {
        let (branch, _) = branch_result.map_err(|e| e.to_string())?;
        if let Some(name) = branch.name().map_err(|e| e.to_string())? {
            let commit_id = branch
                .get()
                .target()
                .map(|oid| oid.to_string())
                .unwrap_or_default();

            branches.push(GitBranch {
                name: name.to_string(),
                is_current: false,
                is_remote: true,
                commit_id,
            });
        }
    }

    Ok(branches)
}

#[command]
pub fn get_git_commits(path: String, limit: Option<usize>) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut commits = Vec::new();
    let limit = limit.unwrap_or(50);

    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| e.to_string())?;

    for (index, oid) in revwalk.enumerate() {
        if index >= limit {
            break;
        }

        let oid = oid.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;

        let message = commit.message().unwrap_or("").to_string();
        let author = commit.author();
        let author_name = author.name().unwrap_or("Unknown").to_string();
        let author_email = author.email().unwrap_or("").to_string();
        let time = author.when();

        commits.push(GitCommit {
            id: oid.to_string(),
            short_id: oid.to_string()[..7].to_string(),
            message,
            author_name,
            author_email,
            timestamp: time.seconds(),
            date: format_timestamp(time),
        });
    }

    Ok(commits)
}

#[command]
pub fn is_git_repository(path: String) -> Result<bool, String> {
    match Repository::open(&path) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
} 