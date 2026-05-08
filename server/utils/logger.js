const pino = require('pino')

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label, number) => {
      return { level: label }
    },
    bindings: (bindings) => {
      return { pid: bindings.pid, host: bindings.hostname }
    },
  },
})

module.exports = logger
