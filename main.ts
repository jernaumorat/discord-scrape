import { config } from "dotenv";
import express from "express"
import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions"
import { ChannelManager, Client, Events, GatewayIntentBits, Message, MessageManager } from "discord.js";
import { writeFileSync, readFileSync } from "fs"

const VerifyDiscordRequest = (clientKey: string) => (req: any, res: any, buf: any, _: any) => {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');

    const isValidRequest = verifyKey(buf, signature, timestamp, clientKey);
    if (!isValidRequest) {
        res.status(401).send('Bad request signature');
        throw new Error('Bad request signature');
    }
};


config()

const { guildId, channels }: { guildId: string, channels: [string, string][] } = JSON.parse(readFileSync("channels.json").toString())

const app = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] })

const progress = (delta: number) => ((1 - (delta / (365.25 * 24 * 60 * 60 * 1000))) * 100).toFixed(2) + '%'

const getChannelMessages = async (channel: MessageManager) => {
    const yearStart = 1640955600000
    let earliestTime = new Date().getTime()
    let earliest: string | undefined = undefined
    let messages: [string, Message][] = []

    console.log(channels.find(v => v[0] === channel.channel.id)![1])
    while (earliestTime > yearStart) {
        const res = await channel.fetch({ before: earliest, limit: 100 })
        const newMsgs: [string, Message][] = Array.from(res.entries())
        earliest = newMsgs[newMsgs.length - 1][0]
        earliestTime = newMsgs[newMsgs.length - 1][1].createdTimestamp
        messages = [...messages, ...newMsgs]
        console.log(progress(earliestTime - yearStart), messages.length)
    }

    return messages
}

const mapCountsOfReactions = (a: [string, Message][], emojiName: string) => {
    return a.map(v => [v[0], v[1].content, v[1].reactions.cache.find(r => r.emoji.name === 'dogshit')?.count]).filter(v => v[2])
}

app.once(Events.ClientReady, async c => {

    const channelManagers = await Promise.all(channels.map(async (v) => await app.channels.fetch(v[0])))
    //@ts-ignore
    const channelMessages = channelManagers.map(manager => manager.messages as MessageManager)

    const allMessages: Record<string, any> = {}

    for (const channel of channelMessages) {
        allMessages[channels.find(v => v[0] === channel.channel.id)![1]] = await getChannelMessages(channel)
    }

    console.log(Object.keys(allMessages))

    writeFileSync("messages.json", JSON.stringify(allMessages))

    process.exit()
})

app.login(process.env.BOT_TOKEN)

