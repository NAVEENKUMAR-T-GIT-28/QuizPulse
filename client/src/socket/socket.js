// client/src/socket/socket.js

import { io } from 'socket.io-client'

const socket = io(import.meta.env.VITE_SERVER_URL || '', {
  autoConnect:       false,
  withCredentials:   true,   // ← sends the httpOnly cookie with the WS handshake
  // auth callback removed — server reads the cookie directly
})

export default socket