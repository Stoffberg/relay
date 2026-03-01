mod module_bindings;
mod tools;

use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand};
use module_bindings::tool_command_table::ToolCommandTableAccess;
use module_bindings::{
    agent_disconnect, agent_heartbeat, create_tool_result, register_agent,
    update_tool_command_status, DbConnection, ToolCommand,
};
use spacetimedb_sdk::{DbContext, Table, TableWithPrimaryKey};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::info;

const HEARTBEAT_INTERVAL_SECS: u64 = 30;

#[derive(Parser)]
#[command(name = "relay", about = "Relay local agent", version, disable_version_flag = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    #[arg(short = 'v', short_alias = 'V', long = "version", action = clap::ArgAction::Version, global = true)]
    version: (),
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Configure the agent (SpacetimeDB URL, database, agent name)")]
    Setup {
        #[arg(long, help = "Owner token from Settings page (skips interactive prompts)")]
        token: Option<String>,
    },
    #[command(about = "Show current configuration")]
    Config,
    #[command(about = "Start the agent as a background process")]
    Start,
    #[command(about = "Stop the background agent")]
    Stop,
    #[command(about = "Show agent status")]
    Status,
    #[command(about = "Show agent logs")]
    Logs {
        #[arg(short, long, help = "Follow log output")]
        follow: bool,
        #[arg(short, long, default_value = "50", help = "Number of lines to show")]
        lines: usize,
    },
    #[command(about = "Run the agent in the foreground")]
    Run,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AgentConfig {
    spacetime_url: String,
    spacetime_db: String,
    agent_name: String,
    owner_token: String,
    #[serde(default)]
    agent_id: Option<String>,
    #[serde(default)]
    auth_token: Option<String>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            spacetime_url: "wss://maincloud.spacetimedb.com".to_string(),
            spacetime_db: "relay".to_string(),
            agent_name: hostname(),
            owner_token: String::new(),
            agent_id: None,
            auth_token: None,
        }
    }
}

fn config_path() -> PathBuf {
    state_dir().join("config.toml")
}

fn state_dir() -> PathBuf {
    let dir = home::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("relay");
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn pid_path() -> PathBuf {
    state_dir().join("agent.pid")
}

fn log_path() -> PathBuf {
    state_dir().join("agent.log")
}

fn status_path() -> PathBuf {
    state_dir().join("status.json")
}

fn write_status_file(agent_id: &str, connected: bool, commands_processed: &std::sync::atomic::AtomicU64) {
    let epoch_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let status = serde_json::json!({
        "agent_id": agent_id,
        "connected": connected,
        "commands_processed": commands_processed.load(std::sync::atomic::Ordering::Relaxed),
        "updated_at_epoch": epoch_secs,
    });
    let path = status_path();
    let tmp = path.with_extension("json.tmp");
    if let Ok(content) = serde_json::to_string_pretty(&status) {
        let _ = std::fs::write(&tmp, content);
        let _ = std::fs::rename(&tmp, &path);
    }
}

fn load_config() -> Option<AgentConfig> {
    let path = config_path();
    let content = std::fs::read_to_string(&path).ok()?;
    match toml::from_str(&content) {
        Ok(config) => Some(config),
        Err(e) => {
            eprintln!("  Warning: config file at {} is malformed: {e}", path.display());
            None
        }
    }
}

fn save_config(config: &AgentConfig) -> Result<()> {
    let path = config_path();
    let content = toml::to_string_pretty(config)?;
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, &content)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

fn read_pid() -> Option<u32> {
    let content = std::fs::read_to_string(pid_path()).ok()?;
    content.trim().parse().ok()
}

#[cfg(unix)]
fn is_process_running(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
fn is_process_running(pid: u32) -> bool {
    std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .ok()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

#[cfg(unix)]
fn is_relay_process(pid: u32) -> bool {
    std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .ok()
        .map(|o| {
            let name = String::from_utf8_lossy(&o.stdout);
            name.trim().ends_with("relay-agent") || name.trim().ends_with("relay")
        })
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_relay_process(pid: u32) -> bool {
    std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .ok()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains("relay")
        })
        .unwrap_or(false)
}

fn run_setup(token: Option<String>) -> Result<()> {
    let existing = load_config().unwrap_or_default();

    if let Some(token) = token {
        if token.is_empty() {
            anyhow::bail!("Owner token cannot be empty");
        }
        let config = AgentConfig {
            owner_token: token,
            ..existing
        };
        save_config(&config)?;
        println!("\n  Config saved to {}", config_path().display());
        println!("  Run `relay start` to start the agent.\n");
        return Ok(());
    }

    println!("\n  Relay Agent Setup\n");

    let spacetime_url: String = dialoguer::Input::new()
        .with_prompt("  SpacetimeDB URL")
        .default(existing.spacetime_url)
        .validate_with(|input: &String| -> std::result::Result<(), String> {
            if input.starts_with("ws://") || input.starts_with("wss://") || input.starts_with("http://") || input.starts_with("https://") {
                Ok(())
            } else {
                Err("URL must start with ws://, wss://, http://, or https://".to_string())
            }
        })
        .interact_text()?;

    let spacetime_db: String = dialoguer::Input::new()
        .with_prompt("  Database name")
        .default(existing.spacetime_db)
        .validate_with(|input: &String| -> std::result::Result<(), String> {
            if input.is_empty() {
                Err("Database name cannot be empty".to_string())
            } else if input.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
                Ok(())
            } else {
                Err("Database name must be alphanumeric with hyphens or underscores only".to_string())
            }
        })
        .interact_text()?;

    let agent_name: String = dialoguer::Input::new()
        .with_prompt("  Agent name")
        .default(existing.agent_name)
        .validate_with(|input: &String| -> std::result::Result<(), String> {
            if input.is_empty() {
                Err("Agent name cannot be empty".to_string())
            } else if input.len() > 100 {
                Err("Agent name must be under 100 characters".to_string())
            } else {
                Ok(())
            }
        })
        .interact_text()?;

    let owner_token: String = dialoguer::Input::new()
        .with_prompt("  Owner token (from Settings)")
        .default(existing.owner_token)
        .validate_with(|input: &String| -> std::result::Result<(), String> {
            if input.is_empty() {
                Err("Owner token cannot be empty".to_string())
            } else if input.len() > 256 {
                Err("Owner token must be under 256 characters".to_string())
            } else {
                Ok(())
            }
        })
        .interact_text()?;

    let config = AgentConfig {
        spacetime_url,
        spacetime_db,
        agent_name,
        owner_token,
        agent_id: None,
        auth_token: None,
    };

    save_config(&config)?;
    println!("\n  Config saved to {}", config_path().display());
    println!("  Run `relay start` to start the agent.\n");
    Ok(())
}

fn show_config() {
    match load_config() {
        Some(config) => {
            println!("\n  Relay Agent Config ({})\n", config_path().display());
            println!("  SpacetimeDB URL:  {}", config.spacetime_url);
            println!("  Database:         {}", config.spacetime_db);
            println!("  Agent name:       {}\n", config.agent_name);
        }
        None => {
            println!("\n  No config found. Run `relay setup` first.\n");
        }
    }
}

fn cmd_start() -> Result<()> {
    if let Some(pid) = read_pid() {
        if is_process_running(pid) && is_relay_process(pid) {
            println!("\n  Agent already running (PID {})\n", pid);
            return Ok(());
        }
        std::fs::remove_file(pid_path()).ok();
    }

    let config = match load_config() {
        Some(c) => c,
        None => {
            eprintln!("  No config found. Run `relay setup` first.");
            return Ok(());
        }
    };

    let exe = std::env::current_exe()?;
    let log = log_path();
    if let Ok(meta) = std::fs::metadata(&log) {
        if meta.len() > 10_000_000 {
            let old = log.with_extension("log.old");
            std::fs::rename(&log, &old).ok();
        }
    }
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log)?;
    let log_err = log_file.try_clone()?;

    let mut cmd = std::process::Command::new(exe);
    cmd.arg("run")
        .stdout(log_file)
        .stderr(log_err)
        .stdin(std::process::Stdio::null());
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00000008 | 0x00000200);
    }
    let child = cmd.spawn()?;

    let pid = child.id();
    std::fs::write(pid_path(), pid.to_string())?;

    println!("\n  Agent started (PID {})", pid);
    println!("  Database:  {}", config.spacetime_db);
    println!("  Name:      {}", config.agent_name);
    println!("  Logs:      {}", log_path().display());
    println!("  Stop with: relay stop\n");
    Ok(())
}

fn cmd_stop() -> Result<()> {
    match read_pid() {
        Some(pid) if is_process_running(pid) && is_relay_process(pid) => {
            kill_process(pid);

            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if !is_process_running(pid) {
                    break;
                }
            }

            if is_process_running(pid) {
                force_kill_process(pid);
            }

            std::fs::remove_file(pid_path()).ok();
            println!("\n  Agent stopped (was PID {})\n", pid);
        }
        Some(_) => {
            std::fs::remove_file(pid_path()).ok();
            println!("\n  Agent not running (stale PID file cleaned up)\n");
        }
        None => {
            println!("\n  Agent not running\n");
        }
    }
    Ok(())
}

#[cfg(unix)]
fn kill_process(pid: u32) {
    unsafe { libc::kill(pid as i32, libc::SIGTERM) };
}

#[cfg(unix)]
fn force_kill_process(pid: u32) {
    unsafe { libc::kill(pid as i32, libc::SIGKILL) };
}

#[cfg(windows)]
fn kill_process(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string()])
        .output();
}

#[cfg(windows)]
fn force_kill_process(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .output();
}

fn cmd_status() -> Result<()> {
    match read_pid() {
        Some(pid) if is_process_running(pid) && is_relay_process(pid) => {
            let config = load_config().unwrap_or_default();
            println!("\n  Agent running (PID {})\n", pid);
            println!("  SpacetimeDB URL:  {}", config.spacetime_url);
            println!("  Database:         {}", config.spacetime_db);
            println!("  Agent name:       {}", config.agent_name);
            if let Some(id) = &config.agent_id {
                println!("  Agent ID:         {}", id);
            }

            if let Ok(content) = std::fs::read_to_string(status_path()) {
                if let Ok(status) = serde_json::from_str::<serde_json::Value>(&content) {
                    let connected = status["connected"].as_bool().unwrap_or(false);
                    let cmds = status["commands_processed"].as_u64().unwrap_or(0);
                    println!("  SpacetimeDB:      {}", if connected { "connected" } else { "disconnected" });
                    println!("  Commands run:     {}", cmds);
                }
            }

            println!("  Logs:             {}\n", log_path().display());
        }
        Some(_) => {
            std::fs::remove_file(pid_path()).ok();
            println!("\n  Agent not running (stale PID file cleaned up)\n");
        }
        None => {
            println!("\n  Agent not running\n");
        }
    }
    Ok(())
}

fn cmd_logs(follow: bool, lines: usize) -> Result<()> {
    let path = log_path();
    if !path.exists() {
        println!("\n  No logs found at {}\n", path.display());
        return Ok(());
    }

    if follow {
        let content = std::fs::read_to_string(&path)?;
        let all_lines: Vec<&str> = content.lines().collect();
        let start = all_lines.len().saturating_sub(lines);
        for line in &all_lines[start..] {
            println!("{}", line);
        }

        let mut last_len = std::fs::metadata(&path)?.len();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let current_len = match std::fs::metadata(&path) {
                Ok(m) => m.len(),
                Err(_) => break,
            };
            if current_len > last_len {
                let file = std::fs::File::open(&path)?;
                use std::io::{Read, Seek, SeekFrom};
                let mut reader = std::io::BufReader::new(file);
                reader.seek(SeekFrom::Start(last_len))?;
                let mut new_content = String::new();
                reader.read_to_string(&mut new_content)?;
                print!("{new_content}");
                last_len = current_len;
            }
        }
    } else {
        let content = std::fs::read_to_string(&path)?;
        let all_lines: Vec<&str> = content.lines().collect();
        let start = all_lines.len().saturating_sub(lines);
        for line in &all_lines[start..] {
            println!("{}", line);
        }
    }
    Ok(())
}

struct AgentState {
    agent_id: String,
    conn: DbConnection,
    _subscription_handle: module_bindings::SubscriptionHandle,
    _ws_thread: std::thread::JoinHandle<()>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Setup { token }) => return run_setup(token),
        Some(Commands::Config) => {
            show_config();
            return Ok(());
        }
        Some(Commands::Start) => return cmd_start(),
        Some(Commands::Stop) => return cmd_stop(),
        Some(Commands::Status) => return cmd_status(),
        Some(Commands::Logs { follow, lines }) => return cmd_logs(follow, lines),
        Some(Commands::Run) => {}
        None => {
            Cli::command().print_help()?;
            return Ok(());
        }
    }

    let mut config = match load_config() {
        Some(c) => c,
        None => {
            eprintln!("No config found. Run `relay setup` first.\n");
            return Ok(());
        }
    };

    if let Ok(url) = std::env::var("RELAY_SPACETIME_URL") {
        config.spacetime_url = url;
    }
    if let Ok(db) = std::env::var("RELAY_SPACETIME_DB") {
        config.spacetime_db = db;
    }
    if let Ok(name) = std::env::var("RELAY_AGENT_NAME") {
        config.agent_name = name;
    }

    let log_filter = tracing_subscriber::EnvFilter::try_from_env("RELAY_LOG")
        .or_else(|_| tracing_subscriber::EnvFilter::try_from_default_env())
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(log_filter)
        .with_target(false)
        .with_thread_ids(false)
        .with_ansi(std::io::IsTerminal::is_terminal(&std::io::stdout()))
        .init();

    let agent_id = match config.agent_id.clone() {
        Some(id) => id,
        None => {
            let id = format!("agent-{}", &uuid::Uuid::new_v4().to_string()[..8]);
            config.agent_id = Some(id.clone());
            if let Err(e) = save_config(&config) {
                tracing::warn!("Failed to persist agent ID: {e}");
            }
            id
        }
    };

    info!("Relay Agent starting");
    info!("Agent ID: {agent_id}");
    info!("Agent name: {}", config.agent_name);
    info!(
        "SpacetimeDB: {}/{}",
        config.spacetime_url, config.spacetime_db
    );

    let mut retry_count = 0u32;
    let max_retries = 10u32;
    let shutdown_requested = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let commands_processed = Arc::new(std::sync::atomic::AtomicU64::new(0));

    loop {
        if shutdown_requested.load(std::sync::atomic::Ordering::SeqCst) {
            break;
        }

        if retry_count > 0 {
            let delay = std::cmp::min(1000 * 2u64.pow(retry_count - 1), 30000);
            info!("Reconnecting in {}ms (attempt {}/{})", delay, retry_count, max_retries);
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        if retry_count >= max_retries {
            tracing::error!("Max reconnection attempts reached, exiting");
            return Err(anyhow::anyhow!("Failed to maintain SpacetimeDB connection after {max_retries} attempts"));
        }

        let (ready_tx, ready_rx) = oneshot::channel::<()>();
        let ready_tx = std::sync::Mutex::new(Some(ready_tx));

        let (cmd_tx, cmd_rx) = mpsc::channel::<ToolCommand>(100);

        let disconnected = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let disconnected_clone = disconnected.clone();

        let config_clone = config.clone();
        let mut builder = DbConnection::builder()
            .with_uri(&config.spacetime_url)
            .with_database_name(&config.spacetime_db)
            .on_connect(move |_conn, identity, token| {
                info!("Connected to SpacetimeDB as {identity}");
                let mut cfg = config_clone.clone();
                let token_str = token.to_string();
                if cfg.auth_token.as_deref() != Some(&token_str) {
                    cfg.auth_token = Some(token_str);
                    if let Err(e) = save_config(&cfg) {
                        tracing::warn!("Failed to persist auth token: {e}");
                    }
                }
            })
            .on_disconnect(move |_ctx, err| {
                tracing::error!("Disconnected: {err:?}");
                disconnected_clone.store(true, std::sync::atomic::Ordering::SeqCst);
            });
        if let Some(ref token) = config.auth_token {
            builder = builder.with_token(Some(token));
        }
        let conn = match builder.build() {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Connection failed: {e}");
                retry_count += 1;
                continue;
            }
        };

        let cmd_tx_clone = cmd_tx.clone();
        let agent_id_clone = agent_id.clone();
        conn.db.tool_command().on_insert(move |_ctx, cmd| {
            if cmd.status == "pending" && cmd.agent_id == agent_id_clone {
                if let Err(e) = cmd_tx_clone.try_send(cmd.clone()) {
                    tracing::warn!("Command channel full, dropping command {}: {e}", cmd.id);
                }
            }
        });

        let cmd_tx_clone2 = cmd_tx.clone();
        let agent_id_clone2 = agent_id.clone();
        conn.db.tool_command().on_update(move |_ctx, _old, new| {
            if new.status == "pending" && new.agent_id == agent_id_clone2 {
                if let Err(e) = cmd_tx_clone2.try_send(new.clone()) {
                    tracing::warn!("Command channel full, dropping command {}: {e}", new.id);
                }
            }
        });

        let sub_handle = conn.subscription_builder()
            .on_applied(move |ctx| {
                let cmd_count = ctx.db.tool_command().count();
                info!("Subscription applied: {cmd_count} tool commands in cache");
                if let Some(tx) = ready_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            })
            .on_error(|_ctx, err| {
                tracing::error!("Subscription error: {err}");
            })
            .subscribe([
                "SELECT * FROM tool_command",
                "SELECT * FROM tool_result",
                "SELECT * FROM agent",
            ]);

        let ws_thread = conn.run_threaded();

        info!("Waiting for subscription...");
        match tokio::time::timeout(std::time::Duration::from_secs(30), ready_rx).await {
            Ok(Ok(())) => {}
            _ => {
                tracing::error!("Subscription timed out or failed");
                retry_count += 1;
                continue;
            }
        }
        info!("Subscription ready");

        let workdir = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let workspace_tree = compute_workspace_tree(&workdir);
        if let Err(e) = conn
            .reducers
            .register_agent(agent_id.clone(), config.agent_name.clone(), config.owner_token.clone(), workdir, workspace_tree)
        {
            tracing::error!("Failed to register agent: {e}");
            retry_count += 1;
            continue;
        }
        info!("Registered as {agent_id} ({})", config.agent_name);

        retry_count = 0;

        let stale: Vec<_> = conn
            .db
            .tool_command()
            .iter()
            .filter(|c| c.status == "executing" && c.agent_id == agent_id)
            .collect();
        if !stale.is_empty() {
            info!("Cleaning up {} stale executing commands from previous run", stale.len());
            for cmd in &stale {
                if let Err(e) = conn.reducers.create_tool_result(
                    cmd.id,
                    false,
                    String::new(),
                    Some("Agent restarted while tool was executing".to_string()),
                ) {
                    tracing::warn!("Failed to create error result for stale cmd {}: {e}", cmd.id);
                }
                if let Err(e) = conn.reducers.update_tool_command_status(cmd.id, "error".to_string()) {
                    tracing::warn!("Failed to error stale cmd {}: {e}", cmd.id);
                }
            }
        }

        let pending: Vec<_> = conn
            .db
            .tool_command()
            .iter()
            .filter(|c| c.status == "pending" && c.agent_id == agent_id)
            .collect();
        if !pending.is_empty() {
            info!("Picking up {} pending commands", pending.len());
        }
        for cmd in pending {
            let _ = cmd_tx.try_send(cmd.clone());
        }

        let state = Arc::new(AgentState {
            agent_id: agent_id.clone(),
            conn,
            _subscription_handle: sub_handle,
            _ws_thread: ws_thread,
        });

        write_status_file(&agent_id, true, &commands_processed);

        let shutdown_token = CancellationToken::new();

        let heartbeat_state = state.clone();
        let heartbeat_token = shutdown_token.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_secs(HEARTBEAT_INTERVAL_SECS)) => {},
                    _ = heartbeat_token.cancelled() => {
                        info!("Heartbeat stopped");
                        return;
                    }
                }
                if let Err(e) = heartbeat_state
                    .conn
                    .reducers
                    .agent_heartbeat(heartbeat_state.agent_id.clone())
                {
                    tracing::warn!("Heartbeat failed: {e}");
                }
            }
        });

        info!("Listening for tool commands...");
        let inflight = run_command_loop(state.clone(), cmd_rx, disconnected.clone(), commands_processed.clone(), shutdown_requested.clone()).await;

        shutdown_token.cancel();

        let got_ctrl_c = shutdown_requested.load(std::sync::atomic::Ordering::SeqCst);

        if !inflight.is_empty() {
            info!("Waiting up to 5s for {} inflight commands...", inflight.len());
            let drain_result = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                async {
                    for handle in inflight {
                        let _ = handle.await;
                    }
                },
            ).await;
            if drain_result.is_err() {
                tracing::warn!("Some inflight commands did not finish in time");
            }
        }

        let _ = state
            .conn
            .reducers
            .agent_disconnect(state.agent_id.clone());

        write_status_file(&agent_id, false, &commands_processed);

        if got_ctrl_c {
            info!("Agent disconnected");
            break;
        }

        info!("Connection lost, will attempt reconnection...");
        retry_count += 1;
    }

    Ok(())
}

async fn run_command_loop(
    state: Arc<AgentState>,
    mut rx: mpsc::Receiver<ToolCommand>,
    disconnected: Arc<std::sync::atomic::AtomicBool>,
    commands_processed: Arc<std::sync::atomic::AtomicU64>,
    shutdown_requested: Arc<std::sync::atomic::AtomicBool>,
) -> Vec<tokio::task::JoinHandle<()>> {
    let processing = Arc::new(Mutex::new(std::collections::HashSet::<u64>::new()));
    let mut handles: Vec<tokio::task::JoinHandle<()>> = Vec::new();
    let mut session_senders: std::collections::HashMap<String, mpsc::Sender<ToolCommand>> =
        std::collections::HashMap::new();
    #[cfg(unix)]
    let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("failed to install SIGTERM handler");

    loop {
        if disconnected.load(std::sync::atomic::Ordering::SeqCst) {
            break;
        }

        let cmd = tokio::select! {
            maybe_cmd = rx.recv() => {
                match maybe_cmd {
                    Some(c) => c,
                    None => break,
                }
            },
            _ = tokio::signal::ctrl_c() => {
                info!("Received shutdown signal, disconnecting...");
                shutdown_requested.store(true, std::sync::atomic::Ordering::SeqCst);
                break;
            },
            _ = async {
                #[cfg(unix)]
                sigterm.recv().await;
                #[cfg(windows)]
                std::future::pending::<()>().await;
            } => {
                info!("Received SIGTERM, disconnecting...");
                shutdown_requested.store(true, std::sync::atomic::Ordering::SeqCst);
                break;
            },
        };

        let mut lock = processing.lock().await;
        if !lock.insert(cmd.id) {
            continue;
        }
        drop(lock);

        let session_id = cmd.session_id.clone();

        session_senders.retain(|_, tx| !tx.is_closed());
        handles.retain(|h| !h.is_finished());

        let tx = session_senders.entry(session_id).or_insert_with_key(|sid| {
            let (tx, mut session_rx) = mpsc::channel::<ToolCommand>(64);
            let state = state.clone();
            let processing = processing.clone();
            let counter = commands_processed.clone();
            let sid = sid.clone();

            handles.push(tokio::spawn(async move {
                while let Some(cmd) = session_rx.recv().await {
                    info!("Executing: {} (id={}, session={})", cmd.tool_name, cmd.id, sid);

                    if let Err(e) = state
                        .conn
                        .reducers
                        .update_tool_command_status(cmd.id, "executing".to_string())
                    {
                        tracing::warn!("Failed to set executing status for cmd {}: {e}", cmd.id);
                    }

                    let result = match tokio::time::timeout(
                        std::time::Duration::from_secs(110),
                        execute_tool(&cmd.tool_name, &cmd.tool_args),
                    )
                    .await
                    {
                        Ok(r) => r,
                        Err(_) => Err(anyhow::anyhow!("Tool execution timed out after 110 seconds")),
                    };

                    processing.lock().await.remove(&cmd.id);
                    counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

                    match &result {
                        Ok(output) => {
                            info!("Tool {} completed ({} bytes)", cmd.tool_name, output.len());
                            let truncated = truncate_output(output);
                            retry_reducer(|| {
                                state.conn.reducers.create_tool_result(
                                    cmd.id,
                                    true,
                                    truncated.clone(),
                                    None,
                                )
                            }, "create_tool_result", cmd.id).await;
                            retry_reducer(|| {
                                state.conn.reducers.update_tool_command_status(
                                    cmd.id,
                                    "completed".to_string(),
                                )
                            }, "update_tool_command_status", cmd.id).await;
                        }
                        Err(e) => {
                            tracing::error!("Tool {} failed: {e}", cmd.tool_name);
                            retry_reducer(|| {
                                state.conn.reducers.create_tool_result(
                                    cmd.id,
                                    false,
                                    String::new(),
                                    Some(format!("{e}")),
                                )
                            }, "create_tool_result", cmd.id).await;
                            retry_reducer(|| {
                                state.conn.reducers.update_tool_command_status(
                                    cmd.id,
                                    "error".to_string(),
                                )
                            }, "update_tool_command_status", cmd.id).await;
                        }
                    }
                }
            }));

            tx
        });

        if let Err(e) = tx.send(cmd).await {
            tracing::warn!("Failed to send command to session worker: {e}");
        }
    }

    drop(session_senders);

    handles.retain(|h| !h.is_finished());
    handles
}

const MAX_TOOL_OUTPUT: usize = 45_000;

fn truncate_output(output: &str) -> String {
    if output.len() <= MAX_TOOL_OUTPUT {
        return output.to_string();
    }
    let boundary = output.char_indices()
        .take_while(|(i, _)| *i <= MAX_TOOL_OUTPUT)
        .last()
        .map(|(i, c)| i + c.len_utf8())
        .unwrap_or(0);
    let safe = &output[..boundary];
    let end = safe.rfind('\n').unwrap_or(boundary);
    format!("{}...\n(truncated from {} to {} chars)", &output[..end], output.chars().count(), end)
}

async fn retry_reducer<F, E>(mut f: F, name: &str, cmd_id: u64)
where
    F: FnMut() -> std::result::Result<(), E>,
    E: std::fmt::Display,
{
    for attempt in 0..3u64 {
        match f() {
            Ok(()) => return,
            Err(e) => {
                tracing::warn!(
                    "Reducer {name} failed for cmd {cmd_id} (attempt {}): {e}",
                    attempt + 1
                );
                tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1))).await;
            }
        }
    }
    tracing::error!("Reducer {name} failed permanently for cmd {cmd_id} after 3 attempts");
}

async fn execute_tool(tool_name: &str, tool_args_json: &str) -> Result<String> {
    let args: serde_json::Value = serde_json::from_str(tool_args_json)?;

    match tool_name {
        "file_read" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing path"))?;
            let offset = args["offset"].as_u64().map(|v| v as usize);
            let limit = args["limit"].as_u64().map(|v| v as usize);
            tools::file_read::execute(path, offset, limit).await
        }
        "file_write" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing path"))?;
            let content = args["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing content"))?;
            let overwrite = args["overwrite"].as_bool().unwrap_or(false);
            tools::file_write::execute(path, content.to_string(), overwrite).await
        }
        "file_edit" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing path"))?;
            let old = args["old"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing old"))?;
            let new = args["new"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing new"))?;
            let replace_all = args["replace_all"].as_bool().unwrap_or(false);
            tools::file_edit::execute(path, old.to_string(), new.to_string(), replace_all).await
        }
        "shell_exec" => {
            let command = args["command"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing command"))?;
            let workdir = args["workdir"].as_str();
            tools::shell_exec::execute(command, workdir).await
        }
        "glob" => {
            let pattern = args["pattern"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing pattern"))?;
            let path = args["path"].as_str();
            tools::glob::execute(pattern, path, None).await
        }
        "grep" => {
            let pattern = args["pattern"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing pattern"))?;
            let home = home::home_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."));
            let home_str = home.to_string_lossy().to_string();
            let path = args["path"].as_str().unwrap_or(&home_str);
            let include = args["include"].as_str();
            tools::grep::execute(pattern, path, include).await
        }
        "web_fetch" => {
            let url = args["url"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing url"))?;
            tools::web_fetch::execute(url).await
        }
        _ => Err(anyhow::anyhow!("Unknown tool: {tool_name}")),
    }
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| {
            std::process::Command::new("hostname")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        })
}

fn compute_workspace_tree(workdir: &str) -> String {
    use walkdir::WalkDir;

    const SKIP_DIRS: &[&str] = &[
        ".git", "node_modules", "target", ".next", ".turbo", "dist", "module_bindings",
    ];
    const SKIP_FILES: &[&str] = &[".DS_Store"];
    const SKIP_EXTS: &[&str] = &["lock", "d"];

    let mut lines: Vec<String> = Vec::new();
    let walker = WalkDir::new(workdir)
        .max_depth(3)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            if entry.file_type().is_dir() && entry.depth() > 0 {
                return !SKIP_DIRS.contains(&name.as_ref());
            }
            true
        });

    for entry in walker.flatten() {
        let name = entry.file_name().to_string_lossy();
        if SKIP_FILES.contains(&name.as_ref()) {
            continue;
        }
        if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
            if SKIP_EXTS.contains(&ext) {
                continue;
            }
        }
        if let Ok(rel) = entry.path().strip_prefix(workdir) {
            let path_str = rel.to_string_lossy();
            if !path_str.is_empty() {
                lines.push(format!("./{}", path_str.replace('\\', "/")));
            }
        }
    }

    lines.sort();
    let result = lines.join("\n");
    if result.len() > 9000 {
        result.chars().take(9000).collect()
    } else {
        result
    }
}
