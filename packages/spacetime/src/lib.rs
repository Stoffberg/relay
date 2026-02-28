use spacetimedb::{reducer, table, Identity, ReducerContext, Table, Timestamp};

#[table(accessor = session, public)]
pub struct Session {
    #[primary_key]
    id: String,
    user_id: Identity,
    owner_token: String,
    title: String,
    status: String,
    model: Option<String>,
    system_prompt: Option<String>,
    is_archived: bool,
    created_at: Timestamp,
    updated_at: Timestamp,
}

#[table(accessor = message, public)]
pub struct Message {
    #[primary_key]
    id: String,
    #[index(btree)]
    session_id: String,
    user_id: Identity,
    role: String,
    status: String,
    error: Option<String>,
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    created_at: Timestamp,
}

#[table(accessor = message_part, public)]
pub struct MessagePart {
    #[primary_key]
    #[auto_inc]
    id: u64,
    #[index(btree)]
    message_id: String,
    part_index: u32,
    content: String,
    created_at: Timestamp,
}

#[table(accessor = tool_command, public)]
pub struct ToolCommand {
    #[primary_key]
    #[auto_inc]
    id: u64,
    tool_call_id: String,
    #[index(btree)]
    message_id: String,
    #[index(btree)]
    session_id: String,
    #[index(btree)]
    agent_id: String,
    tool_name: String,
    tool_args: String,
    status: String,
    created_at: Timestamp,
    updated_at: Timestamp,
}

#[table(accessor = tool_result, public)]
pub struct ToolResult {
    #[primary_key]
    #[auto_inc]
    id: u64,
    #[index(btree)]
    tool_command_id: u64,
    success: bool,
    output: String,
    error: Option<String>,
    created_at: Timestamp,
}

#[table(accessor = agent, public)]
pub struct Agent {
    #[primary_key]
    id: String,
    name: String,
    user_id: Identity,
    owner_token: String,
    workdir: String,
    status: String,
    last_heartbeat: Timestamp,
    created_at: Timestamp,
}

#[table(accessor = verification, public)]
pub struct Verification {
    #[primary_key]
    #[auto_inc]
    id: u64,
    #[index(btree)]
    session_id: String,
    #[index(btree)]
    message_id: String,
    passed: bool,
    reason: Option<String>,
    created_at: Timestamp,
}

const MAX_VERIFICATION_REASON_LEN: usize = 2_000;
const MAX_SESSION_TITLE: usize = 200;
const MAX_AGENT_NAME: usize = 100;
const MAX_ERROR_LEN: usize = 10_000;
const MAX_CONTENT_LEN: usize = 100_000;
const MAX_TOOL_ARGS_LEN: usize = 50_000;
const MAX_TOOL_OUTPUT_LEN: usize = 50_000;
const MAX_WORKDIR_LEN: usize = 500;
const MAX_OWNER_TOKEN_LEN: usize = 256;

fn check_len(value: &str, max: usize, field: &str) -> Result<(), String> {
    if value.len() > max {
        return Err(format!("{} exceeds maximum length of {}", field, max));
    }
    Ok(())
}

fn is_valid_session_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("idle", "streaming")
            | ("streaming", "idle")
            | ("streaming", "waiting_for_tool")
            | ("waiting_for_tool", "streaming")
            | (_, "error")
            | ("error", "idle")
    )
}

fn is_valid_message_completion(current_status: &str) -> bool {
    matches!(current_status, "queued" | "streaming")
}

fn is_valid_message_failure(current_status: &str) -> bool {
    matches!(current_status, "queued" | "streaming")
}

fn check_agent_owner(ctx: &ReducerContext, agent: &Agent) -> Result<(), String> {
    if agent.user_id != ctx.sender() {
        return Err("Unauthorized: not the agent owner".to_string());
    }
    Ok(())
}

#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("Relay SpacetimeDB module initialized");
}

#[reducer]
pub fn create_session(
    ctx: &ReducerContext,
    session_id: String,
    owner_token: String,
) -> Result<(), String> {
    if ctx.db.session().id().find(&session_id).is_some() {
        return Ok(());
    }
    ctx.db.session().insert(Session {
        id: session_id,
        user_id: ctx.sender(),
        owner_token,
        title: String::new(),
        status: "idle".to_string(),
        model: None,
        system_prompt: None,
        is_archived: false,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn update_session_status(
    ctx: &ReducerContext,
    session_id: String,
    status: String,
) -> Result<(), String> {
    if !["idle", "streaming", "waiting_for_tool", "error"].contains(&status.as_str()) {
        return Err("Invalid session status".to_string());
    }
    if let Some(mut session) = ctx.db.session().id().find(&session_id) {
        if !is_valid_session_transition(&session.status, &status) {
            return Err(format!(
                "Invalid session transition: {} -> {}",
                session.status, status
            ));
        }
        session.status = status;
        session.updated_at = ctx.timestamp;
        ctx.db.session().id().update(session);
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[reducer]
pub fn update_session_title(
    ctx: &ReducerContext,
    session_id: String,
    title: String,
) -> Result<(), String> {
    check_len(&title, MAX_SESSION_TITLE, "Title")?;
    if let Some(mut session) = ctx.db.session().id().find(&session_id) {
        session.title = title;
        session.updated_at = ctx.timestamp;
        ctx.db.session().id().update(session);
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[reducer]
pub fn send_message(
    ctx: &ReducerContext,
    message_id: String,
    session_id: String,
    role: String,
    status: String,
) -> Result<(), String> {
    if !["user", "assistant", "tool"].contains(&role.as_str()) {
        return Err("Invalid role".to_string());
    }
    if !["queued", "streaming", "complete", "error"].contains(&status.as_str()) {
        return Err("Invalid status".to_string());
    }
    if ctx.db.message().id().find(&message_id).is_some() {
        return Err(format!("Message {} already exists", message_id));
    }
    ctx.db
        .session()
        .id()
        .find(&session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    ctx.db.message().insert(Message {
        id: message_id,
        session_id,
        user_id: ctx.sender(),
        role,
        status,
        error: None,
        prompt_tokens: None,
        completion_tokens: None,
        created_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn complete_message(ctx: &ReducerContext, message_id: String) -> Result<(), String> {
    if let Some(mut msg) = ctx.db.message().id().find(&message_id) {
        if !is_valid_message_completion(&msg.status) {
            return Err(format!(
                "Cannot complete message with status: {}",
                msg.status
            ));
        }
        msg.status = "complete".to_string();
        ctx.db.message().id().update(msg);
        Ok(())
    } else {
        Err("Message not found".to_string())
    }
}

#[reducer]
pub fn fail_message(ctx: &ReducerContext, message_id: String, error: String) -> Result<(), String> {
    check_len(&error, MAX_ERROR_LEN, "Error")?;
    if let Some(mut msg) = ctx.db.message().id().find(&message_id) {
        if !is_valid_message_failure(&msg.status) {
            return Err(format!("Cannot fail message with status: {}", msg.status));
        }
        msg.status = "error".to_string();
        msg.error = Some(error);
        ctx.db.message().id().update(msg);
        Ok(())
    } else {
        Err("Message not found".to_string())
    }
}

#[reducer]
pub fn append_message_part(
    ctx: &ReducerContext,
    message_id: String,
    part_index: u32,
    content: String,
) -> Result<(), String> {
    check_len(&content, MAX_CONTENT_LEN, "Content")?;
    ctx.db
        .message()
        .id()
        .find(&message_id)
        .ok_or_else(|| format!("Message {} not found", message_id))?;
    ctx.db.message_part().insert(MessagePart {
        id: 0,
        message_id,
        part_index,
        content,
        created_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn create_tool_command(
    ctx: &ReducerContext,
    tool_call_id: String,
    message_id: String,
    session_id: String,
    agent_id: String,
    tool_name: String,
    tool_args: String,
) -> Result<(), String> {
    check_len(&tool_args, MAX_TOOL_ARGS_LEN, "Tool args")?;
    if ctx.db.message().id().find(&message_id).is_none() {
        return Err(format!("Message {} not found", message_id));
    }
    ctx.db
        .session()
        .id()
        .find(&session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    ctx.db.tool_command().insert(ToolCommand {
        id: 0,
        tool_call_id,
        message_id,
        session_id,
        agent_id,
        tool_name,
        tool_args,
        status: "pending".to_string(),
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn update_tool_command_status(
    ctx: &ReducerContext,
    tool_command_id: u64,
    status: String,
) -> Result<(), String> {
    if !["pending", "executing", "completed", "error"].contains(&status.as_str()) {
        return Err("Invalid status".to_string());
    }

    if let Some(mut command) = ctx.db.tool_command().id().find(&tool_command_id) {
        command.status = status;
        command.updated_at = ctx.timestamp;
        ctx.db.tool_command().id().update(command);
        Ok(())
    } else {
        Err("Tool command not found".to_string())
    }
}

#[reducer]
pub fn create_tool_result(
    ctx: &ReducerContext,
    tool_command_id: u64,
    success: bool,
    output: String,
    error: Option<String>,
) -> Result<(), String> {
    check_len(&output, MAX_TOOL_OUTPUT_LEN, "Tool output")?;
    if let Some(ref e) = error {
        check_len(e, MAX_ERROR_LEN, "Tool error")?;
    }
    if ctx.db.tool_command().id().find(&tool_command_id).is_none() {
        return Err(format!("Tool command {} not found", tool_command_id));
    }
    ctx.db.tool_result().insert(ToolResult {
        id: 0,
        tool_command_id,
        success,
        output,
        error,
        created_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn create_verification(
    ctx: &ReducerContext,
    session_id: String,
    message_id: String,
    passed: bool,
    reason: Option<String>,
) -> Result<(), String> {
    if let Some(ref r) = reason {
        check_len(r, MAX_VERIFICATION_REASON_LEN, "Verification reason")?;
    }
    ctx.db
        .session()
        .id()
        .find(&session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    ctx.db
        .message()
        .id()
        .find(&message_id)
        .ok_or_else(|| format!("Message {} not found", message_id))?;
    ctx.db.verification().insert(Verification {
        id: 0,
        session_id,
        message_id,
        passed,
        reason,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn register_agent(
    ctx: &ReducerContext,
    agent_id: String,
    name: String,
    owner_token: String,
    workdir: String,
) -> Result<(), String> {
    check_len(&name, MAX_AGENT_NAME, "Agent name")?;
    check_len(&owner_token, MAX_OWNER_TOKEN_LEN, "Owner token")?;
    check_len(&workdir, MAX_WORKDIR_LEN, "Working directory")?;
    if let Some(mut existing) = ctx.db.agent().id().find(&agent_id) {
        check_agent_owner(ctx, &existing)?;
        existing.status = "online".to_string();
        existing.last_heartbeat = ctx.timestamp;
        existing.workdir = workdir;
        existing.owner_token = owner_token;
        ctx.db.agent().id().update(existing);
    } else {
        ctx.db.agent().insert(Agent {
            id: agent_id,
            name,
            user_id: ctx.sender(),
            owner_token,
            workdir,
            status: "online".to_string(),
            last_heartbeat: ctx.timestamp,
            created_at: ctx.timestamp,
        });
    }
    Ok(())
}

#[reducer]
pub fn agent_heartbeat(ctx: &ReducerContext, agent_id: String) -> Result<(), String> {
    if let Some(mut agent) = ctx.db.agent().id().find(&agent_id) {
        check_agent_owner(ctx, &agent)?;
        agent.last_heartbeat = ctx.timestamp;
        ctx.db.agent().id().update(agent);
        Ok(())
    } else {
        Err("Agent not found".to_string())
    }
}

#[reducer]
pub fn agent_disconnect(ctx: &ReducerContext, agent_id: String) -> Result<(), String> {
    if let Some(mut agent) = ctx.db.agent().id().find(&agent_id) {
        check_agent_owner(ctx, &agent)?;
        agent.status = "offline".to_string();
        ctx.db.agent().id().update(agent);
        Ok(())
    } else {
        Err("Agent not found".to_string())
    }
}

#[reducer]
pub fn reap_stale_agents(ctx: &ReducerContext, max_stale_secs: u32) -> Result<(), String> {
    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let max_stale_micros = (max_stale_secs as i128) * 1_000_000;

    let stale: Vec<_> = ctx
        .db
        .agent()
        .iter()
        .filter(|a| {
            a.status == "online" && {
                let age = now_micros - a.last_heartbeat.to_micros_since_unix_epoch();
                i128::from(age) > max_stale_micros
            }
        })
        .collect();

    for mut agent in stale {
        agent.status = "offline".to_string();
        ctx.db.agent().id().update(agent);
    }

    Ok(())
}

#[reducer]
pub fn delete_session(ctx: &ReducerContext, session_id: String) -> Result<(), String> {
    ctx.db
        .session()
        .id()
        .find(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let tool_commands: Vec<_> = ctx
        .db
        .tool_command()
        .session_id()
        .filter(&session_id)
        .collect();
    for cmd in &tool_commands {
        let results: Vec<_> = ctx
            .db
            .tool_result()
            .tool_command_id()
            .filter(&cmd.id)
            .collect();
        for r in results {
            ctx.db.tool_result().id().delete(&r.id);
        }
        ctx.db.tool_command().id().delete(&cmd.id);
    }

    let verifications: Vec<_> = ctx
        .db
        .verification()
        .session_id()
        .filter(&session_id)
        .collect();
    for v in verifications {
        ctx.db.verification().id().delete(&v.id);
    }

    let messages: Vec<_> = ctx.db.message().session_id().filter(&session_id).collect();
    for msg in &messages {
        let parts: Vec<_> = ctx.db.message_part().message_id().filter(&msg.id).collect();
        for part in parts {
            ctx.db.message_part().id().delete(&part.id);
        }
        ctx.db.message().id().delete(&msg.id);
    }

    ctx.db.session().id().delete(&session_id);
    Ok(())
}

#[reducer]
pub fn set_message_tokens(
    ctx: &ReducerContext,
    message_id: String,
    prompt_tokens: u64,
    completion_tokens: u64,
) -> Result<(), String> {
    if let Some(mut msg) = ctx.db.message().id().find(&message_id) {
        msg.prompt_tokens = Some(prompt_tokens);
        msg.completion_tokens = Some(completion_tokens);
        ctx.db.message().id().update(msg);
        Ok(())
    } else {
        Err("Message not found".to_string())
    }
}

#[reducer]
pub fn delete_message(ctx: &ReducerContext, message_id: String) -> Result<(), String> {
    ctx.db
        .message()
        .id()
        .find(&message_id)
        .ok_or_else(|| "Message not found".to_string())?;

    let verifications: Vec<_> = ctx
        .db
        .verification()
        .message_id()
        .filter(&message_id)
        .collect();
    for v in verifications {
        ctx.db.verification().id().delete(&v.id);
    }

    let tool_commands: Vec<_> = ctx
        .db
        .tool_command()
        .message_id()
        .filter(&message_id)
        .collect();
    for cmd in &tool_commands {
        let results: Vec<_> = ctx
            .db
            .tool_result()
            .tool_command_id()
            .filter(&cmd.id)
            .collect();
        for r in results {
            ctx.db.tool_result().id().delete(&r.id);
        }
        ctx.db.tool_command().id().delete(&cmd.id);
    }

    let parts: Vec<_> = ctx
        .db
        .message_part()
        .message_id()
        .filter(&message_id)
        .collect();
    for part in parts {
        ctx.db.message_part().id().delete(&part.id);
    }

    ctx.db.message().id().delete(&message_id);
    Ok(())
}

#[reducer]
pub fn update_message_content(
    ctx: &ReducerContext,
    message_id: String,
    content: String,
) -> Result<(), String> {
    check_len(&content, MAX_CONTENT_LEN, "Content")?;
    ctx.db
        .message()
        .id()
        .find(&message_id)
        .ok_or_else(|| "Message not found".to_string())?;

    let parts: Vec<_> = ctx
        .db
        .message_part()
        .message_id()
        .filter(&message_id)
        .collect();
    for part in parts {
        ctx.db.message_part().id().delete(&part.id);
    }

    ctx.db.message_part().insert(MessagePart {
        id: 0,
        message_id,
        part_index: 0,
        content,
        created_at: ctx.timestamp,
    });
    Ok(())
}

const MAX_MODEL_LEN: usize = 100;
const MAX_SYSTEM_PROMPT_LEN: usize = 10_000;

#[reducer]
pub fn update_session_model(
    ctx: &ReducerContext,
    session_id: String,
    model: Option<String>,
) -> Result<(), String> {
    if let Some(ref m) = model {
        check_len(m, MAX_MODEL_LEN, "Model")?;
    }
    if let Some(mut session) = ctx.db.session().id().find(&session_id) {
        session.model = model;
        session.updated_at = ctx.timestamp;
        ctx.db.session().id().update(session);
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[reducer]
pub fn update_session_system_prompt(
    ctx: &ReducerContext,
    session_id: String,
    system_prompt: Option<String>,
) -> Result<(), String> {
    if let Some(ref p) = system_prompt {
        check_len(p, MAX_SYSTEM_PROMPT_LEN, "System prompt")?;
    }
    if let Some(mut session) = ctx.db.session().id().find(&session_id) {
        session.system_prompt = system_prompt;
        session.updated_at = ctx.timestamp;
        ctx.db.session().id().update(session);
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[reducer]
pub fn archive_session(
    ctx: &ReducerContext,
    session_id: String,
    archived: bool,
) -> Result<(), String> {
    if let Some(mut session) = ctx.db.session().id().find(&session_id) {
        session.is_archived = archived;
        session.updated_at = ctx.timestamp;
        ctx.db.session().id().update(session);
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[reducer]
pub fn cleanup_old_sessions(ctx: &ReducerContext, max_age_days: u32) -> Result<(), String> {
    let now_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let max_age_micros = (max_age_days as i128) * 24 * 60 * 60 * 1_000_000;

    let old_sessions: Vec<_> = ctx
        .db
        .session()
        .iter()
        .filter(|s| {
            let age = now_micros - s.created_at.to_micros_since_unix_epoch();
            i128::from(age) > max_age_micros
        })
        .collect();

    let mut deleted_count = 0u32;
    for session in &old_sessions {
        let tool_commands: Vec<_> = ctx
            .db
            .tool_command()
            .session_id()
            .filter(&session.id)
            .collect();
        for cmd in &tool_commands {
            let results: Vec<_> = ctx
                .db
                .tool_result()
                .tool_command_id()
                .filter(&cmd.id)
                .collect();
            for r in results {
                ctx.db.tool_result().id().delete(&r.id);
            }
            ctx.db.tool_command().id().delete(&cmd.id);
        }

        let verifications: Vec<_> = ctx
            .db
            .verification()
            .session_id()
            .filter(&session.id)
            .collect();
        for v in verifications {
            ctx.db.verification().id().delete(&v.id);
        }

        let messages: Vec<_> = ctx.db.message().session_id().filter(&session.id).collect();
        for msg in &messages {
            let parts: Vec<_> = ctx.db.message_part().message_id().filter(&msg.id).collect();
            for part in parts {
                ctx.db.message_part().id().delete(&part.id);
            }
            ctx.db.message().id().delete(&msg.id);
        }

        ctx.db.session().id().delete(&session.id);
        deleted_count += 1;
    }

    log::info!(
        "Cleaned up {} session(s) older than {} days",
        deleted_count,
        max_age_days
    );
    Ok(())
}
