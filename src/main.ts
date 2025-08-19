import { Client, GatewayIntentBits, MessageFlags, type TextChannel } from 'discord.js';
import ms from 'ms';
import PrettyError from 'pretty-error';

import { env } from './env';
import { checkForNewerVideos, updateLastCheckedDate } from './youtube';

const pe = new PrettyError();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

async function sendMessageToChannel(client: Client, message: string): Promise<boolean> {
  try {
    const channel = (await client.channels.fetch(env.DISCORD_CHANNEL_ID)) as TextChannel;

    if (channel) {
      await channel.send({
        flags: MessageFlags.SuppressNotifications,
        content: message,
      });
      console.log('Sent message to Discord channel:', message);
    }
    return true;
  } catch (error) {
    console.error('Error sending message to Discord channel:', error);
    return false;
  }
}

client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);

  const doWork = async () => {
    console.log('Checking for new videos...');
    try {
      const newVideos = (await checkForNewerVideos()).toReversed();
      const results = await Promise.all(
        newVideos.map(async (video) => {
          const message = `🎥 **<@${env.DISCORD_USER_ID}> Wrzucił nowy film!**\n**${video.title}**\nhttps://www.youtube.com/watch?v=${video.videoId}`;
          return await sendMessageToChannel(client, message);
        }),
      );
      const allSuccess = results.every((result) => result === true);
      if (allSuccess) {
        await updateLastCheckedDate();
      } else {
        console.error('Some messages failed to send.');
      }
    } catch (error) {
      console.error(pe.render(error as Error));
    }

    setTimeout(() => {
      void doWork();
    }, ms('30min'));
  };

  void doWork();
});

client.login(env.DISCORD_BOT_TOKEN);

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});
