import schedule from "node-schedule";
import { koanbot } from "./koanbot.js";

/***
 * Scheduler handler for bot to be used with PM2
 *
 * Set to run every 10 seconds
 */
schedule.scheduleJob("*/10 * * * * *", async function () {
  await koanbot();
});