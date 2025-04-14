use spacetimedb::{reducer, table, Identity, ReducerContext, Table, Timestamp};

#[table(name = cursor, public)]
// Cursor table definition - tracks user cursor positions
pub struct Cursor {
    #[primary_key]
    identity: Identity,
    x: f32,
    y: f32,
    last_updated: Timestamp,
}

#[reducer(client_connected)]
// Handles a new client connection
pub fn identity_connected(ctx: &ReducerContext) {
    // Create a cursor entry for the new user
    ctx.db.cursor().insert(Cursor {
        identity: ctx.sender,
        x: 0.0,
        y: 0.0,
        last_updated: ctx.timestamp,
    });
}

#[reducer(client_disconnected)]
// Handles a client disconnection
pub fn identity_disconnected(ctx: &ReducerContext) {
    // Remove the cursor when a user disconnects
    if let Some(cursor) = ctx.db.cursor().identity().find(ctx.sender) {
        ctx.db.cursor().delete(cursor);
    }
}

#[reducer]
// Updates a user's cursor position
pub fn update_cursor(ctx: &ReducerContext, x: f32, y: f32) {
    if let Some(cursor) = ctx.db.cursor().identity().find(ctx.sender) {
        ctx.db.cursor().identity().update(Cursor {
            x,
            y,
            last_updated: ctx.timestamp,
            ..cursor
        });
    }
}
