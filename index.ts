import AtpAgent, { AppBskyFeedPost, BlobRef } from "@atproto/api";
import express, { Request, Response } from "express";
import { LoggerUtils } from "./utils/LoggerUtils";
import denv from "dotenv";
import path from "path";
import axios from "axios";
import { Agent } from "https";
import { Readable } from "stream";
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
  req: Request,
  post: { uri: string; cid: string; value: AppBskyFeedPost.Record },
  video: BlobRef,
  videoURL: string,
  userDID: string
) {
  // const videoURL = `https://public.api.bsky.social/xrpc/com.atproto.sync.getBlob?cid=${video.ref.toString()}&did=${userDID}`;

  // const originalURL = new URL(path.join("https://bsky.app", url));
  // originalURL.host = "bsky.app";

  if (!post.value.embed) return "";

  const requestURL = `${req.protocol}://${req.hostname}${req.originalUrl}`;

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
      
      <meta property="og:video:url" content="${requestURL}/stream" />
      <meta property="og:video:stream" content="${requestURL}/stream" />
      <meta property="og:video:secure_url" content="${requestURL}/stream" />
      <meta property="og:video:type" content="${video.mimeType}" />
      
      <meta property="og:video:width" content="${
        aspectRatio.width * sizeMultiplier
      }" />
      <meta property="og:video:height" content="${
        aspectRatio.height * sizeMultiplier
      }" />
      <meta name="theme-color" content="#0085ff">
      <meta name="twitter:card" content="player">
      <meta property="twitter:image" content="https://video.cdn.bsky.app/hls/${userDID}/${video.ref.toString()}/thumbnail.jpg" />
      <meta name="twitter:site" content="@sebola.chambando.xyz">
      <meta name="twitter:player" content="${requestURL}/stream">
      <meta name="twitter:player:stream" content="${requestURL}/stream">
      <meta property="witter:player:width" content="${
        aspectRatio.width * sizeMultiplier
      }" />
      <meta property="witter:player:height" content="${
        aspectRatio.height * sizeMultiplier
      }" />
    </head>
    <body>hi</body>
  </html>
  `;
}

function bufferToStream(buffer: Buffer) {
  const readable = new Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

app.get("/profile/:repository/post/:post/stream", (req, res) => {
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
          logger.printSuccess(`Handling a post video stream...`);

          const videoData: Buffer = result.data;
          const range = req.headers.range;

          if (range) {
            // Handle partial requests for video (streaming)
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : video.size - 1;
            const chunkSize = end - start + 1;

            const videoBuffer = videoData.slice(start, end + 1);

            const headers = {
              "Content-Range": `bytes ${start}-${end}/${video.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunkSize,
              "Content-Type": video.mimeType,
            };

            const videoStream = bufferToStream(videoBuffer);

            res.writeHead(206, headers);
            videoStream.pipe(res);
          } else {
            res.setHeader("Content-Length", video.size);
            res.setHeader("Content-Type", video.mimeType);
            res.status(200).send(videoData);
          }
        })
        .catch((error) => {
          logger.printError(`Cannot handle stream for ${req.path}:`, error);

          res.status(500).send(Buffer.from(""));
        });
    })
    .catch((error) => {
      logger.printError(`Cannot handle stream for ${req.path}:`, error);

      res.status(500).send(Buffer.from(""));
    });
});

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

      // axios(videoURL, {
      //   httpsAgent: new Agent({
      //     rejectUnauthorized: false,
      //   }),
      // })
      //   .then((result) => {
      logger.printSuccess(`Handled a post!`);

      return res.send(buildTags(req, post, video, videoURL, userDID));
      // })
      // .catch((error) => {
      //   logger.printError(`Cannot handle ${req.path}:`, error);

      //   res.status(500).send(Buffer.from(""));
      // });
    })
    .catch((error) => {
      logger.printError(`Cannot handle ${req.path}:`, error);

      res.status(500).send(Buffer.from(""));
    });
});

const port = process.env.PORT || 3000;

app.listen(port, () => logger.printSuccess(`Running on port ${port}!`));
