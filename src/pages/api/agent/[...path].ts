/**
 * API endpoint for AI chat agent
 * Handles all /api/agent/* requests and forwards to Durable Object
 */

import type { APIRoute } from 'astro';

export const ALL: APIRoute = async ({ request, params, locals }) => {
  const runtime = locals.runtime as {
    env: {
      CHAT_AGENT: DurableObjectNamespace;
    };
  };

  // Get or create agent instance
  const id = runtime.env.CHAT_AGENT.idFromName("default-agent");
  const agent = runtime.env.CHAT_AGENT.get(id);

  // Forward request to Durable Object
  const path = params.path || '';
  const url = new URL(request.url);
  const agentUrl = new URL(`https://agent/${path}`);
  agentUrl.search = url.search;

  const agentRequest = new Request(agentUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return agent.fetch(agentRequest);
};

export const prerender = false;
