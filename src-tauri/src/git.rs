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

#[derive(Debug, Serialize, Deserialize)]
pub struct GitRemoteStatus {
    pub remote_name: String,
    pub remote_url: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub has_remote: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitPushResult {
    pub success: bool,
    pub message: String,
    pub pushed_commits: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitPullResult {
    pub success: bool,
    pub message: String,
    pub new_commits: usize,
    pub conflicts: Vec<String>,
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

#[command]
pub fn get_remote_status(repo_path: String) -> Result<GitRemoteStatus, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    
    // Get current branch
    let head = repo.head().map_err(|e| e.to_string())?;
    let local_branch = head.peel_to_commit().map_err(|e| e.to_string())?;
    
    // Try to get remote info
    let remote_name = "origin".to_string();
    let remote = match repo.find_remote(&remote_name) {
        Ok(remote) => remote,
        Err(_) => {
            return Ok(GitRemoteStatus {
                remote_name,
                remote_url: None,
                ahead: 0,
                behind: 0,
                has_remote: false,
            });
        }
    };
    
    let remote_url = remote.url().map(|s| s.to_string());
    
    // Get remote branch reference
    let current_branch_name = head.shorthand().unwrap_or("main");
    let remote_branch_name = format!("refs/remotes/origin/{}", current_branch_name);
    
    let (ahead, behind) = match repo.find_reference(&remote_branch_name) {
        Ok(remote_ref) => {
            let remote_commit = remote_ref.peel_to_commit().map_err(|e| e.to_string())?;
            
            // Calculate ahead/behind
            let (ahead, behind) = repo.graph_ahead_behind(local_branch.id(), remote_commit.id())
                .map_err(|e| e.to_string())?;
            
            (ahead, behind)
        }
        Err(_) => (0, 0), // Remote branch not found
    };
    
    Ok(GitRemoteStatus {
        remote_name,
        remote_url,
        ahead,
        behind,
        has_remote: true,
    })
}

#[command]
pub fn fetch_from_remote(repo_path: String, remote_name: Option<String>) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
    
    let mut remote = repo.find_remote(&remote_name).map_err(|e| e.to_string())?;
    
    // Create callbacks for authentication
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, _allowed_types| {
        git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });
    
    // Fetch from remote
    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    
    remote.fetch(&[] as &[&str], Some(&mut fetch_options), None)
        .map_err(|e| e.to_string())?;
    
    // Get fetch head info
    let stats = remote.stats();
    let message = format!(
        "Fetched {} objects from {}",
        stats.received_objects(),
        remote_name
    );
    
    Ok(message)
}

#[command]
pub fn pull_from_remote(repo_path: String, remote_name: Option<String>) -> Result<GitPullResult, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
    
    // First fetch
    fetch_from_remote(repo_path.clone(), Some(remote_name.clone()))?;
    
    // Get current branch
    let head = repo.head().map_err(|e| e.to_string())?;
    let current_branch_name = head.shorthand().unwrap_or("main");
    let remote_branch_name = format!("refs/remotes/{}/{}", remote_name, current_branch_name);
    
    // Get remote commit
    let remote_ref = repo.find_reference(&remote_branch_name).map_err(|e| e.to_string())?;
    let remote_commit = remote_ref.peel_to_commit().map_err(|e| e.to_string())?;
    let local_commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    
    // Check if we're already up to date
    if local_commit.id() == remote_commit.id() {
        return Ok(GitPullResult {
            success: true,
            message: "Already up to date".to_string(),
            new_commits: 0,
            conflicts: vec![],
        });
    }
    
    // Perform merge
    let local_tree = local_commit.tree().map_err(|e| e.to_string())?;
    let remote_tree = remote_commit.tree().map_err(|e| e.to_string())?;
    
    // Find merge base
    let merge_base = repo.merge_base(local_commit.id(), remote_commit.id())
        .map_err(|e| e.to_string())?;
    let base_commit = repo.find_commit(merge_base).map_err(|e| e.to_string())?;
    let base_tree = base_commit.tree().map_err(|e| e.to_string())?;
    
    // Perform three-way merge
    let merge_index = repo.merge_trees(&base_tree, &local_tree, &remote_tree, None)
        .map_err(|e| e.to_string())?;
    
    // Check for conflicts
    if merge_index.has_conflicts() {
        let conflicts: Vec<String> = merge_index.conflicts().map_err(|e| e.to_string())?
            .flatten()
            .filter_map(|conflict| {
                conflict.our.as_ref().and_then(|entry| {
                    std::str::from_utf8(&entry.path).ok().map(|s| s.to_string())
                })
            })
            .collect();
        
        return Ok(GitPullResult {
            success: false,
            message: format!("Merge conflicts in {} files", conflicts.len()),
            new_commits: 0,
            conflicts,
        });
    }
    
    // Write merged index to repository index
    let mut repo_index = repo.index().map_err(|e| e.to_string())?;
    
    // Copy entries from merge_index to repo_index
    repo_index.clear().map_err(|e| e.to_string())?;
    for i in 0..merge_index.len() {
        if let Some(entry) = merge_index.get(i) {
            repo_index.add(&entry).map_err(|e| e.to_string())?;
        }
    }
    repo_index.write().map_err(|e| e.to_string())?;

    // If fast-forward possible, just update HEAD
    let (ahead, behind) = repo.graph_ahead_behind(local_commit.id(), remote_commit.id())
        .map_err(|e| e.to_string())?;
    
    if ahead == 0 {
        // Fast-forward merge
        let refname = format!("refs/heads/{}", current_branch_name);
        repo.reference(&refname, remote_commit.id(), true, "Fast-forward merge")
            .map_err(|e| e.to_string())?;
        
        // Update working directory
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| e.to_string())?;
        
        Ok(GitPullResult {
            success: true,
            message: format!("Fast-forward: {} new commits", behind),
            new_commits: behind,
            conflicts: vec![],
        })
    } else {
        // Create merge commit
        let tree_id = repo_index.write_tree().map_err(|e| e.to_string())?;
        let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
        
        let signature = repo.signature().map_err(|e| e.to_string())?;
        let message = format!("Merge remote-tracking branch '{}/{}'", remote_name, current_branch_name);
        
        let _merge_commit = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &message,
            &tree,
            &[&local_commit, &remote_commit],
        ).map_err(|e| e.to_string())?;
        
        // Update working directory
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| e.to_string())?;
        
        Ok(GitPullResult {
            success: true,
            message: format!("Merge completed: {} new commits", behind),
            new_commits: behind,
            conflicts: vec![],
        })
    }
}

#[command]
pub fn push_to_remote(repo_path: String, remote_name: Option<String>) -> Result<GitPushResult, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let remote_name = remote_name.unwrap_or_else(|| "origin".to_string());
    
    // Get current branch
    let head = repo.head().map_err(|e| e.to_string())?;
    let current_branch_name = head.shorthand().unwrap_or("main");
    
    let mut remote = repo.find_remote(&remote_name).map_err(|e| e.to_string())?;
    
    // Create callbacks for authentication
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, _allowed_types| {
        git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });
    
    callbacks.push_update_reference(|refname, status| {
        match status {
            Some(msg) => {
                println!("Failed to push {}: {}", refname, msg);
                Ok(())
            },
            None => {
                println!("Successfully pushed {}", refname);
                Ok(())
            }
        }
    });
    
    // Set up push options
    let mut push_options = git2::PushOptions::new();
    push_options.remote_callbacks(callbacks);
    
    // Push the current branch
    let refspec = format!("refs/heads/{}:refs/heads/{}", current_branch_name, current_branch_name);
    
    match remote.push(&[&refspec], Some(&mut push_options)) {
        Ok(_) => {
            // Calculate how many commits were pushed
            let remote_status = get_remote_status(repo_path)?;
            
            Ok(GitPushResult {
                success: true,
                message: format!("Successfully pushed to {}/{}", remote_name, current_branch_name),
                pushed_commits: remote_status.ahead,
            })
        }
        Err(e) => Ok(GitPushResult {
            success: false,
            message: e.to_string(),
            pushed_commits: 0,
        })
    }
}

#[command]
pub fn discard_all_changes(repo_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
    
    // Get the current HEAD commit
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let head_tree = head_commit.tree().map_err(|e| e.to_string())?;
    
    // Create checkout builder with force option to overwrite working directory
    let mut checkout_builder = git2::build::CheckoutBuilder::new();
    checkout_builder.force(); // Force checkout to overwrite modified files
    checkout_builder.remove_untracked(true); // Remove untracked files
    
    // Checkout HEAD tree to working directory (discard all changes)
    repo.checkout_tree(head_tree.as_object(), Some(&mut checkout_builder))
        .map_err(|e| e.to_string())?;
    
    // Reset the index to match HEAD (unstage any staged changes)
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.read_tree(&head_tree).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    
    // Count how many files were affected
    let statuses_before = repo.statuses(Some(&mut git2::StatusOptions::new()))
        .map_err(|e| e.to_string())?;
    
    let files_count = statuses_before.len();
    
    Ok(format!("Discarded changes in {} files", files_count))
} 