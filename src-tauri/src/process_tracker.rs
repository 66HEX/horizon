use std::sync::{Arc, Mutex};
use sysinfo::{Process, System};
use std::collections::HashMap;
use std::time::Duration;
use std::thread;
use sysinfo::Pid;

pub struct ProcessTracker {
    system: Arc<Mutex<System>>,
    tracked_processes: Arc<Mutex<HashMap<String, Pid>>>,
    process_names: Arc<Mutex<HashMap<String, String>>>,
}

impl ProcessTracker {
    pub fn new() -> Self {
        let tracker = ProcessTracker {
            system: Arc::new(Mutex::new(System::new_all())),
            tracked_processes: Arc::new(Mutex::new(HashMap::new())),
            process_names: Arc::new(Mutex::new(HashMap::new())),
        };

        let system_clone = tracker.system.clone();
        let tracked_processes_clone = tracker.tracked_processes.clone();
        let process_names_clone = tracker.process_names.clone();

        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(1000));
                let mut system = system_clone.lock().unwrap();
                system.refresh_processes();

                let tracked_processes = tracked_processes_clone.lock().unwrap();
                let mut process_names = process_names_clone.lock().unwrap();

                for (terminal_id, pid) in tracked_processes.iter() {
                    if let Some(process) = system.process(*pid) {
                        let name = process.name().to_string();
                        
                        if name == "bash" || name == "zsh" || name == "sh" {
                            if let Some(child_process) = find_child_process(&system, *pid) {
                                process_names.insert(terminal_id.clone(), child_process.name().to_string());
                            } else {
                                process_names.insert(terminal_id.clone(), name);
                            }
                        } else {
                            process_names.insert(terminal_id.clone(), name);
                        }
                    } else {
                        process_names.insert(terminal_id.clone(), "bash".to_string());
                    }
                }
            }
        });

        tracker
    }

    pub fn track_process(&self, terminal_id: String, pid: Pid) {
        let mut tracked_processes = self.tracked_processes.lock().unwrap();
        tracked_processes.insert(terminal_id, pid);
    }

    pub fn untrack_process(&self, terminal_id: &str) {
        let mut tracked_processes = self.tracked_processes.lock().unwrap();
        tracked_processes.remove(terminal_id);
    }

    pub fn get_process_name(&self, terminal_id: &str) -> Option<String> {
        let process_names = self.process_names.lock().unwrap();
        process_names.get(terminal_id).cloned()
    }
}

pub fn find_child_process(system: &System, parent_pid: Pid) -> Option<&Process> {
    system.processes()
        .values()
        .find(|process| {
            process.parent() == Some(parent_pid) &&
            !["bash", "zsh", "sh"].contains(&process.name())
        })
}

impl Default for ProcessTracker {
    fn default() -> Self {
        Self::new()
    }
} 