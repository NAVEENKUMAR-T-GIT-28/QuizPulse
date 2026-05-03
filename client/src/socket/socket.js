import { io } from 'socket.io-client'
import { getToken } from '../hooks/useAuth'

const socket = io(import.meta.env.VITE_SERVER_URL || '', {
  autoConnect: false,  // IMPORTANT: do not connect until user is in a live session
  auth: (cb) => {
    // Called each time the socket connects/reconnects — always sends the latest token.
    // Players won't have a token; that's fine — the server only checks it for host events.
    cb({ token: getToken() || null })
  },
})

export default socket