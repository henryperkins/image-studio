import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api";

export default function ConnectionStatus() {
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [showDetails, setShowDetails] = useState(false);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_BASE_URL}/healthz`, {
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        setStatus(response.ok ? "connected" : "disconnected");
      } catch (error) {
        console.error("Connection check failed:", error);
        setStatus("disconnected");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  if (status === "connected" && !showDetails) {
    return null; // Don't show anything when connected normally
  }

  const statusColor = status === "connected" ? "text-green-500" : 
                     status === "disconnected" ? "text-red-500" : 
                     "text-yellow-500";

  const statusIcon = status === "connected" ? "✓" : 
                    status === "disconnected" ? "✗" : 
                    "⟳";

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`bg-neutral-800 rounded-lg px-3 py-2 shadow-lg border border-neutral-700 flex items-center gap-2 ${statusColor}`}
      >
        <span className="text-xl">{statusIcon}</span>
        <span className="text-sm">
          {status === "checking" ? "Checking..." : 
           status === "connected" ? "Connected" : 
           "Disconnected"}
        </span>
      </button>
      
      {showDetails && (
        <div className="absolute bottom-full right-0 mb-2 bg-neutral-800 rounded-lg p-4 shadow-xl border border-neutral-700 w-80">
          <h3 className="font-semibold mb-2">Connection Details</h3>
          <div className="space-y-1 text-sm text-neutral-400">
            <p>Status: <span className={statusColor}>{status}</span></p>
            <p>API URL: <code className="text-xs bg-neutral-900 px-1 rounded">{API_BASE_URL}</code></p>
            <p>Device: {isMobile ? "Mobile" : "Desktop"}</p>
            <p>Host: {window.location.hostname}</p>
            
            {status === "disconnected" && isMobile && (
              <div className="mt-3 pt-3 border-t border-neutral-700">
                <p className="text-yellow-500 font-semibold mb-1">Troubleshooting:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ensure server is running on port 8787</li>
                  <li>Connect to the same WiFi network</li>
                  <li>Access via correct IP address</li>
                  <li>Try: <code className="text-xs bg-neutral-900 px-1 rounded">http://[SERVER-IP]:5174</code></li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}