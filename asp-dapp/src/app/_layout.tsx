// providers order matters
import { Slot } from 'expo-router';
import { LogBox } from 'react-native';
const { getJsonRpcFullnodeUrl: getFullnodeUrl } = require('@mysten/sui/jsonRpc');

LogBox.ignoreLogs([
  '<< mutation',
  'User rejected the request',
  'TRPCClientError',
  'dApp.signTransactionBlock',
]);

// Keep require() for wallet libs so layout + index share one dapp-kit module instance.
// ESM import here + require() in index duplicates WalletContext and crashes production.
const { SuiClientProvider, WalletProvider } = require('@mysten/dapp-kit');
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const { Toaster, toast } = require('react-hot-toast');
require('@mysten/dapp-kit/dist/index.css');

// Slush wallet metadata CORS fails on localhost — suppress noisy toasts.
if (typeof window !== 'undefined' && !(window as any).__aspToastFilter) {
  (window as any).__aspToastFilter = true;
  const noisy = /metadata|TypeError|Failed to fetch|CORS|net::ERR|Error fetching/i;
  const origError = toast.error.bind(toast);
  toast.error = (message: any, opts?: any) => {
    const text = String(
      typeof message === 'string' ? message : message?.message || message?.error || ''
    );
    if (noisy.test(text)) return '';
    return origError(message, opts);
  };
}

const queryClient = new QueryClient();

// Prefer CORS-friendly public RPCs first — official fullnode blocks browser preflight from localhost.
const MAINNET_URLS = [
  'https://rpc-mainnet.suiscan.xyz',
  'https://mainnet.sui.rpcpool.com',
  'https://sui-mainnet-endpoint.blockvision.org',
  'https://fullnode.mainnet.sui.io:443',
];

const fallbackFetch = (urls: string[]) => async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let lastError: any;
  for (const url of urls) {
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        const clone = res.clone();
        try {
          const json = await clone.json();
          if (json && json.error) {
            const errorCode = json.error.code;
            // -32602 is Invalid Params, -32600 is Invalid Request, -32700 is Parse Error
            // These are user/client errors, not node issues, so we shouldn't failover.
            if (errorCode !== -32602 && errorCode !== -32600 && errorCode !== -32700) {
              throw new Error(`RPC Node Error from ${url}: ${json.error.message}`);
            }
          }
        } catch (e: any) {
          if (e instanceof Error && e.message.startsWith('RPC Node Error')) {
            lastError = e;
            continue;
          }
          lastError = e;
          continue;
        }
        return res;
      }
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
};

const networks = {
  mainnet: { url: MAINNET_URLS[0], fetch: fallbackFetch(MAINNET_URLS) },
};

export default function Layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider
          autoConnect={false}
          storageKey="asp-dapp:wallet-connection-info:v2"
          // Enables Slush web / mobile-friendly connect path in the modal.
          // Extension wins if installed; otherwise Slush web app is offered.
          slushWallet={{ name: 'Asp' }}
        >
          <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#F5F5F7', color: '#1D1D1F' }}>
            <style>{`
              @keyframes aspPulse {
                0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
                40% { opacity: 1; transform: translateY(-2px); }
              }
              button:disabled { opacity: 0.45; cursor: not-allowed !important; }
            `}</style>
            <Slot />
            <Toaster
              position="top-right"
              gutter={10}
              containerStyle={{
                top: 18,
                right: 18,
              }}
              toastOptions={{
                duration: 8000,
                style: {
                  background: '#FFFFFF',
                  color: '#1D1D1F',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                  fontSize: '13px',
                  padding: '10px 12px',
                  maxWidth: '320px',
                },
              }}
            />
          </div>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
