# Draw.io Collaborative Whiteboard

A collaborative, real-time drawing and whiteboard application powered by [SpacetimeDB](https://spacetimedb.com/), built with React, TypeScript, Vite, and a Rust backend. Multiple users can draw, erase, and save or load canvases together, with live cursor and brush updates.

## Features

-   🖌️ **Real-time collaborative drawing**: See other users' cursors and brush strokes live.
-   🧹 **Erase and clear**: Erase parts of the drawing or clear the entire canvas.
-   💾 **Save & load canvases**: Save the current state of the canvas and reload previous versions.
-   🖍️ **Custom brushes**: Choose color and size for your brush.
-   🔒 **User identity**: Each user is uniquely identified and their actions are tracked.

## Tech Stack

-   **Frontend**: React 19, TypeScript, Vite
-   **Backend**: Rust, SpacetimeDB
-   **Communication**: WebSockets via SpacetimeDB SDK

## Project Structure

```
.
├── client/   # React frontend (Vite, TypeScript)
│   ├── src/
│   ├── public/
│   └── ...
└── server/   # Rust backend (SpacetimeDB module)
    └── src/
```

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (for the frontend)
-   [Rust](https://www.rust-lang.org/) (for the backend)
-   [SpacetimeDB](https://spacetimedb.com/) (see their docs for setup)

### 1. Backend (Rust/SpacetimeDB)

1. **Install Rust and SpacetimeDB CLI**

    - [Install Rust](https://www.rust-lang.org/tools/install)
    - [Install SpacetimeDB](https://spacetimedb.com/install)

2. **Start the SpacetimeDB server locally**:

    ```sh
    spacetime start
    ```

    - By default, the server listens on `ws://localhost:3000`.

3. **Publish your module to SpacetimeDB** (from the project root, in a separate terminal):
    ```sh
    spacetime publish --project-path server draw-io
    ```
    - Replace `draw-io` with your desired database/module name if different.

For more details, see the [SpacetimeDB Rust Module Quickstart](https://spacetimedb.com/docs/modules/rust/quickstart) and [Getting Started](https://spacetimedb.com/docs/getting-started).

### 2. Frontend (React)

1. In the `client/` directory, install dependencies:
    ```sh
    pnpm install
    # or
    npm install
    ```
2. Start the development server:
    ```sh
    pnpm dev
    # or
    npm run dev
    ```
3. Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Configuration

-   The frontend expects the SpacetimeDB WebSocket server at `ws://localhost:3000` and the module name as `draw-io`. Adjust these in `App.tsx` if needed.

## Usage

-   **Draw**: Left-click and drag on the canvas.
-   **Erase**: Right-click and drag.
-   **Change color/size**: Use the toolbar.
-   **Save**: Click "Save Canvas", enter a name.
-   **Load**: Click a saved canvas name.
-   **Delete**: Click "Delete" next to your saved canvases.

## Development

-   **Frontend**: React + Vite + TypeScript, with hot reload.
-   **Backend**: Rust, SpacetimeDB module (see `server/src/lib.rs` for logic).

## License

MIT
