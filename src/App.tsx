import React, { useState, useEffect, useRef } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FolderOpen, 
  FileText, 
  Play, 
  Square, 
  Plus, 
  Trash2, 
  Copy, 
  Download, 
  RefreshCw, 
  Sliders, 
  Terminal, 
  Settings, 
  Mail, 
  Lock, 
  User, 
  Server,
  Search,
  FilePlus,
  ArrowRight,
  Sparkles,
  Info
} from "lucide-react";

interface ScannedFile {
  name: string;
  size: number;
  modified: string;
  totalLines: number;
  parsedCount: number;
}

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

interface BulkStatus {
  active: boolean;
  fileName: string;
  total: number;
  checked: number;
  successCount: number;
  failureCount: number;
  concurrency: number;
  startTime: number | null;
  endTime: number | null;
  logs: string[];
  currentIndex: number;
  usingProxies: boolean;
  proxyCount: number;
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

interface SuccessCred {
  id: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  rawLine: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"bulk" | "single" | "results">("bulk");
  const [scanFolder, setScanFolder] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");
  const [files, setFiles] = useState<ScannedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [filePreview, setFilePreview] = useState<{ name: string; preview: Credential[]; totalLines: number; credentialsCount: number } | null>(null);
  
  // Bulk controls
  const [concurrency, setConcurrency] = useState<number>(10);
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);
  
  // Proxy controls
  const [selectedProxyFile, setSelectedProxyFile] = useState<string>("");
  const [proxyType, setProxyType] = useState<"socks5" | "http">("socks5");
  const [parsedProxies, setParsedProxies] = useState<any[]>([]);
  const [parsingProxies, setParsingProxies] = useState<boolean>(false);
  const [proxyParseError, setProxyParseError] = useState<string>("");
  const [proxyFilter, setProxyFilter] = useState<"all" | "valid" | "invalid">("all");
  const [proxySearch, setProxySearch] = useState<string>("");
  
  // Single controls
  const [singleHost, setSingleHost] = useState("");
  const [singlePort, setSinglePort] = useState("993");
  const [singleUser, setSingleUser] = useState("");
  const [singlePass, setSinglePass] = useState("");
  const [singleSecure, setSingleSecure] = useState(true);
  const [singleTimeout, setSingleTimeout] = useState("10000");
  const [singleTesting, setSingleTesting] = useState(false);
  const [singleResult, setSingleResult] = useState<{ success: boolean; message: string } | null>(null);

  // Lists & Logs
  const [logs, setLogs] = useState<AttemptLog[]>([]);
  const [successes, setSuccesses] = useState<SuccessCred[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "success" | "failed">("all");

  // Create file modal / state
  const [showCreateFile, setShowCreateFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [createFileError, setCreateFileError] = useState("");

  const bulkLogsEndRef = useRef<HTMLDivElement>(null);

  // Fetch configs, files, successes, and logs on load
  useEffect(() => {
    fetchScanConfig();
    fetchFiles();
    fetchLogs();
    fetchSuccesses();
  }, []);

  // Poll bulk tester status
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBulkStatus();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll logs and successes periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs();
      fetchSuccesses();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-resolve IMAP settings when entering an email in the Single connection tab
  useEffect(() => {
    if (!singleUser || !singleUser.includes("@")) return;
    const parts = singleUser.split("@");
    if (parts.length < 2) return;
    const domain = parts[1].trim();
    if (domain.includes(".") && domain.length > 3) {
      const controller = new AbortController();
      const delayDebounceFn = setTimeout(async () => {
        try {
          const res = await fetch(`/api/lookup-imap?q=${encodeURIComponent(domain)}`, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            if (data.host) {
              setSingleHost(data.host);
              setSinglePort(data.port.toString());
              setSingleSecure(data.secure);
            }
          }
        } catch (err) {
          // ignore aborted or network errors
        }
      }, 400);

      return () => {
        controller.abort();
        clearTimeout(delayDebounceFn);
      };
    }
  }, [singleUser]);

  // Load and parse selected proxy file
  useEffect(() => {
    loadParsedProxies(selectedProxyFile, proxyType);
  }, [selectedProxyFile, proxyType]);

  const loadParsedProxies = async (fileName: string, type: "socks5" | "http") => {
    if (!fileName) {
      setParsedProxies([]);
      setProxyParseError("");
      return;
    }
    setParsingProxies(true);
    setProxyParseError("");
    try {
      const res = await fetch(`/api/parse-proxies?fileName=${encodeURIComponent(fileName)}&proxyType=${type}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setParsedProxies(data.proxies || []);
      } else {
        setProxyParseError(data.error || "Failed to load proxies");
      }
    } catch (err: any) {
      setProxyParseError(err.message || "Network error loading proxies");
    } finally {
      setParsingProxies(false);
    }
  };

  const getFilteredProxies = () => {
    return parsedProxies.filter(p => {
      // 1. Filter by validation status
      if (proxyFilter === "valid" && (p.type !== "proxy" || !p.valid)) {
        return false;
      }
      if (proxyFilter === "invalid" && (p.type !== "proxy" || p.valid)) {
        return false;
      }
      
      // 2. Filter by search query
      if (proxySearch.trim() !== "") {
        const query = proxySearch.toLowerCase();
        if (p.type === "proxy") {
          const rawMatch = p.raw.toLowerCase().includes(query);
          const hostMatch = p.parsed?.host?.toLowerCase().includes(query);
          const portMatch = String(p.parsed?.port || "").includes(query);
          const userMatch = p.parsed?.user?.toLowerCase().includes(query);
          return rawMatch || hostMatch || portMatch || userMatch;
        } else {
          return p.raw?.toLowerCase().includes(query);
        }
      }
      
      return true;
    });
  };

  const fetchScanConfig = async () => {
    try {
      const res = await fetch("/api/scan-config");
      const data = await res.json();
      setScanFolder(data.scanFolder);
      setNewFolderInput(data.scanFolder);
    } catch (e) {
      console.error(e);
    }
  };

  const updateScanConfig = async () => {
    if (!newFolderInput.trim()) return;
    try {
      const res = await fetch("/api/scan-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: newFolderInput })
      });
      const data = await res.json();
      if (data.success) {
        setScanFolder(data.scanFolder);
        setShowConfig(false);
        fetchFiles();
      } else {
        alert(data.error || "Failed to update directory");
      }
    } catch (e) {
      alert("Error updating folder directory");
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      setFiles(data.files || []);
      if (selectedProxyFile) {
        loadParsedProxies(selectedProxyFile, proxyType);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSuccesses = async () => {
    try {
      const res = await fetch("/api/successes");
      const data = await res.json();
      setSuccesses(data.successes || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBulkStatus = async () => {
    try {
      const res = await fetch("/api/test-bulk-status");
      const data = await res.json();
      setBulkStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileSelect = async (fileName: string) => {
    setSelectedFile(fileName);
    try {
      const res = await fetch(`/api/file-preview?name=${encodeURIComponent(fileName)}`);
      const data = await res.json();
      if (res.ok) {
        setFilePreview(data);
      } else {
        setFilePreview(null);
        alert(data.error || "Failed to load preview");
      }
    } catch (e) {
      setFilePreview(null);
      console.error(e);
    }
  };

  const startBulkTest = async () => {
    if (!selectedFile) return;
    try {
      const res = await fetch("/api/test-bulk-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          fileName: selectedFile, 
          concurrency,
          proxyFileName: selectedProxyFile || undefined,
          proxyType
        })
      });
      const data = await res.json();
      if (res.ok) {
        fetchBulkStatus();
      } else {
        alert(data.error || "Failed to start bulk test");
      }
    } catch (e) {
      alert("Error initiating bulk test");
    }
  };

  const stopBulkTest = async () => {
    try {
      await fetch("/api/test-bulk-stop", { method: "POST" });
      fetchBulkStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFile = async (name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      const res = await fetch(`/api/files?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedFile === name) {
          setSelectedFile("");
          setFilePreview(null);
        }
        fetchFiles();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete file");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const createCredentialFile = async () => {
    if (!newFileName.trim() || !newFileContent.trim()) {
      setCreateFileError("File name and content are required.");
      return;
    }
    
    let extension = newFileName.endsWith(".txt") || newFileName.endsWith(".csv") ? "" : ".txt";
    const fullFileName = `${newFileName}${extension}`;

    try {
      const res = await fetch("/api/create-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullFileName, content: newFileContent })
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateFile(false);
        setNewFileName("");
        setNewFileContent("");
        setCreateFileError("");
        fetchFiles();
        handleFileSelect(fullFileName);
      } else {
        setCreateFileError(data.error || "Failed to create file");
      }
    } catch (e) {
      setCreateFileError("Server error writing file.");
    }
  };

  const testSingleConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleHost || !singlePort || !singleUser || !singlePass) {
      alert("Please fill in all connection parameters");
      return;
    }

    setSingleTesting(true);
    setSingleResult(null);

    try {
      const res = await fetch("/api/test-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: singleHost,
          port: singlePort,
          user: singleUser,
          pass: singlePass,
          secure: singleSecure,
          timeout: singleTimeout
        })
      });

      const data = await res.json();
      setSingleResult({
        success: data.success,
        message: data.message || "Unknown server response"
      });
      fetchLogs();
      fetchSuccesses();
    } catch (err: any) {
      setSingleResult({
        success: false,
        message: `API connection error: ${err.message}`
      });
    } finally {
      setSingleTesting(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm("Clear all historical connection logs?")) return;
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const clearSuccesses = async () => {
    if (!confirm("Clear all saved successful connections?")) return;
    try {
      await fetch("/api/successes/clear", { method: "POST" });
      fetchSuccesses();
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllSuccesses = () => {
    const bulkText = successes.map(s => s.rawLine).join("\n");
    if (!bulkText) return;
    navigator.clipboard.writeText(bulkText);
    alert("Copied all successful credentials to clipboard!");
  };

  // Filtered log computations
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.host.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.sourceFile.toLowerCase().includes(logSearch.toLowerCase());
    
    if (logStatusFilter === "all") return matchesSearch;
    if (logStatusFilter === "success") return matchesSearch && log.status === "success";
    if (logStatusFilter === "failed") return matchesSearch && log.status === "failed";
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      {/* Upper Navigation & Brand Banner */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-slate-900 text-white p-2.5 rounded-lg flex items-center justify-center shadow-sm">
              <Server className="h-6 w-6 text-slate-100" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-display font-bold text-lg tracking-tight text-slate-900">DELTA IMAP TESTER</span>
                <span className="bg-slate-100 text-slate-700 text-[10px] font-medium tracking-wider px-2 py-0.5 rounded uppercase">Enterprise v1.2</span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Delta Marketing Solution SARL AU</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono">
              <FolderOpen className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500 select-all">Path: {scanFolder || "Loading..."}</span>
              <button 
                onClick={() => {
                  setNewFolderInput(scanFolder);
                  setShowConfig(!showConfig);
                }} 
                className="ml-2 text-slate-900 hover:text-indigo-600 font-sans font-semibold cursor-pointer underline transition-colors"
              >
                Change
              </button>
            </div>

            <div className="flex items-center space-x-1.5 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold">Local Node Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Configuration Drawer/Modal */}
      {showConfig && (
        <div className="bg-slate-100 border-b border-slate-200 py-4 px-6 shadow-inner">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-end sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Scan Directory Folder (Relative or Absolute)
              </label>
              <div className="relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FolderOpen className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  placeholder="e.g. scans, /var/credentials, data"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <div className="flex space-x-2 w-full sm:w-auto">
              <button
                onClick={updateScanConfig}
                className="flex-1 sm:flex-none bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Apply Path
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="flex-1 sm:flex-none bg-slate-200 text-slate-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Banner Alert if Bulk Testing is Active */}
        {bulkStatus?.active && (
          <div className="bg-slate-900 border border-slate-800 text-white p-4 rounded-xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center space-x-3">
              <div className="bg-slate-800 p-2 rounded-lg">
                <Sliders className="h-5 w-5 text-indigo-400 animate-spin" />
              </div>
              <div>
                <h4 className="font-bold text-sm tracking-wide">ACTIVE BULK CONNECTION TEST RUNNING</h4>
                <p className="text-xs text-slate-400">
                  Checking accounts from <span className="text-slate-100 font-semibold">{bulkStatus.fileName}</span> with concurrency of {bulkStatus.concurrency} threads.
                  {bulkStatus.usingProxies && (
                    <span className="ml-2 bg-indigo-500/30 text-indigo-300 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-indigo-500/20">
                      Rotating {bulkStatus.proxyCount} Proxies
                    </span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="w-full md:w-72 flex flex-col">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span>Progress: {bulkStatus.checked} / {bulkStatus.total} ({Math.round((bulkStatus.checked / bulkStatus.total) * 100) || 0}%)</span>
                <span className="text-emerald-400 font-semibold">OK: {bulkStatus.successCount}</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(bulkStatus.checked / bulkStatus.total) * 100}%` }}
                ></div>
              </div>
            </div>

            <button
              onClick={stopBulkTest}
              className="w-full md:w-auto bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>CANCEL BULK RUN</span>
            </button>
          </div>
        )}

        {/* Dashboard Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200 flex items-center space-x-4">
            <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Credential Files</p>
              <h3 className="text-2xl font-bold font-display text-slate-900">{files.length}</h3>
              <p className="text-[10px] text-slate-400">Found in scan directory</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200 flex items-center space-x-4">
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-lg">
              <Sliders className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Bulk Task Status</p>
              <h3 className={`text-lg font-bold font-display ${bulkStatus?.active ? 'text-indigo-600' : 'text-slate-600'}`}>
                {bulkStatus?.active ? 'Checking...' : 'Idle'}
              </h3>
              <p className="text-[10px] text-slate-400">
                {bulkStatus?.active ? `Finished ${bulkStatus.checked}/${bulkStatus.total}` : "Waiting for run"}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200 flex items-center space-x-4">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Saved Successes</p>
              <h3 className="text-2xl font-bold font-display text-emerald-600">{successes.length}</h3>
              <p className="text-[10px] text-slate-400">Written to successful_imap.txt</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200 flex items-center space-x-4">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-lg">
              <Terminal className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attempted Logs</p>
              <h3 className="text-2xl font-bold font-display text-slate-900">{logs.length}</h3>
              <p className="text-[10px] text-slate-400">Total historical logs loaded</p>
            </div>
          </div>
        </div>

        {/* Custom Tab Bar */}
        <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs">
          <button
            onClick={() => setActiveTab("bulk")}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "bulk"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            <span>Folder Scanner & Bulk Tester</span>
          </button>
          <button
            onClick={() => setActiveTab("single")}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "single"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>Single Connection Tester</span>
          </button>
          <button
            onClick={() => setActiveTab("results")}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "results"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Success Vault & Live Logs</span>
          </button>
        </div>

        {/* Tab 1: Folder Scan & Bulk Test */}
        {activeTab === "bulk" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Scanned Files Panel */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col h-[600px]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center space-x-1.5">
                    <span>Scanned Credentials Files</span>
                  </h3>
                  <p className="text-xs text-slate-500">Scan list of accounts stored on disk</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowCreateFile(true)}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Create Credentials File"
                  >
                    <FilePlus className="h-5 w-5" />
                  </button>
                  <button
                    onClick={fetchFiles}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Refresh Directory"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {files.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-xl">
                  <FolderOpen className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-sm font-semibold text-slate-700">No credential files found</p>
                  <p className="text-xs text-slate-500 max-w-xs mt-1">
                    Store text files with accounts in the folder <code className="text-slate-800 font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">{scanFolder}</code>.
                  </p>
                  <button
                    onClick={() => setShowCreateFile(true)}
                    className="mt-4 inline-flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Sample File</span>
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {files.map((file) => (
                    <div
                      key={file.name}
                      onClick={() => handleFileSelect(file.name)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex items-start justify-between ${
                        selectedFile === file.name
                          ? "bg-slate-900 text-white border-slate-900 shadow-md"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <FileText className={`h-5 w-5 mt-0.5 ${selectedFile === file.name ? 'text-indigo-400' : 'text-slate-400'}`} />
                        <div>
                          <p className={`text-sm font-semibold tracking-tight ${selectedFile === file.name ? 'text-white' : 'text-slate-800'}`}>
                            {file.name}
                          </p>
                          <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] mt-1 ${selectedFile === file.name ? 'text-slate-400' : 'text-slate-500'}`}>
                            <span>{(file.size / 1024).toFixed(1)} KB</span>
                            <span>•</span>
                            <span>{file.totalLines} lines</span>
                            <span>•</span>
                            <span className={`px-1.5 py-0.5 rounded font-bold ${
                              selectedFile === file.name 
                                ? 'bg-slate-800 text-indigo-300' 
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              {file.parsedCount} accounts
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(file.name);
                        }}
                        className={`p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
                          selectedFile === file.name 
                            ? 'hover:bg-slate-800 text-slate-300 hover:text-white' 
                            : 'hover:bg-slate-200 text-slate-500 hover:text-red-600'
                        }`}
                        title="Delete file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected File Details & Run Panel */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col h-[600px]">
              {selectedFile && filePreview ? (
                <div className="flex flex-col h-full">
                  
                  {/* Header info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-4 gap-3">
                    <div>
                      <h3 className="font-display font-bold text-base text-slate-900">
                        File: {selectedFile}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Parsed <span className="font-semibold text-slate-800">{filePreview.credentialsCount} valid IMAP credentials</span> from {filePreview.totalLines} total lines
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 bg-slate-50 border border-slate-200 p-1.5 rounded-lg">
                      <div className="flex items-center space-x-1">
                        <span className="text-xs font-semibold text-slate-600 pl-1">Threads:</span>
                        <select
                          value={concurrency}
                          onChange={(e) => setConcurrency(parseInt(e.target.value))}
                          disabled={bulkStatus?.active}
                          className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold focus:outline-none"
                        >
                          <option value="1">1</option>
                          <option value="3">3</option>
                          <option value="5">5</option>
                          <option value="10">10</option>
                          <option value="20">20</option>
                          <option value="30">30</option>
                          <option value="50">50</option>
                        </select>
                      </div>

                      <button
                        onClick={startBulkTest}
                        disabled={bulkStatus?.active || filePreview.credentialsCount === 0}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-colors ${
                          bulkStatus?.active
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                            : "bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                        }`}
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>RUN BULK TEST</span>
                      </button>
                    </div>
                  </div>

                  {/* Proxy settings block - HIGH VISIBILITY UPGRADE */}
                  <div className="mb-5 bg-gradient-to-r from-indigo-50 to-slate-50 border-2 border-indigo-200 p-4 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between pb-2.5 border-b border-indigo-100 mb-3">
                      <div className="flex items-center space-x-2">
                        <Lock className="h-4.5 w-4.5 text-indigo-600" />
                        <span className="text-xs font-extrabold text-indigo-900 tracking-wider uppercase">
                          🛡️ Proxy Rotation Layer (Highly Recommended)
                        </span>
                      </div>
                      <div>
                        {selectedProxyFile ? (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide border border-emerald-200">
                            Enabled & Rotating
                          </span>
                        ) : (
                          <span className="bg-slate-200 text-slate-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide border border-slate-300">
                            Direct connection
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 mb-3.5 leading-relaxed">
                      To prevent mail servers from rate-limiting, blocking, or throwing errors during high-concurrency testing, you can upload a file containing SOCKS5 or HTTP proxies formatted as <code className="bg-white px-1 py-0.5 rounded border border-indigo-100 text-indigo-600 font-mono text-[10px] font-semibold">ip:port:user:password</code> or <code className="bg-white px-1 py-0.5 rounded border border-indigo-100 text-indigo-600 font-mono text-[10px] font-semibold">ip:port</code>. Select that file below:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {/* Proxy File Selection */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">
                          Select Proxy List File:
                        </label>
                        <select
                          value={selectedProxyFile}
                          onChange={(e) => setSelectedProxyFile(e.target.value)}
                          disabled={bulkStatus?.active}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-sans font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer text-slate-800 disabled:opacity-60"
                        >
                          <option value="">🚫 None (Use Direct Connection - Slow/Risk of blocks)</option>
                          {files
                            .filter(f => f.name !== selectedFile)
                            .map(f => (
                              <option key={f.name} value={f.name}>
                                🔗 {f.name} ({f.totalLines} lines)
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Protocol Selection */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">
                          Proxy Protocol / Type:
                        </label>
                        <select
                          value={proxyType}
                          onChange={(e) => setProxyType(e.target.value as "socks5" | "http")}
                          disabled={!selectedProxyFile || bulkStatus?.active}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-sans font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="socks5">⚡ SOCKS5 (Highly Recommended)</option>
                          <option value="http">🌐 HTTP CONNECT</option>
                        </select>
                      </div>
                    </div>

                    {selectedProxyFile && (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-indigo-500" />
                            <span>Parsed Proxies & Validation Status</span>
                          </h5>
                          <button
                            type="button"
                            onClick={() => loadParsedProxies(selectedProxyFile, proxyType)}
                            disabled={parsingProxies}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 font-bold uppercase tracking-wider focus:outline-none transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${parsingProxies ? 'animate-spin' : ''}`} />
                            <span>Re-scan</span>
                          </button>
                        </div>

                        {parsingProxies ? (
                          <div className="flex items-center justify-center py-6 space-x-2 text-indigo-600 bg-white border border-slate-200 rounded-lg">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span className="text-xs font-semibold">Parsing proxy file entries...</span>
                          </div>
                        ) : proxyParseError ? (
                          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                            <span>{proxyParseError}</span>
                          </div>
                        ) : parsedProxies.length === 0 ? (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-xs flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span>The selected file contains no proxies. Please format it as ip:port or ip:port:user:pass.</span>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* Proxy file metrics summary badges */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-white border border-slate-200 px-2.5 py-2 rounded-lg">
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Lines</p>
                                <p className="text-sm font-extrabold text-slate-800 font-mono mt-0.5">{parsedProxies.length}</p>
                              </div>
                              <div className="bg-emerald-50 border border-emerald-100 px-2.5 py-2 rounded-lg">
                                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Valid Structure</p>
                                <p className="text-sm font-extrabold text-emerald-700 font-mono mt-0.5">
                                  {parsedProxies.filter(p => p.type === "proxy" && p.valid).length}
                                </p>
                              </div>
                              <div className="bg-red-50 border border-red-100 px-2.5 py-2 rounded-lg">
                                <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider">Invalid Structure</p>
                                <p className="text-sm font-extrabold text-red-700 font-mono mt-0.5">
                                  {parsedProxies.filter(p => p.type === "proxy" && !p.valid).length}
                                </p>
                              </div>
                            </div>

                            {/* Filters, Search & Settings */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-100 p-2 rounded-lg border border-slate-200">
                              <div className="flex bg-slate-200/80 p-0.5 rounded-md border border-slate-300">
                                <button
                                  type="button"
                                  onClick={() => setProxyFilter("all")}
                                  className={`px-2 py-1 text-[9px] font-extrabold rounded uppercase tracking-wider transition-all ${
                                    proxyFilter === "all"
                                      ? "bg-white text-indigo-950 shadow-xs"
                                      : "text-slate-500 hover:text-slate-800"
                                  }`}
                                >
                                  All ({parsedProxies.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setProxyFilter("valid")}
                                  className={`px-2 py-1 text-[9px] font-extrabold rounded uppercase tracking-wider transition-all ${
                                    proxyFilter === "valid"
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "text-slate-500 hover:text-slate-800"
                                  }`}
                                >
                                  Valid ({parsedProxies.filter(p => p.type === "proxy" && p.valid).length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setProxyFilter("invalid")}
                                  className={`px-2 py-1 text-[9px] font-extrabold rounded uppercase tracking-wider transition-all ${
                                    proxyFilter === "invalid"
                                      ? "bg-red-600 text-white shadow-xs"
                                      : "text-slate-500 hover:text-slate-800"
                                  }`}
                                >
                                  Invalid ({parsedProxies.filter(p => p.type === "proxy" && !p.valid).length})
                                </button>
                              </div>

                              <div className="relative w-full sm:max-w-48">
                                <input
                                  type="text"
                                  placeholder="Search IP, Port, Username..."
                                  value={proxySearch}
                                  onChange={(e) => setProxySearch(e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 pl-7 font-sans font-medium"
                                />
                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                              </div>
                            </div>

                            {/* Proxy list scroll window */}
                            <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-850 shadow-inner">
                              <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/80 font-mono text-[10px]">
                                {getFilteredProxies().length === 0 ? (
                                  <div className="text-slate-500 p-4 text-center font-sans">
                                    No lines match your search filter criteria.
                                  </div>
                                ) : (
                                  getFilteredProxies().map((p) => (
                                    <div 
                                      key={p.lineNum} 
                                      className={`p-2 flex items-start justify-between gap-2.5 transition-colors ${
                                        !p.valid ? 'bg-red-950/15 hover:bg-red-950/25' : 'hover:bg-slate-800/40'
                                      }`}
                                    >
                                      <div className="flex items-start space-x-2 w-full min-w-0">
                                        <span className="text-slate-500 font-bold w-6 text-right select-none flex-shrink-0 mt-0.5">
                                          {p.lineNum}
                                        </span>
                                        
                                        {p.type === "empty" ? (
                                          <span className="text-slate-600 italic select-none">Empty line (ignored)</span>
                                        ) : p.type === "comment" ? (
                                          <span className="text-emerald-500/80 italic truncate select-none">
                                            {p.raw}
                                          </span>
                                        ) : p.valid ? (
                                          <div className="flex flex-col min-w-0">
                                            <div className="text-slate-200 flex flex-wrap items-center gap-x-1 gap-y-0.5 font-medium break-all">
                                              <span className="text-slate-400 font-bold">Host:</span>
                                              <span className="font-semibold text-indigo-300">{p.parsed.host}</span>
                                              <span className="text-slate-600">|</span>
                                              <span className="text-slate-400 font-bold">Port:</span>
                                              <span className="text-emerald-400 font-bold">{p.parsed.port}</span>
                                              {p.parsed.user && (
                                                <>
                                                  <span className="text-slate-600">|</span>
                                                  <span className="text-slate-400 font-bold">User:</span>
                                                  <span className="text-slate-300 font-semibold">{p.parsed.user}</span>
                                                  <span className="text-slate-600">|</span>
                                                  <span className="text-slate-400 font-bold">Pass:</span>
                                                  <span className="text-amber-400 font-semibold">{p.parsed.pass}</span>
                                                </>
                                              )}
                                            </div>
                                            <span className="text-[9px] text-slate-500 mt-0.5 break-all">
                                              Raw: {p.raw}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col w-full min-w-0">
                                            <span className="text-red-400 font-bold break-all line-through opacity-85">
                                              {p.raw}
                                            </span>
                                            <span className="text-[10px] text-red-300 font-sans mt-0.5 font-semibold flex items-center gap-1">
                                              ⚠️ Error: {p.error}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Validity indicator */}
                                      <div className="flex-shrink-0 self-center">
                                        {p.type === "proxy" ? (
                                          p.valid ? (
                                            <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider border border-emerald-500/20">
                                              Valid SOCKS/HTTP
                                            </span>
                                          ) : (
                                            <span className="bg-red-500/10 text-red-400 text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider border border-red-500/20 animate-pulse">
                                              Invalid Format
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-slate-600 text-[8px] px-1.5 py-0.5 uppercase font-bold tracking-wider">
                                            Skip
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* Success badge message */}
                            {parsedProxies.some(p => p.type === "proxy" && p.valid) && (
                              <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg text-[11px] text-emerald-800 flex items-start gap-2">
                                <span className="font-extrabold text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase mt-0.5 select-none">
                                  GUARANTEE
                                </span>
                                <span>
                                  Automatic proxy validation confirmed. The bulk connection engine will rotate through your <strong className="font-extrabold">{parsedProxies.filter(p => p.type === "proxy" && p.valid).length} valid</strong> proxy addresses to execute bulk checks safely.
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Configured Bulk progress logs if active or just finished */}
                  {bulkStatus && (bulkStatus.active || (bulkStatus.fileName === selectedFile && bulkStatus.startTime)) && (
                    <div className="mb-4 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                        <span className="flex items-center space-x-1.5">
                          <span className={`h-2 w-2 rounded-full ${bulkStatus.active ? 'bg-indigo-500 animate-pulse' : 'bg-slate-400'}`}></span>
                          <span>BULK TASK METRICS</span>
                        </span>
                        <span className="font-mono">
                          {bulkStatus.checked} / {bulkStatus.total} tested
                        </span>
                      </div>
                      <div className={`grid ${bulkStatus.usingProxies ? 'grid-cols-4' : 'grid-cols-3'} gap-3 text-center mb-3`}>
                        <div className="bg-white border border-slate-100 p-2 rounded-lg">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Successful</p>
                          <p className="text-base font-bold text-emerald-600">{bulkStatus.successCount}</p>
                        </div>
                        <div className="bg-white border border-slate-100 p-2 rounded-lg">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Failed</p>
                          <p className="text-base font-bold text-red-500">{bulkStatus.failureCount}</p>
                        </div>
                        <div className="bg-white border border-slate-100 p-2 rounded-lg">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Concurrency</p>
                          <p className="text-base font-bold font-mono text-slate-800">{bulkStatus.concurrency} Th</p>
                        </div>
                        {bulkStatus.usingProxies && (
                          <div className="bg-indigo-50 border border-indigo-100 p-2 rounded-lg">
                            <p className="text-[10px] text-indigo-500 font-bold uppercase">Proxies</p>
                            <p className="text-base font-bold font-mono text-indigo-700">{bulkStatus.proxyCount} Px</p>
                          </div>
                        )}
                      </div>
                      {bulkStatus.logs.length > 0 && (
                        <div className="bg-slate-900 rounded-lg p-2.5 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1">
                          {bulkStatus.logs.slice(0, 10).map((l, i) => (
                            <p key={i} className={l.includes("SUCCESS") ? "text-emerald-400" : l.includes("FAILED") ? "text-red-400" : "text-slate-300"}>
                              {l}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Parsed List Preview Table */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                      Scan Preview (First 100 entries)
                    </p>
                    <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
                      <table className="min-w-full divide-y divide-slate-200 text-left">
                        <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider sticky top-0 font-semibold">
                          <tr>
                            <th className="px-3 py-2.5">Line</th>
                            <th className="px-3 py-2.5">User</th>
                            <th className="px-3 py-2.5">Server Host</th>
                            <th className="px-3 py-2.5">Port</th>
                            <th className="px-3 py-2.5">Secure</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-mono">
                          {filePreview.preview.map((cred, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/70">
                              <td className="px-3 py-2 text-slate-400">{cred.lineNum}</td>
                              <td className="px-3 py-2 text-slate-800 font-sans font-semibold break-all">{cred.user}</td>
                              <td className="px-3 py-2 text-slate-600 break-all">{cred.host}</td>
                              <td className="px-3 py-2 text-slate-600">{cred.port}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-sans font-semibold ${
                                  cred.secure ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {cred.secure ? 'SSL/TLS' : 'PLAIN'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="bg-slate-100 p-4 rounded-full mb-3 text-slate-400">
                    <Sliders className="h-8 w-8" />
                  </div>
                  <h4 className="font-semibold text-slate-700 text-sm">No File Selected</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Select a credential file from the left sidebar scanner. The app will parse its lines and prepare them for bulk connection testing.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 2: Single Connection Tester */}
        {activeTab === "single" && (
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-1 gap-6">
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-200">
              <div className="pb-4 border-b border-slate-100 mb-6">
                <h3 className="font-display font-bold text-base text-slate-900">
                  Instant IMAP Server Check
                </h3>
                <p className="text-xs text-slate-500">
                  Quickly test a single mailbox connection configuration without saving to files.
                </p>
              </div>

              <form onSubmit={testSingleConnection} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
                      IMAP Server Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Server className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={singleHost}
                        onChange={(e) => setSingleHost(e.target.value)}
                        placeholder="e.g. imap.gmail.com"
                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
                      Port Number
                    </label>
                    <input
                      type="number"
                      value={singlePort}
                      onChange={(e) => {
                        const port = e.target.value;
                        setSinglePort(port);
                        setSingleSecure(port === "993" || port === "465");
                      }}
                      placeholder="e.g. 993"
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
                      Email/Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={singleUser}
                        onChange={(e) => setSingleUser(e.target.value)}
                        placeholder="e.g. delta@gmail.com"
                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
                      Password/App Secret
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="password"
                        value={singlePass}
                        onChange={(e) => setSinglePass(e.target.value)}
                        placeholder="•••••••••••••••"
                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                  <div className="flex flex-col sm:flex-row sm:space-x-6 space-y-2 sm:space-y-0">
                    <label className="inline-flex items-center space-x-2.5 text-xs text-slate-700 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={singleSecure}
                        onChange={(e) => setSingleSecure(e.target.checked)}
                        className="h-4 w-4 border-slate-300 rounded text-slate-900 focus:ring-slate-900"
                      />
                      <span>SSL/TLS Encryption Secure Connection</span>
                    </label>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 font-semibold uppercase">Timeout:</span>
                      <select
                        value={singleTimeout}
                        onChange={(e) => setSingleTimeout(e.target.value)}
                        className="bg-slate-50 border border-slate-300 text-xs rounded px-2 py-1 font-mono focus:outline-none"
                      >
                        <option value="5000">5 seconds</option>
                        <option value="10000">10 seconds</option>
                        <option value="15000">15 seconds</option>
                        <option value="30000">30 seconds</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={singleTesting}
                    className={`w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-5 rounded-lg text-sm tracking-wide transition-all shadow-xs cursor-pointer flex items-center justify-center space-x-2 ${
                      singleTesting ? "opacity-75 cursor-wait" : ""
                    }`}
                  >
                    {singleTesting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Testing Link...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Individual connection verification outcome */}
              {singleResult && (
                <div className={`mt-6 p-4 rounded-xl border flex items-start space-x-3.5 ${
                  singleResult.success 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {singleResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <h5 className="font-bold text-sm tracking-wide">
                      {singleResult.success ? "VERIFICATION SUCCESSFUL" : "CONNECTION ATTEMPT FAILED"}
                    </h5>
                    <p className="text-xs font-mono mt-1 break-all bg-white/40 px-2 py-1 rounded border border-black/5">
                      {singleResult.message}
                    </p>
                    {singleResult.success && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
                        This credential was verified and appended to successful_imap.txt file.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Success Vault & Live Logs */}
        {activeTab === "results" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Validated Credentials Vault */}
            <div className="lg:col-span-6 bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col h-[650px]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>Verified Mailboxes ({successes.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500">Successful active connections</p>
                </div>

                {successes.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={copyAllSuccesses}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Copy All Credentials"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href="/api/download-successes"
                      download="successful_imap.txt"
                      className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Download text list"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={clearSuccesses}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Clear Vault file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {successes.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full mb-3">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h4 className="font-semibold text-slate-700 text-sm">Vault is Empty</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    No verified accounts yet. Connect your lists or test single parameters. Successful connection credentials will accumulate here.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {successes.map((item, index) => (
                    <div key={item.id} className="p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                      <div className="font-mono flex-1 min-w-0">
                        <p className="font-sans font-semibold text-slate-800 break-all select-all">{item.user}</p>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-0.5">
                          <span>{item.host}:{item.port}</span>
                          <span>•</span>
                          <span className="font-bold bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-700">pass: {item.pass}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => copyToClipboard(item.rawLine, index)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          copiedIndex === index 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-white text-slate-500 hover:text-slate-800 border-slate-200"
                        }`}
                        title="Copy raw connection line"
                      >
                        {copiedIndex === index ? (
                          <span className="text-[10px] font-semibold px-0.5 font-sans">Copied!</span>
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connection Attempt logs */}
            <div className="lg:col-span-6 bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col h-[650px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-4 gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center space-x-2">
                    <Terminal className="h-5 w-5 text-indigo-500" />
                    <span>Connection Logs</span>
                  </h3>
                  <p className="text-xs text-slate-500">History of validation attempts</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={clearLogs}
                    className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Clear Logs
                  </button>
                  <button
                    onClick={fetchLogs}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Logs Filter bar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-4">
                <div className="sm:col-span-7 relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs..."
                    className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div className="sm:col-span-5">
                  <select
                    value={logStatusFilter}
                    onChange={(e: any) => setLogStatusFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 px-2 text-xs focus:outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="success">Successful Only</option>
                    <option value="failed">Failed Only</option>
                  </select>
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <Terminal className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No logs found</p>
                  <p className="text-[11px] text-slate-500">Wait for connections or relax filters</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px] pr-1">
                  {filteredLogs.map((log) => (
                    <div key={log.id} className="p-2.5 rounded-lg bg-slate-900 text-slate-100 border border-slate-800">
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                        <span className="text-[9px] text-slate-500 font-sans">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[9px] text-slate-400 select-all font-sans">
                            File: {log.sourceFile}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded-[4px] text-[8px] font-sans font-bold uppercase tracking-wider ${
                            log.status === "success" 
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-900" 
                              : log.status === "testing" 
                              ? "bg-blue-950 text-blue-400 border border-blue-900 animate-pulse" 
                              : "bg-red-950 text-red-400 border border-red-900"
                          }`}>
                            {log.status}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-slate-200 break-all">
                        <span className="text-indigo-400">{log.user}</span>
                        <span className="text-slate-500">@</span>
                        <span className="text-slate-400">{log.host}:{log.port}</span>
                      </div>
                      <div className={`mt-1 text-[10px] break-all ${
                        log.status === "success" ? "text-emerald-300" : "text-slate-400"
                      }`}>
                        ➔ {log.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Footer Banner */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <p>© 2026 Delta Marketing Solution SARL AU. All Rights Reserved.</p>
          <div className="flex space-x-4 mt-2 sm:mt-0 font-medium">
            <span>Server-side verification</span>
            <span>•</span>
            <span>SSL/TLS Strict Mode bypass</span>
            <span>•</span>
            <span>Multithreaded parser engine</span>
          </div>
        </div>
      </footer>

      {/* File Editor / Creator Dialog */}
      {showCreateFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-900">
                Create New Mailbox Credentials List File
              </h3>
              <button 
                onClick={() => setShowCreateFile(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-md cursor-pointer"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  File Name
                </label>
                <div className="flex rounded-md shadow-xs">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="e.g. leads_imap, company_accounts"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-l-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                    .txt
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Paste Account Credentials Lines (One per line)
                </label>
                <textarea
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  rows={8}
                  placeholder="email@address.com:password&#10;anothermail@address.com:password_with_colons:etc"
                  className="block w-full p-3 border border-slate-300 rounded-lg text-xs bg-slate-50 font-mono focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-900"
                ></textarea>
                <p className="text-[10px] text-slate-400 mt-1">
                  Supported formats: Primary: <code className="bg-slate-100 p-0.5 rounded text-slate-600">email@domain.com:password</code> (IMAP settings auto-resolved). Also supports explicit fallback formats: <code className="bg-slate-100 p-0.5 rounded text-slate-600">host:port:user:pass</code>.
                </p>
              </div>

              {createFileError && (
                <div className="text-xs text-red-600 font-semibold bg-red-50 p-2 rounded-lg">
                  {createFileError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateFile(false)}
                className="bg-slate-200 text-slate-800 hover:bg-slate-300 font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createCredentialFile}
                className="bg-slate-900 text-white hover:bg-slate-800 font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer transition-colors"
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
