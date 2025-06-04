use git2::{Repository, BranchType, Time, Status, StatusOptions, Signature};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "renamed", "untracked"
    pub staged: bool,
    pub unstaged: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitChanges {
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
}

fn format_timestamp(time: Time) -> String {
    let datetime = chrono::DateTime::from_timestamp(time.seconds(), 0)
        .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn status_to_string(status: Status) -> String {
    if status.contains(Status::WT_NEW) || status.contains(Status::INDEX_NEW) {
        "added".to_string()
    } else if status.contains(Status::WT_MODIFIED) || status.contains(Status::INDEX_MODIFIED) {
        "modified".to_string()
    } else if status.contains(Status::WT_DELETED) || status.contains(Status::INDEX_DELETED) {
        "deleted".to_string()
    } else if status.contains(Status::WT_RENAMED) || status.contains(Status::INDEX_RENAMED) {
        "renamed".to_string()
    } else {
        "untracked".to_string()
    }
}

#[command]
pub fn get_git_changes(path: String) -> Result<GitChanges, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.include_ignored(false);
    
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    
    for entry in statuses.iter() {
        let file_path = entry.path().unwrap_or("").to_string();
        let status = entry.status();
        let status_str = status_to_string(status);
        
        // Check if file is staged (in index)
        let is_staged = status.intersects(
            Status::INDEX_NEW | Status::INDEX_MODIFIED | Status::INDEX_DELETED | Status::INDEX_RENAMED | Status::INDEX_TYPECHANGE
        );
        
        // Check if file has unstaged changes
        let is_unstaged = status.intersects(
            Status::WT_NEW | Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED | Status::WT_TYPECHANGE
        );
        
        if is_staged {
            staged.push(GitFileStatus {
                path: file_path.clone(),
                status: status_str.clone(),
                staged: true,
                unstaged: is_unstaged,
            });
        }
        
        if is_unstaged {
            unstaged.push(GitFileStatus {
                path: file_path,
                status: status_str,
                staged: is_staged,
                unstaged: true,
            });
        }
    }
    
    Ok(GitChanges { staged, unstaged })
}

#[command]
pub fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    
    index.add_path(std::path::Path::new(&file_path)).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
pub fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let head_tree = head_commit.tree().map_err(|e| e.to_string())?;
    
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&file_path);
    
    // Reset the file in index to HEAD version
    if let Ok(entry) = head_tree.get_path(path) {
        index.add(&git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: entry.filemode() as u32,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: entry.id(),
            flags: 0,
            flags_extended: 0,
            path: file_path.as_bytes().to_vec(),
        }).map_err(|e| e.to_string())?;
    } else {
        // File is new, remove it from index
        index.remove_path(path).map_err(|e| e.to_string())?;
    }
    
    index.write().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
pub fn stage_all_files(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
pub fn commit_changes(repo_path: String, message: String, author_name: String, author_email: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let signature = Signature::now(&author_name, &author_email).map_err(|e| e.to_string())?;
    
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    
    let parent_commit = match repo.head() {
        Ok(head) => Some(head.peel_to_commit().map_err(|e| e.to_string())?),
        Err(_) => None, // First commit
    };
    
    let parents: Vec<&git2::Commit> = match &parent_commit {
        Some(commit) => vec![commit],
        None => vec![],
    };
    
    let commit_id = repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &tree,
        &parents,
    ).map_err(|e| e.to_string())?;
    
    Ok(commit_id.to_string())
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
            // Skip symbolic references like origin/HEAD
            if name.ends_with("/HEAD") {
                continue;
            }
            
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