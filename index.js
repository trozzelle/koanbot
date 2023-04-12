import bsky from '@atproto/api';
const { BskyAgent } = bsky;
import oai from "openai";
const { Configuration, OpenAIApi } = oai;
import * as dotenv from 'dotenv';
import process from 'node:process';
dotenv.config();

// Log in to Bluesky
const agent = new BskyAgent({
    service: 'https://bsky.social',
    persistSession: (evt, sess) => {
        // store the session-data for reuse
        // [how to do this??]
    },
});
await agent.login({
    identifier: process.env.BSKY_LIMERICKBOT_USERNAME,
    password: process.env.BSKY_LIMERICKBOT_PASSWORD,
});

// Log in to OpenAI
const configuration = new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Get a list of bsky notifs
const response_notifs = await agent.listNotifications();
const notifs = response_notifs.data.notifications;

// Mark all these notifs as read
agent.updateSeenNotifications();

// Count the number of notifications which are unread
// and which are also mentions
const unread_mentions = notifs.filter((notif) => {
    return notif.reason === "mention" && notif.isRead === false;
});
console.log(`Found ${unread_mentions.length} new mentions.`)

// Check for mentions and respond
unread_mentions.forEach(async (notif) => {
    // Right now the bot does not reply to top-level posts.
    if ("reply" in notif.record) {
        if ("parent" in notif.record.reply) {
            const post_params = notif.record.reply.parent; // the post to turn into a limerick
            const post = await agent.getPostThread({ uri: post_params.uri, depth: 1 });
            const root = post.data.thread.post.record.reply?.root ?? post_params; // the root post of the thread
            const post_text = post.data.thread.post.record.text;

            console.log(`Responding to ${notif.uri}`)

            const completion = await openai.createChatCompletion({
                model: "gpt-4",
                messages: [{
                    role: "user",
                    content: "Rewrite this as a limerick in no more than 300 characters:\n\n" + post_text }],
            });

            const limerick = completion.data.choices[0].message.content;

            // add a check to make sure it's only ONE limerick and if so
            // split it into two limericks across two posts
            // test: what happens if try post more than 300 chars?

            if (limerick) {
                await agent.post({
                    text: limerick,
                    reply: {
                        parent: {
                            uri: notif.uri,
                            cid: notif.cid,
                        },
                        root: {
                            uri: root.uri,
                            cid: root.cid,
                        },
                    }
                });
            } // end if (limerick)

        }
    }
});
