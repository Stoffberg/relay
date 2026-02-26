mod module_bindings;
mod tools;

use anyhow::Result;
use clap::{Parser, Subcommand};
use module_bindings::tool_command_table::ToolCommandTableAccess;
use module_bindings::{
    agent_disconnect, agent_heartbeat, create_tool_result, register_agent,
    update_tool_command_status, DbConnection, ToolCommand,
};
use spacetimedb_sdk::{DbContext, Table, TableWithPrimaryKey};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::info;

const HEARTBEAT_INTERVAL_SECS: u64 = 30;

#[derive(Parser)]
#[command(name = "relay", about = "Relay local agent", version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Configure the agent (SpacetimeDB URL, database, agent name)")]
    Setup,
    #[command(about = "Show current configuration")]
    Config,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AgentConfig {
    spacetime_url: String,
    spacetime_db: String,
    agent_name: String,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            spacetime_url: "wss://maincloud.spacetimedb.com".to_string(),
            spacetime_db: "relay".to_string(),
            agent_name: hostname(),
        }
    }
}

fn config_path() -> PathBuf {
    config_dir().join("config.toml")
}

fn config_dir() -> PathBuf {
    let dir = home::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("relay");
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn load_config() -> Option<AgentConfig> {
    let path = config_path();
    let content = std::fs::read_to_string(&path).ok()?;
    toml::from_str(&content).ok()
}

fn save_config(config: &AgentConfig) -> Result<()> {
    let path = config_path();
    let content = toml::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}

fn run_setup() -> Result<()> {
    let existing = load_config().unwrap_or_default();

    println!("\n  Relay Agent Setup\n");

    let spacetime_url: String = dialoguer::Input::new()
        .with_prompt("  SpacetimeDB URL")
        .default(existing.spacetime_url)
        .interact_text()?;

    let spacetime_db: String = dialoguer::Input::new()
        .with_prompt("  Database name")
        .default(existing.spacetime_db)
        .interact_text()?;

    let agent_name: String = dialoguer::Input::new()
        .with_prompt("  Agent name")
        .default(existing.agent_name)
        .interact_text()?;

    let config = AgentConfig {
        spacetime_url,
        spacetime_db,
        agent_name,
    };

    save_config(&config)?;
    println!("\n  Config saved to {}", config_path().display());
    println!("  Run `relay` to start the agent.\n");
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

struct AgentState {
    agent_id: String,
    conn: DbConnection,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Setup) => return run_setup(),
        Some(Commands::Config) => {
            show_config();
            return Ok(());
        }
        None => {}
    }

    let config = match load_config() {
        Some(c) => c,
        None => {
            eprintln!("No config found. Running setup first...\n");
            run_setup()?;
            load_config().ok_or_else(|| anyhow::anyhow!("Setup failed"))?
        }
    };

    tracing_subscriber::fmt()
        .with_target(false)
        .with_thread_ids(false)
        .init();

    let agent_id = format!("agent-{}", &uuid::Uuid::new_v4().to_string()[..8]);

    info!("Relay Agent starting");
    info!("Agent ID: {agent_id}");
    info!("Agent name: {}", config.agent_name);
    info!(
        "SpacetimeDB: {}/{}",
        config.spacetime_url, config.spacetime_db
    );

    let (ready_tx, ready_rx) = oneshot::channel::<()>();
    let ready_tx = std::sync::Mutex::new(Some(ready_tx));

    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<ToolCommand>();

    let conn = DbConnection::builder()
        .with_uri(&config.spacetime_url)
        .with_database_name(&config.spacetime_db)
        .on_connect(move |_conn, identity, _token| {
            info!("Connected to SpacetimeDB as {identity}");
        })
        .on_disconnect(|_ctx, err| {
            tracing::error!("Disconnected: {err:?}");
        })
        .build()
        .expect("Failed to connect to SpacetimeDB");

    let cmd_tx_clone = cmd_tx.clone();
    conn.db.tool_command().on_insert(move |_ctx, cmd| {
        if cmd.status == "pending" {
            let _ = cmd_tx_clone.send(cmd.clone());
        }
    });

    let cmd_tx_clone2 = cmd_tx.clone();
    conn.db.tool_command().on_update(move |_ctx, _old, new| {
        if new.status == "pending" {
            let _ = cmd_tx_clone2.send(new.clone());
        }
    });

    conn.subscription_builder()
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

    conn.run_threaded();

    info!("Waiting for subscription...");
    ready_rx.await?;
    info!("Subscription ready");

    if let Err(e) = conn
        .reducers
        .register_agent(agent_id.clone(), config.agent_name.clone())
    {
        tracing::error!("Failed to register agent: {e}");
        return Err(anyhow::anyhow!("Failed to register"));
    }
    info!("Registered as {agent_id} ({})", config.agent_name);

    let pending: Vec<_> = conn
        .db
        .tool_command()
        .iter()
        .filter(|c| c.status == "pending")
        .collect();
    for cmd in pending {
        let _ = cmd_tx.send(cmd.clone());
    }

    let state = Arc::new(AgentState {
        agent_id: agent_id.clone(),
        conn,
    });

    let heartbeat_state = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(HEARTBEAT_INTERVAL_SECS)).await;
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
    run_command_loop(state.clone(), cmd_rx).await;

    let _ = state
        .conn
        .reducers
        .agent_disconnect(state.agent_id.clone());

    Ok(())
}

async fn run_command_loop(state: Arc<AgentState>, mut rx: mpsc::UnboundedReceiver<ToolCommand>) {
    let processing = Arc::new(Mutex::new(std::collections::HashSet::<u64>::new()));

    while let Some(cmd) = rx.recv().await {
        let mut lock = processing.lock().await;
        if lock.contains(&cmd.id) {
            continue;
        }
        lock.insert(cmd.id);
        drop(lock);

        let state = state.clone();
        let processing = processing.clone();

        tokio::spawn(async move {
            info!("Executing: {} (id={})", cmd.tool_name, cmd.id);

            let _ = state
                .conn
                .reducers
                .update_tool_command_status(cmd.id, "executing".to_string());

            let result = execute_tool(&cmd.tool_name, &cmd.tool_args).await;

            match &result {
                Ok(output) => {
                    info!("Tool {} completed ({} bytes)", cmd.tool_name, output.len());
                    let _ = state.conn.reducers.create_tool_result(
                        cmd.id,
                        true,
                        output.clone(),
                        None,
                    );
                    let _ = state
                        .conn
                        .reducers
                        .update_tool_command_status(cmd.id, "completed".to_string());
                }
                Err(e) => {
                    tracing::error!("Tool {} failed: {e}", cmd.tool_name);
                    let _ = state.conn.reducers.create_tool_result(
                        cmd.id,
                        false,
                        String::new(),
                        Some(format!("{e}")),
                    );
                    let _ = state
                        .conn
                        .reducers
                        .update_tool_command_status(cmd.id, "error".to_string());
                }
            }

            processing.lock().await.remove(&cmd.id);
        });
    }
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
            tools::file_write::execute(path, content.to_string()).await
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
            tools::file_edit::execute(path, old.to_string(), new.to_string()).await
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
            tools::glob::execute(pattern, path).await
        }
        "grep" => {
            let pattern = args["pattern"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing pattern"))?;
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing path"))?;
            let include = args["include"].as_str();
            tools::grep::execute(pattern, path, include).await
        }
        "list_dir" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing path"))?;
            tools::list_dir::execute(path).await
        }
        _ => Err(anyhow::anyhow!("Unknown tool: {tool_name}")),
    }
}

fn hostname() -> String {
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}
