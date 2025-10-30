/**
 * AI Chat Agent - Durable Object
 * Provides conversational AI with persistent memory using SQL
 */

interface Env {
  AI: Ai;
  CHAT_AGENT: DurableObjectNamespace;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export class ChatAgent {
  private state: DurableObjectState;
  private env: Env;
  private messages: Message[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Initialize SQL database on first run
    await this.initializeDatabase();

    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handlers
    if (url.pathname === "/chat" && request.method === "POST") {
      return this.handleChat(request, corsHeaders);
    }

    if (url.pathname === "/history" && request.method === "GET") {
      return this.handleGetHistory(corsHeaders);
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      return this.handleClear(corsHeaders);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  private async initializeDatabase() {
    // Create messages table for persistent chat history
    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Load existing messages
    const results = await this.state.storage.sql.exec(`
      SELECT role, content, timestamp FROM messages ORDER BY timestamp ASC
    `);

    this.messages = results.toArray().map((row: any) => ({
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
    }));
  }

  private async handleChat(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
    try {
      const { message } = await request.json() as { message: string };

      // Save user message
      const userMessage: Message = {
        role: "user",
        content: message,
        timestamp: Date.now(),
      };
      await this.saveMessage(userMessage);

      // Generate AI response using Workers AI
      const aiResponse = await this.generateAIResponse(message);

      // Save assistant message
      const assistantMessage: Message = {
        role: "assistant",
        content: aiResponse,
        timestamp: Date.now(),
      };
      await this.saveMessage(assistantMessage);

      return new Response(
        JSON.stringify({
          success: true,
          userMessage,
          assistantMessage,
          messageCount: this.messages.length,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  }

  private async generateAIResponse(userMessage: string): Promise<string> {
    try {
      // Build conversation context with recent messages
      const recentMessages = this.messages.slice(-10);
      const messages = [
        {
          role: "system",
          content: "You are a helpful AI assistant embedded in a blog. Help users with questions about the blog content, technology, or general topics. Be friendly and concise.",
        },
        ...recentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        {
          role: "user",
          content: userMessage,
        },
      ];

      // Call Workers AI with Llama 3.3
      const response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages,
        max_tokens: 512,
        temperature: 0.7,
      });

      // Handle response
      if (typeof response === "string") {
        return response;
      }
      return (response as any).response || "I apologize, but I couldn't generate a response.";
    } catch (error) {
      console.error("AI generation error:", error);
      return "I'm having trouble connecting to the AI service. Please try again.";
    }
  }

  private async saveMessage(message: Message): Promise<void> {
    // Add to in-memory array
    this.messages.push(message);

    // Persist to SQL
    await this.state.storage.sql.exec(
      `INSERT INTO messages (role, content, timestamp) VALUES (?, ?, ?)`,
      message.role,
      message.content,
      message.timestamp
    );
  }

  private async handleGetHistory(corsHeaders: Record<string, string>): Promise<Response> {
    return new Response(
      JSON.stringify({
        success: true,
        messages: this.messages,
        count: this.messages.length,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  private async handleClear(corsHeaders: Record<string, string>): Promise<Response> {
    // Clear SQL
    await this.state.storage.sql.exec(`DELETE FROM messages`);
    
    // Clear in-memory
    this.messages = [];

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
}
