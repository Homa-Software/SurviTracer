import 'dotenv/config';

import PrettyError from 'pretty-error';
import { z } from 'zod/v4';

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CHANNEL_ID: z.string().min(1),
  YOUTUBE_API_KEY: z.string().min(1),
  YOUTUBE_CHANNEL_ID: z.string().min(1),
  DATA_DIR: z.string().optional(),
  DISCORD_USER_ID: z.string().min(1),
});

const parseResult = envSchema.safeParse(process.env);

if (parseResult.error) {
  const pretty = new PrettyError();
  console.error(pretty.render(parseResult.error));
  process.exit(1);
}

export const env = parseResult.data;
