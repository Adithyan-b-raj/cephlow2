
import { supabaseAdmin } from "@workspace/supabase";
import { processSendEmail } from "./processors/sendEmail.js";
import { processSendWhatsApp } from "./processors/sendWhatsApp.js";
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "10", 10);
const POLL_INTERVAL = 2000; // poll every 2 seconds

let isShuttingDown = false;

async function executeTask(task: any) {
  try {
    if (task.type === "send_email") {
      await processSendEmail(task.payload);
    } else if (task.type === "send_whatsapp") {
      await processSendWhatsApp(task.payload);
    }

    // Success -> Mark completed
    await supabaseAdmin
      .from("tasks")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", task.id);
      
    console.log(`[Task ${task.id}] ${task.type} completed successfully`);
  } catch (error: any) {
    console.error(`[Task ${task.id}] ${task.type} failed:`, error.message);
    
    // Failure -> Mark failed (or increment attempts if you want to implement retries)
    await supabaseAdmin
      .from("tasks")
      .update({ 
        status: "failed", 
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq("id", task.id);
  }
}

async function pollTasks() {
  if (isShuttingDown) return;

  try {
    const { data: tasks, error } = await supabaseAdmin.rpc("grab_pending_tasks", {
      p_limit: CONCURRENCY,
    });

    if (error) {
      console.error("[Worker] Error grabbing tasks:", error.message);
    } else if (tasks && tasks.length > 0) {
      // Execute all grabbed tasks concurrently
      await Promise.all(tasks.map((task: any) => executeTask(task)));
    }
  } catch (err: any) {
    console.error("[Worker] Polling exception:", err.message);
  }

  // Schedule next poll. If we grabbed tasks, poll immediately again, otherwise wait
  setTimeout(pollTasks, POLL_INTERVAL);
}

console.log(`🚀 Supabase Tasks Worker started (concurrency=${CONCURRENCY})`);
pollTasks();

async function shutdown() {
  console.log("Shutting down worker gracefully...");
  isShuttingDown = true;
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
