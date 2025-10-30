// Worker wrapper to export both Astro app and Durable Object
import astroApp from './dist/_worker.js/index.js';
import { ChatAgent } from './src/agent.ts';

// Re-export the Astro app as default
export default astroApp;

// Export the Durable Object
export { ChatAgent };
