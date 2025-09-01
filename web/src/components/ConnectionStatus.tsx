import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X as XIcon, RefreshCw } from 'lucide-react';

const ConnectionStatus = React.memo(function ConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
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
        setStatus(response.ok ? 'connected' : 'disconnected');
      } catch (error) {
        console.error('Connection check failed:', error);
        setStatus('disconnected');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  if (status === 'connected' && !showDetails) {
    return null; // Don't show anything when connected normally
  }

  const statusColor = status === 'connected' ? 'text-success' :
                     status === 'disconnected' ? 'text-destructive' :
                     'text-warning';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant="overlay"
        size="sm"
        onClick={() => setShowDetails(!showDetails)}
        className={cn('flex items-center gap-2', statusColor)}
        aria-expanded={showDetails}
        aria-controls="connection-details"
      >
        {status === 'connected' && <Check className="w-4 h-4" />}
        {status === 'disconnected' && <XIcon className="w-4 h-4" />}
        {status === 'checking' && <RefreshCw className="w-4 h-4 animate-spin" />}
        <span className="text-sm">
          {status === 'checking' ? 'Checking...' : 
           status === 'connected' ? 'Connected' : 
           'Disconnected'}
        </span>
      </Button>
      
      {showDetails && (
        <div id="connection-details" className="absolute bottom-full right-0 mb-2 bg-popover rounded-lg p-4 shadow-xl border border-border w-80 text-popover-foreground">
          <h3 className="font-semibold mb-2">Connection Details</h3>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Status: <span className={statusColor}>{status}</span></p>
            <p>API URL: <code className="text-xs bg-card px-1 rounded text-card-foreground border border-border/50">{API_BASE_URL}</code></p>
            <p>Device: {isMobile ? 'Mobile' : 'Desktop'}</p>
            <p>Host: {window.location.hostname}</p>
            
            {status === 'disconnected' && isMobile && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-warning font-semibold mb-1">Troubleshooting:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ensure server is running on port 8787</li>
                  <li>Connect to the same WiFi network</li>
                  <li>Access via correct IP address</li>
                  <li>Try: <code className="text-xs bg-card px-1 rounded text-card-foreground border border-border/50">http://[SERVER-IP]:5174</code></li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default ConnectionStatus;
