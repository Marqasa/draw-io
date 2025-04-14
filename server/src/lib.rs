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

// New table for storing drawing points
#[table(name = canvas_point, public)]
pub struct CanvasPoint {
    #[primary_key]
    id: u64, // Unique auto-incrementing ID
    identity: Identity, // Who drew this point
    x: f32,
    y: f32,
    color: String, // Using string for color (e.g., "#000000")
    size: f32,     // Brush size
    timestamp: Timestamp,
}

// New table for storing saved canvas states
#[table(name = canvas_state, public)]
pub struct CanvasState {
    #[primary_key]
    id: u64, // Unique ID for this saved state
    name: String,         // Name of the saved state
    created_by: Identity, // Who created this save
    created_at: Timestamp,
}

// New table to store the points associated with a saved canvas state
#[table(name = saved_canvas_point, public)]
pub struct SavedCanvasPoint {
    #[primary_key]
    id: u64, // Unique ID for this saved point
    state_id: u64, // References the state this point belongs to
    x: f32,
    y: f32,
    color: String,
    size: f32,
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

#[reducer]
// Adds a new drawing point to the canvas
pub fn add_drawing_point(ctx: &ReducerContext, x: f32, y: f32, color: String, size: f32) {
    // Create a new point with auto-incrementing ID
    let id = ctx.db.canvas_point().count() as u64 + 1;

    ctx.db.canvas_point().insert(CanvasPoint {
        id,
        identity: ctx.sender,
        x,
        y,
        color,
        size,
        timestamp: ctx.timestamp,
    });
}

#[reducer]
// Erases points near the given coordinates
pub fn erase_points(ctx: &ReducerContext, x: f32, y: f32, radius: f32) {
    // Find all points within the eraser radius and delete them
    let points_to_erase: Vec<CanvasPoint> = ctx
        .db
        .canvas_point()
        .iter()
        .filter(|point| {
            let dx = point.x - x;
            let dy = point.y - y;
            (dx * dx + dy * dy) <= radius * radius
        })
        .collect();

    for point in points_to_erase {
        ctx.db.canvas_point().delete(point);
    }
}

#[reducer]
// Saves the current canvas state with a given name
pub fn save_canvas_state(ctx: &ReducerContext, name: String) {
    let state_id = ctx.db.canvas_state().count() as u64 + 1;

    // Insert the state metadata
    ctx.db.canvas_state().insert(CanvasState {
        id: state_id,
        name,
        created_by: ctx.sender,
        created_at: ctx.timestamp,
    });

    // Save all current canvas points with this state
    let mut saved_point_id = ctx.db.saved_canvas_point().count() as u64 + 1;

    for point in ctx.db.canvas_point().iter() {
        ctx.db.saved_canvas_point().insert(SavedCanvasPoint {
            id: saved_point_id,
            state_id,
            x: point.x,
            y: point.y,
            color: point.color.clone(),
            size: point.size,
        });
        saved_point_id += 1;
    }
}

#[reducer]
// Clears all drawing points from the canvas
pub fn clear_canvas(ctx: &ReducerContext) {
    for point in ctx.db.canvas_point().iter() {
        ctx.db.canvas_point().delete(point);
    }
}

#[reducer]
// Loads a saved canvas state by its ID
pub fn load_canvas_state(ctx: &ReducerContext, state_id: u64) {
    // First clear the current canvas
    for point in ctx.db.canvas_point().iter() {
        ctx.db.canvas_point().delete(point);
    }

    // Find the saved state
    if let Some(state) = ctx.db.canvas_state().id().find(state_id) {
        let saved_points: Vec<SavedCanvasPoint> = ctx
            .db
            .saved_canvas_point()
            .iter()
            .filter(|p| p.state_id == state_id)
            .collect();

        // Store length before we consume the vector
        let point_count = saved_points.len();

        // Recreate each saved point on the current canvas
        let mut new_point_id = ctx.db.canvas_point().count() as u64 + 1;

        for saved_point in saved_points {
            ctx.db.canvas_point().insert(CanvasPoint {
                id: new_point_id,
                identity: ctx.sender, // The person loading becomes the owner
                x: saved_point.x,
                y: saved_point.y,
                color: saved_point.color,
                size: saved_point.size,
                timestamp: ctx.timestamp,
            });
            new_point_id += 1;
        }

        log::info!(
            "User {} loaded canvas state {} ({}) with {} points",
            ctx.sender,
            state.id,
            state.name,
            point_count
        );
    }
}

#[reducer]
// Deletes a saved canvas state by its ID
pub fn delete_canvas_state(ctx: &ReducerContext, state_id: u64) {
    // Check if the state exists
    if let Some(state) = ctx.db.canvas_state().id().find(state_id) {
        // Only allow deletion by the creator or if the state exists
        if state.created_by == ctx.sender {
            // Store the name before deleting
            let state_name = state.name.clone();

            // Delete all saved points associated with this state
            let points_to_delete: Vec<SavedCanvasPoint> = ctx
                .db
                .saved_canvas_point()
                .iter()
                .filter(|p| p.state_id == state_id)
                .collect();

            for point in points_to_delete {
                ctx.db.saved_canvas_point().delete(point);
            }

            // Delete the state itself
            ctx.db.canvas_state().delete(state);

            log::info!(
                "User {} deleted canvas state {} ({})",
                ctx.sender,
                state_id,
                state_name
            );
        }
    }
}
