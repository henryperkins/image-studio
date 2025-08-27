import { API_BASE_URL } from './api';

export interface ProcessedError {
  message: string;
  isRateLimit: boolean;
  isNetworkError: boolean;
  detailedMessage: string;
}

export function processApiError(error: any): ProcessedError {
  const errorMsg = error.message || 'Operation failed';
  
  const isRateLimit = errorMsg.toLowerCase().includes('rate') || 
                      errorMsg.toLowerCase().includes('limit');
  
  const isNetworkError = errorMsg.toLowerCase().includes('network') || 
                         errorMsg.toLowerCase().includes('fetch') || 
                         errorMsg.toLowerCase().includes('failed') || 
                         errorMsg.toLowerCase().includes('timeout') ||
                         errorMsg.toLowerCase().includes('cannot reach');
  
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  let detailedMessage = errorMsg;
  
  if (isRateLimit) {
    detailedMessage = `${errorMsg}. Please wait a moment before retrying.`;
  } else if (isNetworkError) {
    if (isMobileDevice && window.location.hostname !== 'localhost') {
      const currentHost = window.location.hostname;
      detailedMessage = `Connection failed on mobile device.\n\nPlease check:\n1. ✓ Same WiFi network as server\n2. ✓ Server is running (port 8787)\n3. ✓ Correct IP address\n\nCurrent: ${currentHost}\nAPI URL: ${API_BASE_URL}\n\nTip: Ask server admin for the correct IP address.`;
    } else {
      detailedMessage = `Network error: ${errorMsg}. Check your connection and try again.`;
    }
  }
  
  return {
    message: errorMsg,
    isRateLimit,
    isNetworkError,
    detailedMessage
  };
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * initialDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}