import { io } from 'socket.io-client'

const socket = io(import.meta.env.VITE_SERVER_URL || '', {
  autoConnect: false   // IMPORTANT: do not connect until user is in a live session
})

export default socket
