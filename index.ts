import AtpAgent, { AppBskyFeedPost, BlobRef } from "@atproto/api";
import express, { Request, Response } from "express";
import { LoggerUtils } from "./utils/LoggerUtils";
import denv from "dotenv";
import path from "path";
import axios from "axios";
import { Agent } from "https";

denv.config();

const app = express();

const bsky = new AtpAgent({
  service: "https://bsky.social",
});

const urlHostnameCache = new Map<string, string>();

const logger = new LoggerUtils("Server");

function redirectToBsky(req: Request, res: Response, force?: boolean) {
  try {
    logger.printInfo(`Redirecting ${req.path} to bsky...`);

    const url = new URL(path.join("https://bsky.app", req.path));

    url.host = "bsky.app";

    res.status(force ? 302 : 301).redirect(url.href);
  } catch (e) {
    res.status(301).redirect("https://bsky.app");
  }
}

function truncateString(text: string, length: number) {
  if (text.length <= length) return text;

  return text.slice(0, length - 3).concat("...");
}

function buildTags(
  post: { uri: string; cid: string; value: AppBskyFeedPost.Record },
  userHandle: string,
  video: BlobRef,
  videoURL: string,
  userDID: string
) {
  if (!post.value.embed) return "";

  const aspectRatio: { width: number; height: number } = post.value.embed
    .aspectRatio as any;

  let sizeMultiplier = 1;

  if (aspectRatio.width > 1920 || aspectRatio.height > 1920) {
    sizeMultiplier = 0.5;
  }
  if (aspectRatio.width < 400 && aspectRatio.height < 400) {
    sizeMultiplier = 2;
  }

  return `
  <html>
    <head>
      <meta property="og:type" content="video.other" />
      <meta property="og:title" content="@${userHandle}${
    post.value.text ? " " + "|" + truncateString(post.value.text, 48) : ""
  }" />
      <meta property="og:description" content="ebsky.app | Made with ❤ by @sebola.chambando.xyz" />
      <meta property="og:site_name" content="ebsky.app | Made with ❤ by @sebola.chambando.xyz" />
      
      <meta property="og:image" content="https://video.cdn.bsky.app/hls/${userDID}/${video.ref.toString()}/thumbnail.jpg" />
      
      <meta property="og:url" content="${videoURL}" />
      
      <meta property="og:video:url" content="${videoURL}" />
      <meta property="og:video:secure_url" content="${videoURL}" />
      <meta property="og:video:type" content="${video.mimeType}" />
      
      <meta property="og:video:width" content="${
        aspectRatio.width * sizeMultiplier
      }" />
      <meta property="og:video:height" content="${
        aspectRatio.height * sizeMultiplier
      }" />
      <meta name="theme-color" content="#0085ff">
    </head>
    <body>You're so curious... There's nothing here</body>
  </html>
  `;
}

async function getFinalUrl(url: string): Promise<string> {
  try {
    const response = await axios.head(url, {
      maxRedirects: 0,
      httpsAgent: new Agent({
        rejectUnauthorized: false,
      }),
    });

    return url;
  } catch (error: any) {
    if (
      error.response &&
      error.response.status >= 300 &&
      error.response.status < 400
    ) {
      const redirectUrl = error.response.headers.location;
      if (redirectUrl) {
        return redirectUrl;
      } else {
        throw "";
      }
    } else {
      throw "";
    }
  }
}

// too dumb, i can just do it with one regex lol (if you can write regex by hand you're pro)
function sanitizePost(postURL: string) {
  return postURL
    .replace(/\|/g, "")
    .replace(/\*/g, "")
    .replace(/\_/g, "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");
}

app.get("/profile/:repository/post/:post", (req, res) => {
  const userAgents = (req.headers["user-agent"] || "")
    .split(";")
    .map((u) => u.trim().toLowerCase());

  if (!userAgents.find((u) => u == "discordbot/2.0"))
    return redirectToBsky(req, res);

  req.params.post = sanitizePost(req.params.post);

  bsky
    .getPost({ repo: req.params.repository, rkey: req.params.post })
    .then((post) => {
      if (!post.value.embed) return redirectToBsky(req, res);

      const userDID = post.uri.split("/")[2];

      const media = post.value.embed;

      if (media.$type != "app.bsky.embed.video")
        return redirectToBsky(req, res);

      const video = media.video as any as BlobRef;

      if (!video.ref) return redirectToBsky(req, res);

      const cacheKey = `${userDID}|${req.params.post}`;

      if (!urlHostnameCache.get(cacheKey)) {
        const apiURL = `https://public.api.bsky.social/xrpc/com.atproto.sync.getBlob?did=${userDID}&cid=${video.ref.toString()}`;

        getFinalUrl(apiURL)
          .then((response) => {
            if (response) urlHostnameCache.set(cacheKey, response);

            logger.printSuccess(`Handled a post!`);

            res
              .status(200)
              .send(
                buildTags(
                  post,
                  req.params.repository.toLowerCase(),
                  video,
                  urlHostnameCache.get(cacheKey) || "",
                  userDID
                )
              );
          })
          .catch((error) => {
            logger.printError(`Cannot handle ${req.path}:`, error);

            res.status(500).send("Bruh");
          });
      } else {
        logger.printSuccess(`Handled a (cached) post!`);

        res
          .status(200)
          .send(
            buildTags(
              post,
              req.params.repository.toLowerCase(),
              video,
              urlHostnameCache.get(cacheKey) || "",
              userDID
            )
          );
      }
    })
    .catch((error) => {
      logger.printError(`Cannot handle ${req.path}:`, error);

      res.status(500).send(Buffer.from(""));
    });
});

const port = process.env.PORT || 3000;

app.listen(port, () => logger.printSuccess(`Running on port ${port}!`));
