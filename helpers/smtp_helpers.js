
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const logMessage = require('./logger');


class SMTPHelper {
    constructor(host, port, username, password, authType = 'NTLM', useTls = false) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.authType = authType;
        this.useTls = useTls;
        this.domain = '';
        this.workstation = 'siemplus';
        this.connection = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const options = {
                host: this.host,
                port: this.port
            };

            const connectCallback = () => {
                console.log('Connected to SMTP server');
                resolve();
            };

            this.connection = this.useTls
                ? tls.connect(options, connectCallback)
                : net.createConnection(options, connectCallback);

            this.connection.on('error', (error) => {
                console.error('Connection error:', error);
                reject(error);
            });
        });
    }

    sendCommand(command) {
        return new Promise((resolve) => {
            this.connection.write(command + "\r\n");
            this.connection.once('data', (data) => {
                console.log('Server response:', data.toString());
                resolve(data.toString());
            });
        });
    }

    async authenticate() {
        await this.sendCommand("EHLO localhost");

        if (this.useTls) {
            await this.sendCommand("STARTTLS");
            this.connection = tls.connect({ socket: this.connection });
            await this.sendCommand("EHLO localhost");
        }

        if (this.authType === 'NTLM') {
            await this.authNtlm();
        } else {
            console.error("Unsupported auth type:", this.authType);
        }
    }

    authNtlm() {
        return new Promise(async (resolve) => {
          let domain = await this.escapeShellArg(this.domain);
          let workstation = await this.escapeShellArg(this.workstation);
          let username = await this.escapeShellArg(this.username);
          let password = await this.escapeShellArg(this.password);

          console.log('Domain:', domain, 'Workstation:', workstation, 'Username:', username, 'Password:', password);
          const type1Command = `/usr/local/siemplus/scripts/ntlm --ntlmversion 2 --domain ${domain} --workstation ${workstation} type1`;
          const type1Message = execSync(type1Command, { encoding: 'utf-8' }).trim();
          console.log("NTLM Type 1 message:", type1Message);
          let serverRes = await this.sendCommand(`AUTH NTLM ${type1Message}`);

          const avoid334 = serverRes.trim().substring(4);
          console.log("NTLM Type 2 message:", avoid334);

          const type3Command = `/usr/local/siemplus/scripts/ntlm --ntlmversion 2 --domain ${domain} --workstation ${workstation} type3 --username ${username} --password ${password} --type2 ${avoid334}`;
          const type3Message = execSync(type3Command, { encoding: 'utf-8' }).trim();
          console.log("NTLM Type 3 message:", type3Message);

          const response = await this.sendCommand(type3Message);
          console.log("NTLM Type 3 response:", response);
          resolve();
        });
    }

    async escapeShellArg(arg) {
      return `'${arg.replace(/'/g, `'\\''`)}'`;
    }

    async sendMail(from, to, subject, body, isHtml = true, attachments = []) {
        if (!Array.isArray(to)) {
            to = [to];
        }
    
        console.log('Sending email to:', to.join(', '));
        await this.sendCommand(`MAIL FROM: <${from}>`);
    
        for (const recipient of to) {
            await this.sendCommand(`RCPT TO: <${recipient}>`);
        }
    
        await this.sendCommand('DATA');
    
        let headers = `From: ${from}\r\n`;
        headers += `To: ${to.join(', ')}\r\n`;
        headers += `Subject: ${subject}\r\n`;
        headers += isHtml ? 'Content-Type: text/html; charset=UTF-8\r\n' : 'Content-Type: text/plain; charset=UTF-8\r\n';
    
        if (attachments.length > 0) {
            const boundary = crypto.randomBytes(16).toString('hex');
            headers += `MIME-Version: 1.0\r\n`;
            headers += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
            body = `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}\r\n\r\n`;
    
            for (const filePath of attachments) {
                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath, { encoding: 'base64' });
                    const fileName = filePath.split('/').pop();
    
                    if (!fileContent) {
                        logMessage(`File ${fileName} is empty or not readable.`);
                        continue;
                    }

                    const contentType = fileName.endsWith('.zip') ? 'application/zip' : 'application/octet-stream';
    
                    body += `--${boundary}\r\nContent-Type: ${contentType}; name="${fileName}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${fileName}"\r\n\r\n${fileContent}\r\n\r\n`;
                } else {
                    logMessage(`File not found: ${filePath}`);
                }
            }
            body += `--${boundary}--\r\n`;
        }
    
        await this.sendCommand(`${headers}\r\n${body}\r\n.`);
    }    

    async quit() {
      try {
          const response = await this.sendCommand("QUIT");
          console.log("QUIT response:", response);
      } catch (error) {
          console.error("Error sending QUIT command:", error);
      } finally {
          if (this.connection) {
              this.connection.end();
              console.log("Connection closed.");
          }
      }
  }
}

module.exports = SMTPHelper;
