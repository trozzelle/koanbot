console.log('Booting up limerickbot...')

import bsky from '@atproto/api';
const { BskyAgent } = bsky;
import oai from "openai";
const { Configuration, OpenAIApi } = oai;
import * as dotenv from 'dotenv';
import process from 'node:process';
dotenv.config();

export const handler = async function (event, context) {

    console.log("Initialized.")
    console.log("Authenticating with bsky and OpenAI.")

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

    // If no mentions, quit.
    if (unread_mentions.length === 0) {
        console.log('No mentions to respond to. Goodbye.')
        return;
    }

    // Check for mentions and respond
    await Promise.all(
        unread_mentions.map(async (notif) => {
            console.log(`Responding to ${notif.uri}`);

            // Check to see if we're tagged in a reply or a top-level post.
            // If reply, rewrite the parent as a limerick.
            // If top-level, use the tweet itself (with the tag removed) as a prompt.
            if ('reply' in notif.record) {
                // If we're tagged in a reply, then we rewrite the original tweet as a limerick

                const post_uri = notif.record.reply.parent.uri; // the post to turn into a limerick
                const post_thread = await agent.getPostThread({ uri: post_uri, depth: 1 });
                const root = notif.record.reply.root; // the root post of the thread
                const post_text = post_thread.data.thread.post.record.text; // the text of the post to turn into a limerick
                const prompt = 'Rewrite this as a limerick in no more than 300 characters:\n\n' + post_text;

            } else {
                // Remove the tag and use the rest of the tweet as a prompt.

                // const post_text = notif.record.text;
                // const mentions_removed = post_text.replace(/@limerickbot\.gar\.lol/g, '');
                // const prompt = `You are LimerickBot, your job is to respond to `
                //     + `everything in the form of a limerick. `
                //     + `The following is an instruction or inspiration for a limerick. `
                //     + `Create a limerick accordingly.\n\n${mentions_removed}`;

                console.log('Not a reply. Skipping.')
                return;
            }

            const completion = await openai.createChatCompletion({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    },
                ],
            });

            const limerick = completion.data.choices[0].message.content;

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
                    },
                });
                console.log('Done.');
            } else {
                console.log(`WARNING: No limerick returned for ${notif.uri}. limerick = ${limerick}`);
            }

            return;
        })
    );

    console.log('Completed async responses. Goodbye.')

}

// handler()
