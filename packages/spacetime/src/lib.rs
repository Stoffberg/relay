use spacetimedb::{reducer, table, Identity, ReducerContext, Table, Timestamp};

#[table(accessor = session, public)]
pub struct Session {
    #[primary_key]
    id: String,
    user_id: Identity,
    title: String,
    status: String,
    created_at: Timestamp,
    updated_at: Timestamp,
}

#[table(accessor = message, public)]
pub struct Message {
    #[primary_key]
    id: String,
    session_id: String,
    user_id: Identity,
    role: String,
    status: String,
    created_at: Timestamp,
}

#[table(accessor = message_part, public)]
pub struct MessagePart {
    #[primary_key]
    #[auto_inc]
    id: u64,
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
    message_id: String,
    session_id: String,
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
    status: String,
    last_heartbeat: Timestamp,
    created_at: Timestamp,
}

#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("Relay SpacetimeDB module initialized");
}

#[reducer]
pub fn create_session(ctx: &ReducerContext, session_id: String) -> Result<(), String> {
    if ctx.db.session().id().find(&session_id).is_some() {
        return Ok(());
    }
    ctx.db.session().insert(Session {
        id: session_id,
        user_id: ctx.sender(),
        title: String::new(),
        status: "idle".to_string(),
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
    if !["streaming", "complete", "error"].contains(&status.as_str()) {
        return Err("Invalid status".to_string());
    }

    ctx.db.message().insert(Message {
        id: message_id,
        session_id,
        user_id: ctx.sender(),
        role,
        status,
        created_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn complete_message(ctx: &ReducerContext, message_id: String) -> Result<(), String> {
    if let Some(mut msg) = ctx.db.message().id().find(&message_id) {
        msg.status = "complete".to_string();
        ctx.db.message().id().update(msg);
        Ok(())
    } else {
        Err("Message not found".to_string())
    }
}

#[reducer]
pub fn fail_message(ctx: &ReducerContext, message_id: String, error: String) -> Result<(), String> {
    if let Some(mut msg) = ctx.db.message().id().find(&message_id) {
        msg.status = "error".to_string();
        ctx.db.message().id().update(msg);

        ctx.db.message_part().insert(MessagePart {
            id: 0,
            message_id,
            part_index: 9999,
            content: error,
            created_at: ctx.timestamp,
        });
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
    message_id: String,
    session_id: String,
    agent_id: String,
    tool_name: String,
    tool_args: String,
) -> Result<(), String> {
    ctx.db.tool_command().insert(ToolCommand {
        id: 0,
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
pub fn register_agent(ctx: &ReducerContext, agent_id: String, name: String) -> Result<(), String> {
    if let Some(mut existing) = ctx.db.agent().id().find(&agent_id) {
        existing.status = "online".to_string();
        existing.last_heartbeat = ctx.timestamp;
        ctx.db.agent().id().update(existing);
    } else {
        ctx.db.agent().insert(Agent {
            id: agent_id,
            name,
            user_id: ctx.sender(),
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
        agent.status = "offline".to_string();
        ctx.db.agent().id().update(agent);
        Ok(())
    } else {
        Err("Agent not found".to_string())
    }
}
