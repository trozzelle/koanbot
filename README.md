# Koanbot

A Bluesky bot that generates a zen koan from the provided text. Built as an exercise to get familiar with the AT protocol. Currently uses OpenAI's GPT-3.5-Turbo model until I get access to GPT-4.

Derivative of limerickbot by @gar.lol, expanded and refactored.

---

## Getting Started

### Setup

Clone the repo

```shell
git clone https://github.com/trozzelle/koanbot
cd koanbot
```

Install dependencies

```shell
pip install -r requirements.txt
```

Set credentials in .env or otherwise. The script requires a valid Bluesky login and an OpenAI API key.

```
cp .env-example .env

nano .env
```

You are all set!

### Usage

#### Running Locally

You can start a single run by executing koanbot.js with node.

```
node koanbot.ts
```

#### Running Remotely

The bot can be run persistently anywhere that has Node 18. koanbot.js could easily be tweaked to run as a serverless function. A cost-effective choice is spinning up a cheap VM instance on DigitalOcean or AWS.

To run it persistently on a remote machine, use PM2 to manage scheduler.js, a wrapper around node-schedule which is a cron-like job scheduler. The bot is currently set to execute every 10 seconds but that can be managed by editing the cron time string in scheduler.js.

```
npm install pm2@latest -g

pm2 start scheduler.js --log logs/koanbot.log --name koanbot
```
