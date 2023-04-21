import schedule from "node-schedule";
import { koanbot } from "./koanbot";

/***
 * Scheduler handler for bot to be used with PM2
 *
 * Set to run every 10 seconds
 */
schedule.scheduleJob("*/10 * * * * *", async function () {
  try {
    await koanbot();
  } catch (error) {
    console.log(`Error running Koanbot. Error: ${error}.\n\nTrying again in 10s.`)
  }
});
