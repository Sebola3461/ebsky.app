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

  return `
  <html>
    <meta name="og:url" content="${videoURL}">
    <meta property="og:type" content="video.other">
    <meta name="og:site_name" content="Made with love by @sebola.chambando.xyz">
    <meta name="theme-color" content="#0085ff">
    <meta name="og:title" content="${post.value.text}">
    <meta property="og:video" content="${videoURL}" />
    <meta property="og:image" content="${videoURL}" />
    <meta property="og:video:secure_url" content="${videoURL}" />
    <meta property="og:video:type" content="${video.mimeType}" />
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
        });
    })
    .catch((error) => {
      logger.printError(`Cannot handle ${req.path}:`, error);
    });
});

const port = process.env.PORT || 3000;

app.listen(port, () => logger.printSuccess(`Running on port ${port}!`));
