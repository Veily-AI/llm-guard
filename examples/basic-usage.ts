/**
 * Basic usage example for @veily/llm-guard
 *
 * This example shows how to protect prompts with PII using the one-liner wrap()
 */

import { wrap, createSession, anonymize, getMetrics } from "@veily/llm-guard";
import type { GuardConfig, AnonymizeOptions } from "@veily/llm-guard";

// Configuration
// IMPORTANT: Set VEILY_CORE_URL environment variable before running
// export VEILY_CORE_URL="https://u3wmtdzmxm.us-east-1.awsapprunner.com"
const config: GuardConfig = {
  apiKey: "your-api-key-here", // Replace with your actual API key
  timeoutMs: 2000,
};

// LLM simulator (replace with your real LLM)
async function myLLM(prompt: string): Promise<string> {
  // Simulates call to OpenAI, Anthropic, etc.
  console.log("  [LLM receives]:", prompt);
  return `LLM response based on: "${prompt}"`;
}

// ============================================================================
// Example 1: One-liner with wrap()
// ============================================================================

async function example1_oneLiner() {
  console.log("\n=== Example 1: One-Liner ===\n");

  const prompt = "My email is juan.perez@example.com and my phone is +56912345678";

  const result = await wrap(prompt, myLLM, config);

  console.log("Original prompt:", prompt);
  console.log("Final result:", result);
  console.log("✅ PII automatically restored");
}

// ============================================================================
// Example 2: Manual control with anonymize() and restore()
// ============================================================================

async function example2_manual() {
  console.log("\n=== Example 2: Manual Control ===\n");

  const prompt = "Name: María González, ID: 12.345.678-9";

  // Step 1: Anonymize
  const { safePrompt, restore, stats } = await anonymize(prompt, config);

  console.log("Original prompt:", prompt);
  console.log("Safe prompt:", safePrompt);
  console.log("Stats:", stats);

  // Step 2: Call the LLM with the safePrompt
  const llmOutput = await myLLM(safePrompt);

  // Step 3: Restore (de-anonymize)
  const finalOutput = await restore(llmOutput);

  console.log("Final output:", finalOutput);
  console.log("✅ Full control of the flow");
}

// ============================================================================
// Example 3: Session API for multiple calls
// ============================================================================

async function example3_session() {
  console.log("\n=== Example 3: Session API ===\n");

  const session = createSession(config);

  const prompts = [
    "User: admin@veily.com",
    "Client: Carlos Rodríguez, Tel: +56987654321",
    "Text without PII",
  ];

  for (const prompt of prompts) {
    console.log(`\nProcessing: "${prompt}"`);

    const result = await session.protect(prompt, myLLM);

    console.log("Result:", result);
  }

  console.log("\n✅ Same config reused");
}

// ============================================================================
// Example 4: Error handling
// ============================================================================

async function example4_errorHandling() {
  console.log("\n=== Example 4: Error Handling ===\n");

  try {
    // Try with invalid config
    await wrap("test", myLLM, {} as GuardConfig);
  } catch (error) {
    if (error instanceof Error) {
      console.log("❌ Error caught:", error.message);
    }
  }

  try {
    // Try with invalid prompt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wrap(123 as any, myLLM, config);
  } catch (error) {
    if (error instanceof Error) {
      console.log("❌ Error caught:", error.message);
    }
  }

  console.log("\n✅ Errors handled correctly");
}

// ============================================================================
// Example 5: TTL (Time-To-Live) support
// ============================================================================

async function example5_ttl() {
  console.log("\n=== Example 5: TTL Support ===\n");

  const prompt = "My email is maria@company.com";

  // Default TTL: 3600 seconds (1 hour)
  const result1 = await wrap(prompt, myLLM, config);
  console.log("Result with default TTL:", result1);

  // Custom TTL: 7200 seconds (2 hours)
  const options: AnonymizeOptions = { ttl: 7200 };
  const result2 = await wrap(prompt, myLLM, config, options);
  console.log("Result with 2h TTL:", result2);

  // Manual control with TTL
  const { safePrompt, restore } = await anonymize(prompt, config, { ttl: 3600 });
  const llmOutput = await myLLM(safePrompt);
  const final = await restore(llmOutput);
  console.log("Manual with TTL:", final);

  console.log("\n✅ TTL configured successfully");
}

// ============================================================================
// Example 6: Metrics tracking
// ============================================================================

async function example6_metrics() {
  console.log("\n=== Example 6: Metrics API ===\n");

  try {
    const metrics = await getMetrics(config);

    console.log("Usage Metrics:");
    console.log("  Total cycles:", metrics.totalCycles);
    console.log("  Successful deliveries:", metrics.successfulDeliveries);
    console.log("  Completed cycles:", metrics.completedCycles);
    console.log("  Total PII replaced:", metrics.totalPiiReplaced);
    console.log("  PII types detected:", metrics.piiTypes?.join(", "));

    console.log("\n✅ Metrics fetched successfully");
  } catch (error) {
    console.log("⚠️  Metrics require valid API key and connection to core");
  }
}

// ============================================================================
// Example 7: Environment variable configuration
// ============================================================================

async function example7_envVars() {
  console.log("\n=== Example 7: Environment Variables ===\n");

  // The core URL comes from VEILY_CORE_URL environment variable
  // This is transparent to end users - they never see the infrastructure
  const minimalConfig: GuardConfig = {
    apiKey: "your-api-key-here",
  };

  try {
    const result = await wrap("Test prompt with email@test.com", myLLM, minimalConfig);
    console.log("Result:", result);
    console.log("✅ Core URL loaded from VEILY_CORE_URL environment variable");
  } catch (error) {
    if (error instanceof Error) {
      console.log("⚠️  Make sure VEILY_CORE_URL is set:", error.message);
    }
  }
}

// ============================================================================
// Example 8: With real OpenAI (requires OPENAI_API_KEY)
// ============================================================================

async function example8_realOpenAI() {
  console.log("\n=== Example 8: Real OpenAI ===\n");

  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  Skipped: Set OPENAI_API_KEY to run this example");
    return;
  }

  // Note: Uncomment if you have OpenAI installed
  /*
  import OpenAI from 'openai';
  
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const result = await wrap(
    "My email is contact@company.com, can you help me?",
    async (safePrompt) => {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: safePrompt }]
      });
      return completion.choices[0].message.content || "";
    },
    config
  );
  
  console.log("OpenAI response:", result);
  console.log("✅ OpenAI never saw the real email");
  */

  console.log("📝 Uncomment the code to test with OpenAI");
}

// ============================================================================
// Run all examples
// ============================================================================

async function main() {
  console.log("🛡️  @veily/llm-guard - Usage Examples\n");
  console.log("======================================");

  try {
    await example1_oneLiner();
    await example2_manual();
    await example3_session();
    await example4_errorHandling();
    await example5_ttl();
    await example6_metrics();
    await example7_envVars();
    await example8_realOpenAI();

    console.log("\n======================================");
    console.log("✅ All examples completed");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
