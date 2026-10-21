import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WebXR only runs on secure pages: a headset on the network needs HTTPS. Set PLAYGROUND_TLS_CERT and
// PLAYGROUND_TLS_KEY to PEM files (for example from `tailscale cert`) to serve the playground over HTTPS.
const cert = process.env.PLAYGROUND_TLS_CERT, key = process.env.PLAYGROUND_TLS_KEY;
const https = cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;

export default defineConfig({ plugins: [react()], server: { https }, preview: { https } });
