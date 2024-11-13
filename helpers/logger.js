const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const infoLogFilePath = path.join(logsDir, 'info.log');
const errorLogFilePath = path.join(logsDir, 'error.log');

function logMessage(message, severity = 'ERROR') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${severity}] - ${message}\n`;

  const logFilePath = severity === 'ERROR' ? errorLogFilePath : infoLogFilePath;

  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
}

module.exports = logMessage;