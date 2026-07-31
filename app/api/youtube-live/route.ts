import { getConfigValue as getRuntimeConfigValue } from "../../lib/server-store";

const DEFAULT_CHANNEL_ID = "UCX9q-HI41sFuh1Gs5X_ZZCw";
const DEFAULT_SOURCE_URL = "https://www.youtube.com/@48ilottery48/streams";
const DRAW_HOUR = 20;
const DRAW_MINUTE = 30;
const JSON_HEADERS = { "Cache-Control": "no-store" };

type TaipeiDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

type VideoCandidate = {
  videoId: string;
  title: string;
  url: string;
  published?: string;
  metadata?: string;
  dateCode?: string;
};

function decodeText(value: string) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickTag(entry: string, tag: string) {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeText(match[1].trim()) : "";
}

function pickHref(entry: string) {
  const match = entry.match(/<link[^>]+href="([^"]+)"/);
  return match ? decodeText(match[1]) : "";
}

function getTaipeiNow(): TaipeiDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

function formatDateCode(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function getDrawTarget() {
  const now = getTaipeiNow();
  const today = new Date(Date.UTC(now.year, now.month - 1, now.day));
  const isDrawDay = now.weekday >= 1 && now.weekday <= 6;
  const isAfterDrawTime =
    now.hour > DRAW_HOUR || (now.hour === DRAW_HOUR && now.minute >= DRAW_MINUTE);
  const useToday = isDrawDay && isAfterDrawTime;
  const target = new Date(today);

  if (!useToday) {
    do {
      target.setUTCDate(target.getUTCDate() - 1);
    } while (target.getUTCDay() === 0);
  }

  return {
    dateCode: formatDateCode(target),
    isAfterDrawTime: useToday,
    switchTime: "20:30",
  };
}

async function resolveChannelId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CHANNEL_ID;
  if (/^UC[\w-]+$/.test(trimmed)) return trimmed;

  const url = trimmed.startsWith("http")
    ? trimmed
    : `https://www.youtube.com/${trimmed.startsWith("@") ? trimmed : `@${trimmed}`}/streams`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) throw new Error(`YouTube 頻道頁讀取失敗：${response.status}`);

  const html = await response.text();
  const match = html.match(/(?:"externalId"|"channelId"|"browseId")\s*:\s*"(UC[^"]+)"/);
  if (!match) throw new Error("找不到 YouTube 頻道 ID。");

  return match[1];
}

function uniqueVideos(videos: VideoCandidate[]) {
  const seen = new Set<string>();
  return videos.filter((video) => {
    if (seen.has(video.videoId)) return false;
    seen.add(video.videoId);
    return true;
  });
}

function parseStreamsPage(html: string) {
  return uniqueVideos(
    html
      .split('"richItemRenderer"')
      .map((chunk) => {
        const videoId = chunk.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1];
        if (!videoId) return null;

        const title = decodeText(
          chunk.match(/"title":\{"content":"([^"]+)"/)?.[1] ??
            chunk.match(/"accessibilityText":"([^"]+)"/)?.[1] ??
            "539 開獎直播",
        );
        const metadata = decodeText(
          chunk.match(/"metadataRows":\[\{"metadataParts":\[\{"text":\{"content":"([^"]+)"/)?.[1] ??
            "",
        );

        return {
          videoId,
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          metadata,
          dateCode: title.match(/20\d{6}/)?.[0],
        };
      })
      .filter(Boolean) as VideoCandidate[],
  );
}

function parseFeedVideos(xml: string) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);

  return entries
    .map((entry) => {
      const videoId = pickTag(entry, "yt:videoId");
      const title = pickTag(entry, "title") || "539 開獎直播";
      if (!videoId) return null;

      return {
        videoId,
        title,
        url: pickHref(entry) || `https://www.youtube.com/watch?v=${videoId}`,
        published: pickTag(entry, "published"),
        dateCode: title.match(/20\d{6}/)?.[0],
      };
    })
    .filter(Boolean) as VideoCandidate[];
}

function pickByDrawTime(videos: VideoCandidate[]) {
  const target = getDrawTarget();
  const relevant = videos.filter((video) => /539|今彩|開獎|彩券|LIVE|直播/i.test(video.title));
  const pool = relevant.length ? relevant : videos;
  const exact = pool.find((video) => video.dateCode === target.dateCode);
  const nearestPast = pool.find(
    (video) => video.dateCode && video.dateCode <= target.dateCode,
  );
  const picked = exact ?? nearestPast ?? pool[0];

  return picked
    ? {
        ...picked,
        source: "全民i彩券 YouTube",
        drawTargetDate: target.dateCode,
        drawSwitchTime: target.switchTime,
        isAfterDrawTime: target.isAfterDrawTime,
      }
    : null;
}

export async function GET() {
  try {
    const fallbackVideoId = await getRuntimeConfigValue(
      "YOUTUBE_LIVE_VIDEO_ID",
      "LOTTERY_LIVE_VIDEO_ID",
    );
    if (fallbackVideoId) {
      const target = getDrawTarget();
      return Response.json(
        {
          videoId: fallbackVideoId,
          title: "539 開獎直播",
          url: `https://www.youtube.com/watch?v=${fallbackVideoId}`,
          published: "",
          source: "手動設定",
          drawTargetDate: target.dateCode,
          drawSwitchTime: target.switchTime,
          isAfterDrawTime: target.isAfterDrawTime,
        },
        { headers: JSON_HEADERS },
      );
    }

    const sourceUrl =
      (await getRuntimeConfigValue("YOUTUBE_LIVE_SOURCE_URL")) || DEFAULT_SOURCE_URL;
    const pageResponse = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (pageResponse.ok) {
      const latest = pickByDrawTime(parseStreamsPage(await pageResponse.text()));
      if (latest) {
        return Response.json(latest, {
          headers: JSON_HEADERS,
        });
      }
    }

    const channelId = await resolveChannelId(
      (await getRuntimeConfigValue("YOUTUBE_LIVE_CHANNEL_ID")) || DEFAULT_CHANNEL_ID,
    );
    const feedResponse = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { headers: { Accept: "application/atom+xml, application/xml, text/xml" } },
    );

    if (!feedResponse.ok) throw new Error(`YouTube feed returned ${feedResponse.status}`);

    const latest = pickByDrawTime(parseFeedVideos(await feedResponse.text()));
    if (!latest) throw new Error("找不到可播放的開獎直播影片。");

    return Response.json(latest, {
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "無法讀取 YouTube 開獎直播。",
        source: "YouTube",
      },
      { status: 502, headers: JSON_HEADERS },
    );
  }
}
