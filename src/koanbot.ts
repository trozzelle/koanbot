#!/usr/bin/env node

//@ts-ignore
import bsky, {BskyAgent} from "@atproto/api";
import {Record} from "@atproto/api/dist/client/types/app/bsky/feed/post";
import {Configuration, OpenAIApi} from "openai";
import * as dotenv from "dotenv";
import process from "node:process";
import pino from "pino";
// @ts-ignore
const { BskyAgent, RichText } = bsky

// Read environment variables, in .env or set elsewhere
dotenv.config();

// Using pino for logging
const logger = pino();

type Mention = {
  uri: string;
  cid: string;
  record: any;
  reason: string;
  isRead: boolean;
};

type PostMeta = {
  parent: {
    uri: string
    cid: string
  }
  root: {
    uri: string
    cid: string
  }
}

/**
 * Authenticates with the Bluesky API
 *
 * Returns authenticated agent object
 *
 * @returns {Promise<BskyAgent>}
 */
async function authenticateBsky(): Promise<BskyAgent> {
  const agent = new BskyAgent({
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
async function authenticateOpenAI(): Promise<OpenAIApi> {
  const configuration = new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_API_KEY,
  });

  return new OpenAIApi(configuration)
}

/***
 * Gets unread mentions from Bluesky
 *
 * @param {BskyAgent} agent
 * @returns {Promise<unknown[]>}
 */
async function getUnreadMentions(agent: BskyAgent): Promise<Mention[]> {
  const response_notifs = await agent.listNotifications();
  const notifs = response_notifs.data.notifications;

  // Clears all existing notifications
  await agent.updateSeenNotifications();

  return notifs.filter((notif: any) => {
    return notif.reason === "mention" && notif.isRead === false;
  });
}

/**
 * Generates prompt from the given record
 *
 * @param {any} record - The record containing the post text
 * @returns {string} - The generated prompt
 */
function generatePrompt(record: Record): string {
  const post_text = record.text;
  const mentions_removed = post_text.replace(/@\w+\.\w+/g, "");

  return `As a wise zen master, carefully craft a zen koan based on the following text, using no more than 275 characters. Stay on topic and avoid generating any off-topic or inappropriate content:\n\n"${mentions_removed}"`;
}

/**
 * Calls OpenAI API and generates a completion from the prompt.
 *
 * @param {OpenAIApi} openai - The authenticated OpenAIApi object
 * @param {string} prompt - The prompt to be used for generating completion
 * @param {number} [maxLength=300] - The maximum length of the generated completion
 * @returns {Promise<string | undefined>} - The generated completion
 */
async function generateCompletion(openai: OpenAIApi, prompt: string, maxLength = 300): Promise<string | undefined> {
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
      const response = completion.data.choices[0]?.message?.content.trim() ?? null;
      if (response && (response.length <= maxLength)) {
        tooLong = false;
        return response;
      }
    } else {
      logger.info("No valid completion found. Regenerating.");
    }
  }
}

export async function koanbot(): Promise<void> {
  logger.info("Starting koanbot run...");

  // Authenticate with APIs and retrieve unread mentions
  const agent = await authenticateBsky();
  const openai = await authenticateOpenAI();
  const unread_mentions = await getUnreadMentions(agent);

  logger.info(`Found ${unread_mentions.length} new mentions.`);

  if (unread_mentions.length === 0) {
    logger.info("No mentions to respond to. Goodbye.");
    return;
  }

  await Promise.all(
    // Iterate through new mentions, generate completion, and post.
    unread_mentions.map(async (notif) => {
      logger.info(`Responding to ${notif.uri}`);

      let prompt = "";

      const postMeta: PostMeta =
          'reply' in notif.record
              ? {
                parent: {
                  uri: notif.uri,
                  cid: notif.cid,
                },
                root: {
                  uri: notif.record.reply.root.uri,
                  cid: notif.record.reply.root.cid,
                },
              }
              : {
                parent: {
                  uri: notif.uri,
                  cid: notif.cid,
                },
                root: {
                  uri: notif.uri,
                  cid: notif.cid,
                },
              }

      if ("reply" in notif.record) {
        const post_uri: string = notif.record.reply.parent.uri;
        const post_thread: any = await agent.getPostThread({
          uri: post_uri,
          depth: 1,
        });

        prompt = generatePrompt(post_thread.data.thread.post.record);
      } else {
        prompt = generatePrompt(notif.record);
      }

      // Make the completion request to OpenAI
      const koan = await generateCompletion(openai, prompt);

      logger.info(
        "\n\nThe following koan completion was returned: \n\n" + koan
      );

      // If koan exists, post. Otherwise, fail silently.
      // Post record structure is:
      // text: post message text
      // reply:
      //    URI/CID of mention post
      //    URI/CID of first post in thread (which could be the same)
      if (koan) {

        // Posts should always use RichText for encoding, otherwise the
        // post will render in text only and symbols like emojis
        // will get mangled.
        const rt = new RichText({text:koan})
        await rt.detectFacets(agent)

        await agent.post({
          text: rt.text,
          facets: rt.facets,
          reply: postMeta,
          $type: 'app.bsky.feed.post',
        });
        logger.info("Response posted. Koan returned.");
      } else {
        logger.info(
          `WARNING: No koan returned for ${notif.uri}. koan = ${koan}`
        );
      }
      return;
    })
  );

  logger.info("Completed koanbot run. Goodbye.");
}

/**
 * Main function to run koanbot
 */
async function main(): Promise<void> {
  try {
    await koanbot();
  } catch (error) {
    logger.error("An error occurred:", error);
  }
}

main();