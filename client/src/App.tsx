import { useEffect, useRef, useState } from "react"
import {
  DbConnection,
  Cursor,
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
 * Main application component for the collaborative drawing app
 */
function App() {
  // Application state
  const [connected, setConnected] = useState<boolean>(false)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [conn, setConn] = useState<DbConnection | null>(null)
  const cursors = useCursors(conn)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

      // Subscribe to cursor updates
      subscribeToQueries(conn, ["SELECT * FROM cursor"])
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

  // Track mouse movement and update cursor position in database
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!conn || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Call the update_cursor reducer to update position on the server
    conn.reducers.updateCursor(x, y)
  }

  // Draw all cursors on the canvas whenever positions update
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw all cursors (red for current user, blue for others)
    cursors.forEach((cursor, id) => {
      ctx.beginPath()
      ctx.arc(cursor.x, cursor.y, 5, 0, 2 * Math.PI)
      ctx.fillStyle = id === identity?.toHexString() ? "#ff0000" : "#0000ff"
      ctx.fill()
    })
  }, [cursors, identity])

  // Show loading screen while connecting
  if (!conn || !connected || !identity) {
    return (
      <div className="App">
        <h1>Connecting...</h1>
      </div>
    )
  }

  // Render the drawing canvas once connected
  return (
    <div className="App">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: "1px solid black" }}
        onMouseMove={handleMouseMove}
      />
    </div>
  )
}

export default App
