/**
 * Middleware to export Durable Object
 */

import { ChatAgent } from './agent';
import { defineMiddleware } from 'astro:middleware';

// Export Durable Object for Workers runtime
export { ChatAgent };

// Middleware pass-through
export const onRequest = defineMiddleware(async (context, next) => {
  return next();
});
