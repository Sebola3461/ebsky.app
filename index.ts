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

function buildTags(
  url: string,
  post: { uri: string; cid: string; value: AppBskyFeedPost.Record },
  video: BlobRef,
  videoURL: string,
  userDID: string
) {
  // const videoURL = `https://public.api.bsky.social/xrpc/com.atproto.sync.getBlob?cid=${video.ref.toString()}&did=${userDID}`;

  // const originalURL = new URL(path.join("https://bsky.app", url));
  // originalURL.host = "bsky.app";

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
      <meta property="og:title" content="ebsky.app | Video Playback" />
      <meta property="og:description" content="Made with love by @sebola.chambando.xyz" />
      
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
      <meta name="twitter:card" content="player">
      <meta name="twitter:site" content="@sebola.chambando.xyz">
      <meta name="twitter:player" content="${videoURL}">
      <meta name="twitter:player:stream" content="${videoURL}">
      <meta property="witter:player:width" content="${
        (post.value.embed?.aspectRatio as any)?.width || 1280
      }" />
      <meta property="witter:player:height" content="${
        (post.value.embed?.aspectRatio as any)?.height || 720
      }" />
    </head>
    <body>hi</body>
  </html>
  `;
}

app.get("/profile/:repository/post/:post", (req, res) => {
  bsky
    .getPost({ repo: req.params.repository, rkey: req.params.post })
    .then((post) => {
      if (!post.value.embed) return redirectToBsky(req, res);

      const userDID = post.uri.split("/")[2]; // No need to do another api call :fire:

      const media = post.value.embed;

      if (media.$type != "app.bsky.embed.video")
        return redirectToBsky(req, res);

      const video = media.video as any as BlobRef;

      if (!video.ref) return redirectToBsky(req, res);

      const videoURL = `https://public.api.bsky.social/xrpc/com.atproto.sync.getBlob?cid=${video.ref.toString()}&did=${userDID}`;

      axios(videoURL, {
        httpsAgent: new Agent({
          rejectUnauthorized: false,
        }),
      })
        .then((result) => {
          logger.printSuccess(`Handled a post!`);

          return res.send(
            buildTags(
              req.path,
              post,
              video,
              result.request.res.url || "",
              userDID
            )
          );
        })
        .catch((error) => {
          logger.printError(`Cannot handle ${req.path}:`, error);

          res.status(500).send(Buffer.from(""));
        });
    })
    .catch((error) => {
      logger.printError(`Cannot handle ${req.path}:`, error);

      res.status(500).send(Buffer.from(""));
    });
});

const port = process.env.PORT || 3000;

app.listen(port, () => logger.printSuccess(`Running on port ${port}!`));
