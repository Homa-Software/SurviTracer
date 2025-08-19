import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import PrettyError from 'pretty-error';
import { z } from 'zod';
import { env } from './env';

const pe = new PrettyError();

const ThumbnailSchema = z.object({
  url: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

const YouTubeSearchResultSchema = z.object({
  kind: z.literal('youtube#searchResult'),
  etag: z.string(),
  id: z.object({
    kind: z.string(),
    videoId: z.string().optional(),
    channelId: z.string().optional(),
    playlistId: z.string().optional(),
  }),
  snippet: z.object({
    publishedAt: z.coerce.date(),
    channelId: z.string(),
    title: z.string(),
    description: z.string(),
    thumbnails: z.record(z.string(), ThumbnailSchema),
    channelTitle: z.string(),
    liveBroadcastContent: z.string(),
  }),
});

type YoutubeSearchResult = z.infer<typeof YouTubeSearchResultSchema>;

const YoutubeSearchListResponseSchema = z.object({
  kind: z.literal('youtube#searchListResponse'),
  etag: z.string(),
  nextPageToken: z.string().optional(),
  regionCode: z.string(),
  pageInfo: z.object({
    totalResults: z.number().int().nonnegative(),
    resultsPerPage: z.number().int().nonnegative(),
  }),
  items: z.array(YouTubeSearchResultSchema),
});

type YoutubeSearchListResponse = z.infer<typeof YoutubeSearchListResponseSchema>;

type VideoSummary = {
  publishedAt: Date;
  channelId: string;
  title: string;
  description: string;
  videoId: string;
};

class YoutubeVideoPager {
  private videos: YoutubeSearchResult[];
  private totalResults: number;
  private nextPageToken: string | undefined;

  constructor(searchListResponse: YoutubeSearchListResponse) {
    this.videos = searchListResponse.items;
    this.totalResults = searchListResponse.pageInfo.totalResults;
    this.nextPageToken = searchListResponse.nextPageToken;
  }

  async fetchMore() {
    if (!this.nextPageToken) return;

    const newSet = await fetchYoutubeVideos(this.nextPageToken);
    this.nextPageToken = newSet.nextPageToken;
    this.videos.push(...newSet.items);
  }

  async getVideosNewerThan(date: Date): Promise<VideoSummary[]> {
    let indexFirstNewerVideo = this.videos
      .toReversed()
      .findIndex((video) => new Date(video.snippet.publishedAt) > date);
    if (indexFirstNewerVideo !== -1) {
      indexFirstNewerVideo = this.videos.length - 1 - indexFirstNewerVideo;
    }

    let maximumLoopCounter = 100;

    while (indexFirstNewerVideo === this.videos.length - 1 && this.hasMore) {
      if (maximumLoopCounter === 0) {
        console.log('Maximum loop counter reached, stopping fetch.');
        throw new Error('Maximum loop counter reached');
      }
      console.log('Fetching more videos...');
      await this.fetchMore();
      indexFirstNewerVideo = this.videos.toReversed().findIndex((video) => new Date(video.snippet.publishedAt) > date);
      if (indexFirstNewerVideo !== -1) {
        indexFirstNewerVideo = this.videos.length - 1 - indexFirstNewerVideo;
      }
      maximumLoopCounter--;
    }

    const videos = indexFirstNewerVideo !== -1 ? this.videos.slice(0, indexFirstNewerVideo + 1) : [];

    return videos
      .filter((video) => !!video.id.videoId)
      .map((video) => ({
        publishedAt: video.snippet.publishedAt,
        channelId: video.snippet.channelId,
        title: video.snippet.title,
        description: video.snippet.description,
        videoId: video.id.videoId as string,
      }));
  }

  get hasMore() {
    return this.videos.length < this.totalResults && this.nextPageToken !== undefined;
  }
}

async function fetchYoutubeVideos(pageToken?: string): Promise<YoutubeSearchListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('key', env.YOUTUBE_API_KEY);
  searchParams.set('channelId', env.YOUTUBE_CHANNEL_ID);
  searchParams.set('part', 'snippet');
  searchParams.set('order', 'date');
  searchParams.set('type', 'video');
  if (pageToken) {
    searchParams.set('pageToken', pageToken);
  }

  const request = new Request(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);

  try {
    const response = await fetch(request);
    if (!response.ok) {
      console.error('Error fetching YouTube videos:', JSON.stringify(await response.json(), null, 2));
      throw new Error('Failed to fetch YouTube videos');
    }
    const data = await response.json();
    const parsedData = YoutubeSearchListResponseSchema.parse(data);
    return parsedData;
  } catch (error) {
    console.error(pe.render(error as Error));
    throw error;
  }
}

const LAST_CHECKED_FILE = path.join(env.DATA_DIR ?? process.cwd(), 'last_checked.txt');

async function getLastCheckedDate() {
  try {
    const data = await readFile(LAST_CHECKED_FILE, 'utf-8');
    return new Date(data);
  } catch (error: unknown) {
    if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') return new Date('2025-08-01');
    console.error(pe.render(error as Error));
    throw error;
  }
}

export async function updateLastCheckedDate(date?: Date) {
  try {
    await writeFile(LAST_CHECKED_FILE, (date ?? new Date()).toISOString(), {
      encoding: 'utf-8',
      flag: 'w',
    });
  } catch (error: unknown) {
    console.error(pe.render(error as Error));
    throw error;
  }
}

export async function checkForNewerVideos() {
  const initialData = await fetchYoutubeVideos();
  const pager = new YoutubeVideoPager(initialData);
  const lastCheckedDate = await getLastCheckedDate();
  const newerVideos = await pager.getVideosNewerThan(lastCheckedDate);
  return newerVideos;
}
