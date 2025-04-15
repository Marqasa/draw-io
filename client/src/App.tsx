import { useEffect, useRef, useState } from "react"
import {
  DbConnection,
  Cursor,
  CanvasPoint,
  CanvasState,
  ErrorContext,
  EventContext,
} from "./module_bindings"
import { Identity } from "@clockworklabs/spacetimedb-sdk"
import "./App.css"

/**
 * Custom hook to manage cursor state from the database
 * Tracks cursor positions of all connected users
 */
function useCursors(conn: DbConnection | null): Map<string, Cursor> {
  const [cursors, setCursors] = useState<Map<string, Cursor>>(new Map())

  useEffect(() => {
    if (!conn) return
    // Handle new cursor insertions
    const onInsert = (_ctx: EventContext, cursor: Cursor) => {
      setCursors(
        (prev) => new Map(prev.set(cursor.identity.toHexString(), cursor))
      )
    }
    conn.db.cursor.onInsert(onInsert)

    // Handle cursor position updates
    const onUpdate = (
      _ctx: EventContext,
      oldCursor: Cursor,
      newCursor: Cursor
    ) => {
      setCursors((prev) => {
        prev.delete(oldCursor.identity.toHexString())
        return new Map(prev.set(newCursor.identity.toHexString(), newCursor))
      })
    }
    conn.db.cursor.onUpdate(onUpdate)

    // Handle cursor deletions when users disconnect
    const onDelete = (_ctx: EventContext, cursor: Cursor) => {
      setCursors((prev) => {
        prev.delete(cursor.identity.toHexString())
        return new Map(prev)
      })
    }
    conn.db.cursor.onDelete(onDelete)

    // Clean up event listeners on unmount
    return () => {
      conn.db.cursor.removeOnInsert(onInsert)
      conn.db.cursor.removeOnUpdate(onUpdate)
      conn.db.cursor.removeOnDelete(onDelete)
    }
  }, [conn])

  return cursors
}

/**
 * Custom hook to manage canvas points from the database
 */
function useCanvasPoints(conn: DbConnection | null): CanvasPoint[] {
  const [points, setPoints] = useState<CanvasPoint[]>([])

  useEffect(() => {
    if (!conn) return

    // Handle new point insertions
    const onInsert = (_ctx: EventContext, point: CanvasPoint) => {
      setPoints((prev) => [...prev, point])
    }
    conn.db.canvasPoint.onInsert(onInsert)

    // Handle point deletions
    const onDelete = (_ctx: EventContext, point: CanvasPoint) => {
      setPoints((prev) => prev.filter((p) => p.id !== point.id))
    }
    conn.db.canvasPoint.onDelete(onDelete)

    // Clean up event listeners
    return () => {
      conn.db.canvasPoint.removeOnInsert(onInsert)
      conn.db.canvasPoint.removeOnDelete(onDelete)
    }
  }, [conn])

  return points
}

/**
 * Custom hook to manage saved canvas states from the database
 */
function useCanvasStates(conn: DbConnection | null): CanvasState[] {
  const [states, setStates] = useState<CanvasState[]>([])

  useEffect(() => {
    if (!conn) return

    // Handle new state insertions
    const onInsert = (_ctx: EventContext, state: CanvasState) => {
      setStates((prev) => [...prev, state])
    }
    conn.db.canvasState.onInsert(onInsert)

    // Handle state deletions
    const onDelete = (_ctx: EventContext, state: CanvasState) => {
      setStates((prev) => prev.filter((s) => s.id !== state.id))
    }
    conn.db.canvasState.onDelete(onDelete)

    // Clean up
    return () => {
      conn.db.canvasState.removeOnInsert(onInsert)
      conn.db.canvasState.removeOnDelete(onDelete)
    }
  }, [conn])

  return states
}

/**
 * Main application component for the collaborative drawing app
 */
function App() {
  // Application state
  const [connected, setConnected] = useState<boolean>(false)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [conn, setConn] = useState<DbConnection | null>(null)
  const cursors = useCursors(conn)
  const canvasPoints = useCanvasPoints(conn)
  const canvasStates = useCanvasStates(conn)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Drawing state
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [isErasing, setIsErasing] = useState<boolean>(false)
  const [brushColor, setBrushColor] = useState<string>("#000000")
  const [brushSize, setBrushSize] = useState<number>(3)
  const [eraserSize, setEraserSize] = useState<number>(10)
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false)
  const [saveName, setSaveName] = useState<string>("")
  const [loadWarningOpen, setLoadWarningOpen] = useState<boolean>(false)
  const [stateToLoad, setStateToLoad] = useState<CanvasState | null>(null)
  const [notification, setNotification] = useState<{
    message: string
    visible: boolean
  }>({ message: "", visible: false })
  const [deleteWarningOpen, setDeleteWarningOpen] = useState<boolean>(false)
  const [stateToDelete, setStateToDelete] = useState<CanvasState | null>(null)

  useEffect(() => {
    // Helper function to subscribe to database queries
    const subscribeToQueries = (conn: DbConnection, queries: string[]) => {
      for (const query of queries) {
        conn
          ?.subscriptionBuilder()
          .onApplied(() => {
            console.log("SDK client cache initialized.")
          })
          .subscribe(query)
      }
    }

    // Handler for successful connection
    const onConnect = (
      conn: DbConnection,
      identity: Identity,
      token: string
    ) => {
      setIdentity(identity)
      setConnected(true)
      localStorage.setItem("auth_token", token)
      console.log(
        "Connected to SpacetimeDB with identity:",
        identity.toHexString()
      )

      // Subscribe to cursor updates and canvas data
      subscribeToQueries(conn, [
        "SELECT * FROM cursor",
        "SELECT * FROM canvas_point",
        "SELECT * FROM canvas_state",
      ])
    }

    // Handler for disconnection
    const onDisconnect = () => {
      console.log("Disconnected from SpacetimeDB")
      setConnected(false)
    }

    // Handler for connection errors
    const onConnectError = (_ctx: ErrorContext, err: Error) => {
      console.log("Error connecting to SpacetimeDB:", err)
    }

    // Initialize the SpacetimeDB connection
    setConn(
      DbConnection.builder()
        .withUri("ws://localhost:3000")
        .withModuleName("draw-io")
        .withToken(localStorage.getItem("auth_token") || "")
        .onConnect(onConnect)
        .onDisconnect(onDisconnect)
        .onConnectError(onConnectError)
        .build()
    )
  }, [])

  // Mouse event handlers
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!conn || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Right click for erasing, left click for drawing
    if (event.button === 2) {
      event.preventDefault() // Prevent context menu
      setIsErasing(true)
      conn.reducers.erasePoints(x, y, eraserSize)
    } else {
      setIsDrawing(true)
      conn.reducers.addDrawingPoint(x, y, brushColor, brushSize)
    }
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!conn || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Update cursor position with current brush settings
    conn.reducers.updateCursor(x, y, brushColor, brushSize)

    // Add drawing point if currently drawing
    if (isDrawing) {
      conn.reducers.addDrawingPoint(x, y, brushColor, brushSize)
    }

    // Erase points if currently erasing
    if (isErasing) {
      conn.reducers.erasePoints(x, y, eraserSize)
    }
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
    setIsErasing(false)
  }

  const handleSaveCanvas = () => {
    if (!conn || !saveName.trim()) return
    conn.reducers.saveCanvasState(saveName.trim())
    setSaveName("")
    setSaveModalOpen(false)
  }

  const handleClearCanvas = () => {
    if (!conn) return
    if (window.confirm("Are you sure you want to clear the canvas?")) {
      conn.reducers.clearCanvas()
    }
  }

  const handleLoadStateClick = (state: CanvasState) => {
    setStateToLoad(state)
    setLoadWarningOpen(true)
  }

  const handleLoadState = () => {
    if (!conn || !stateToLoad) return
    conn.reducers.loadCanvasState(BigInt(stateToLoad.id))
    setLoadWarningOpen(false)

    // Show notification
    setNotification({
      message: `Loaded canvas: ${stateToLoad.name}`,
      visible: true,
    })

    // Hide notification after 3 seconds
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }))
    }, 3000)

    setStateToLoad(null)
  }

  const handleDeleteStateClick = (
    event: React.MouseEvent,
    state: CanvasState
  ) => {
    event.stopPropagation() // Prevent triggering the parent click event (load)
    setStateToDelete(state)
    setDeleteWarningOpen(true)
  }

  const handleDeleteState = () => {
    if (!conn || !stateToDelete) return
    conn.reducers.deleteCanvasState(BigInt(stateToDelete.id))
    setDeleteWarningOpen(false)

    // Show notification
    setNotification({
      message: `Deleted canvas: ${stateToDelete.name}`,
      visible: true,
    })

    // Hide notification after 3 seconds
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }))
    }, 3000)

    setStateToDelete(null)
  }

  // Draw all cursors and canvas points whenever they update
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw all canvas points
    canvasPoints.forEach((point) => {
      ctx.beginPath()
      ctx.arc(point.x, point.y, point.size, 0, 2 * Math.PI)
      ctx.fillStyle = point.color
      ctx.fill()
    })

    // Draw all cursors
    cursors.forEach((cursor, id) => {
      ctx.beginPath()
      if (id === identity?.toHexString()) {
        // Current user's cursor shows their brush settings with full opacity
        ctx.arc(cursor.x, cursor.y, cursor.size, 0, 2 * Math.PI)
        ctx.fillStyle = cursor.color
        ctx.fill()
      } else {
        // Other users' cursors show their brush settings with reduced opacity
        ctx.arc(cursor.x, cursor.y, cursor.size, 0, 2 * Math.PI)
        ctx.fillStyle = cursor.color
        ctx.globalAlpha = 0.3 // Make other users' cursors semi-transparent
        ctx.fill()
        ctx.globalAlpha = 1.0 // Reset alpha
      }
    })
  }, [cursors, canvasPoints, identity])

  // Show loading screen while connecting
  if (!conn || !connected || !identity) {
    return (
      <div className="App">
        <h1>Connecting...</h1>
      </div>
    )
  }

  // Render the drawing canvas and controls
  return (
    <div className="App">
      <div className="toolbar">
        <div className="color-picker">
          <label>Color:</label>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
          />
        </div>

        <div className="size-picker">
          <label>Brush Size:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
          />
        </div>

        <div className="size-picker">
          <label>Eraser Size:</label>
          <input
            type="range"
            min="5"
            max="50"
            value={eraserSize}
            onChange={(e) => setEraserSize(parseInt(e.target.value))}
          />
        </div>

        <button onClick={() => setSaveModalOpen(true)}>Save Canvas</button>

        <button onClick={handleClearCanvas}>Clear Canvas</button>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: "1px solid black" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()} // Prevent context menu on right click
      />

      {saveModalOpen && (
        <div className="save-modal">
          <div className="modal-content">
            <h2>Save Canvas</h2>
            <input
              type="text"
              placeholder="Enter a name for your canvas"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <div className="modal-buttons">
              <button onClick={handleSaveCanvas}>Save</button>
              <button onClick={() => setSaveModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loadWarningOpen && stateToLoad && (
        <div className="save-modal">
          <div className="modal-content">
            <h2>Load Canvas</h2>
            <p>Are you sure you want to load "{stateToLoad.name}"?</p>
            <p>Any unsaved changes will be lost.</p>
            <div className="modal-buttons">
              <button onClick={handleLoadState}>Load</button>
              <button
                onClick={() => {
                  setLoadWarningOpen(false)
                  setStateToLoad(null)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteWarningOpen && stateToDelete && (
        <div className="save-modal">
          <div className="modal-content">
            <h2>Delete Canvas</h2>
            <p>Are you sure you want to delete "{stateToDelete.name}"?</p>
            <p>This action cannot be undone.</p>
            <div className="modal-buttons">
              <button onClick={handleDeleteState}>Delete</button>
              <button
                onClick={() => {
                  setDeleteWarningOpen(false)
                  setStateToDelete(null)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {notification.visible && (
        <div className="notification">{notification.message}</div>
      )}

      {canvasStates.length > 0 && (
        <div className="saved-states">
          <h3>Saved Canvases</h3>
          <ul>
            {canvasStates.map((state) => (
              <li key={state.id} onClick={() => handleLoadStateClick(state)}>
                {state.name} (saved by{" "}
                {state.createdBy.toHexString().substring(0, 8)}...)
                {state.createdBy.toHexString() === identity.toHexString() && (
                  <button
                    className="delete-btn"
                    onClick={(e) => handleDeleteStateClick(e, state)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default App
