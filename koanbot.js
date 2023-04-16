#!/usr/bin/env node

import bsky from "@atproto/api";
import oai from "openai";
import * as dotenv from "dotenv";
import process from "node:process";

dotenv.config();

/**
 * Authenticates with the Bluesky API
 *
 * Returns authenticated agent object
 *
 * @returns {Promise<bsky.BskyAgent>}
 */
async function authenticateBsky() {
  const agent = new bsky.BskyAgent({
    service: "https://bsky.social",
  });
  await agent.login({
    identifier: process.env.ATPROTO_USER,
    password: process.env.ATPROTO_PASS,
  });

  return agent;
}

/***
 * Authenticates with the OpenAI API
 *
 * Returns authenticated OpenAIAPI object
 *
 * @returns {Promise<OpenAIApi>}
 */
async function authenticateOpenAI() {
  const configuration = new oai.Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_API_KEY,
  });

  return new oai.OpenAIApi(configuration);
}

/***
 * Gets unread mentions from Bluesky
 *
 * @param agent
 * @returns {Promise<unknown[]>}
 */
async function getUnreadMentions(agent) {
  const response_notifs = await agent.listNotifications();
  const notifs = response_notifs.data.notifications;

  // Clears all existing notifications
  await agent.updateSeenNotifications();

  return notifs.filter((notif) => {
    return notif.reason === "mention" && notif.isRead === false;
  });
}

/***
 * Calls OpenAI API and generates a completion from the prompt.
 *
 * @param openai
 * @param prompt
 * @param maxLength
 * @returns {Promise<string>}
 */
async function generateCompletion(openai, prompt, maxLength = 300) {
  // OpenAI sometimes returns completions that are too long. We test each
  // completion and only return ones that are below the max character
  // count for posting.
  let tooLong = true;

  while (tooLong) {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    // If completion exists, take the first choice (there should be only one)
    // and make sure it's within the character count before returning it
    if (completion.data.choices && completion.data.choices.length > 0) {
      const response = completion.data.choices[0].message.content.trim();
      if (response.length <= maxLength) {
        tooLong = false;
        return response;
      }
    } else {
      console.log("No valid completion found. Regenerating.");
    }
  }
}

export async function koanbot() {
  console.log("Booting up koanbot...");

  // Authenticate with APIs and retrieve unread mentions
  const agent = await authenticateBsky();
  const openai = await authenticateOpenAI();
  const unread_mentions = await getUnreadMentions(agent);

  console.log(`Found ${unread_mentions.length} new mentions.`);

  if (unread_mentions.length === 0) {
    console.log("No mentions to respond to. Goodbye.");
    return;
  }

  await Promise.all(
    // Iterate through new mentions, generate completion, and post.
    unread_mentions.map(async (notif) => {
      console.log(`Responding to ${notif.uri}`);

      let prompt = "";
      let root = {};

      // This is redundant and should be refactored

      // If reply to existing thread, we need to grab
      // the URI and CID of the root post in the thread
      if ("reply" in notif.record) {
        const post_uri = notif.record.reply.parent.uri;
        const post_thread = await agent.getPostThread({
          uri: post_uri,
          depth: 1,
        });
        root = notif.record.reply.root;
        const post_text = post_thread.data.thread.post.record.text;

        // Removes usernames that match @.*.* and @.*.*.*
        // This should probably match n segments of a URI in the future
        const mentions_removed = post_text.replace(/@\w+\.\w+/g, "");

        prompt = `As a wise zen master, carefully craft a zen koan based on the following text, using no more than 275 characters. Stay on topic and avoid generating any off-topic or inappropriate content:\n\n"${mentions_removed}"`;

        console.log(prompt);
      } else {
        // Else, if this is a top-level post, do the same but
        // set root URI and CID to post URI and CID
        const post_text = notif.record.text;
        const mentions_removed = post_text.replace(/@\w+\.\w+/g, "");

        root = {
          uri: notif.uri,
          cid: notif.cid,
        };

        prompt = `As a wise zen master, carefully craft a zen koan based on the following text, using no more than 275 characters. Stay on topic and avoid generating any off-topic or inappropriate content:\n\n${mentions_removed}`;
      }

      // Make the completion request to OpenAI
      const koan = await generateCompletion(openai, prompt);

      console.log(
        "\n\nThe following koan completion was returned: \n\n" + koan
      );

      // If koan exists, post. Otherwise, fail silently.
      // Post record structure is:
      // text: post message text
      // reply:
      //    URI/CID of mention post
      //    URI/CID of first post in thread (which could be the same)
      if (koan) {
        await agent.post({
          text: koan,
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
        console.log("Done.");
      } else {
        console.log(
          `WARNING: No koan returned for ${notif.uri}. koan = ${koan}`
        );
      }

      return;
    })
  );

  console.log("Completed async responses. Goodbye.");
}

koanbot();
