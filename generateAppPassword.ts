import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// @ts-ignore
import bsky, { BskyAgent } from "@atproto/api";
// @ts-ignore
const { BskyAgent } = bsky;

/***
 * Authenticates with Bluesky and returns agent
 *
 * @param username
 * @param password
 */
async function authenticateBsky(username: string, password: string): Promise<BskyAgent> {
    const agent = new BskyAgent({
        service: "https://bsky.social",
    });
    await agent.login({
        identifier: username,
        password: password,
    });

    return agent;
}

/***
 * Generates new App Password, tests if it works,
 * and returns it once it does.
 * @param agent
 * @param username
 * @param password
 */
async function generateAppPassword(agent: BskyAgent, username: string, password: string): Promise<string> {

    // We generate a randomized name for the app password in case
    // we need to generate again.
    const randomString = (n: number): string => Array.from({length: n}, () => String.fromCharCode(Math.floor(Math.random() * 26) + 97)).join('');
    const appPasswordName = randomString(5) + "_koanbot"
    try {
        const response = await agent.com.atproto.server.createAppPassword({did: agent.session.did, name: appPasswordName});

        if (response.success) {
            const appPassword = response.data.password;
            await agent.login({ identifier: username, password: appPassword });

            return appPassword;
        } else {
            throw new Error("Unable to create an app password.");
        }
    } catch (error: unknown) {
        console.error("Error creating app password:", error.message);
        return generateAppPassword(agent, username, password);
    }
}

/***
 * Updates the .env file with the new app password
 * @param appPassword
 */
async function updateEnvFile(appPassword: string): Promise<void> {
    const envPath = path.resolve(process.cwd(), ".env");
    const envContent = fs.readFileSync(envPath, "utf-8");

    const updatedContent = envContent.replace(/^ATPROTO_PASS=.+$/m, `ATPROTO_PASS=${appPassword}`);

    fs.writeFileSync(envPath, updatedContent);
}

export async function main(): Promise<void> {
    const username = process.env.ATPROTO_USER;
    const password = process.env.ATPROTO_PASS;
    const agent = await authenticateBsky(username, password);


    if (!username || !password) {
        console.error("Missing username or password in .env file.");
        return;
    }

    const appPassword = await generateAppPassword(agent, username, password);
    console.log(`Generated app password: ${appPassword}`);

    updateEnvFile(appPassword);
}

main()