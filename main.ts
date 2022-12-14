import { config } from "dotenv";
import express from "express"
import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions"
import { AnyAPIActionRowComponent, ChannelManager, Client, Events, GatewayIntentBits, Message, MessageManager } from "discord.js";
import { writeFileSync, readFileSync } from "fs"
import { program } from "commander"

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
        if (!newMsgs.length) { break }

        earliest = newMsgs[newMsgs.length - 1][0]
        earliestTime = newMsgs[newMsgs.length - 1][1].createdTimestamp
        messages = [...messages, ...newMsgs]
        console.log(progress(earliestTime - yearStart), messages.length)
    }

    return messages
}

const link = (c: string, m: string) => `https://discord.com/channels/${guildId}/${c}/${m}`

const mapCountsOfReactions = (a: [string, Message][], emojiName: string) => {
    return a.map(v => [v[0], v[1].content, v[1].reactions.cache.find(r => r.emoji.name === emojiName)?.count, link(v[1].channelId, v[0])]).filter(v => v[2])
}

const jsonToCsv = (res: Record<string, [string, string, string, string]>) => {
    const mapInner = (v: string[]) => [v[3], v[2]]
    //@ts-ignore
    const mapOuter = (v: Record<string, [string, string, string, string]>) => [v[0], v[1].map(mapInner)]
    //@ts-ignore
    const recs = Object.entries(res).map(mapOuter).map(v => v[1].map(i => [v[0], ...i])).flat()
    const lines = ['channel,link,reactions', ...recs.map(([c, l, o]) => `${c},${l},${o}`)]
    writeFileSync("results.csv", lines.join('\n'))
}

const parseMsgs = (allMessages: Record<string, any>, emojiName: string) => {
    let reactedMsgs: Record<string, any> = Object.entries(allMessages).reduce((acc, [channel, messages]) => (
        {
            ...acc,
            //@ts-ignore
            [channel]: mapCountsOfReactions(messages, emojiName).sort((a, b) => b[2] - a[2])
        }
    ), {})

    //@ts-ignore
    reactedMsgs['all'] = Object.values(reactedMsgs).flat().sort((a, b) => b[2] - a[2])

    writeFileSync("results.json", JSON.stringify(reactedMsgs))
    jsonToCsv(reactedMsgs)
}

const retrieve = () => {
    const app = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] })
    app.once(Events.ClientReady, async c => {

        const channelManagers = await Promise.all(channels.map(async (v) => await app.channels.fetch(v[0])))
        //@ts-ignore
        const channelMessages = channelManagers.map(manager => manager.messages as MessageManager)

        const allMessages: Record<string, any> = {}

        for (const channel of channelMessages) {
            allMessages[channels.find(v => v[0] === channel.channel.id)![1]] = await getChannelMessages(channel)
            writeFileSync("messages.json", JSON.stringify(allMessages))
        }

        parseMsgs(allMessages, 'dogshit')

        process.exit()
    })
    app.login(process.env.BOT_TOKEN)
}

retrieve()


