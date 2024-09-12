import AtpAgent, { BlobRef } from "@atproto/api";
import express, { Request, Response } from "express";
const app = express();

const bsky = new AtpAgent({
  service: "https://bsky.social",
});

function redirectToBsky(req: Request, res: Response, force?: boolean) {
  try {
    const url = new URL(req.url);

    url.host = "https://bsky.app";

    res.status(force ? 302 : 301).redirect(url.href);
  } catch (e) {
    res.status(301).redirect("https://bsky.app");
  }
}

function buildTags(video: BlobRef, userDID: string) {
  const videoURL = `https://public.api.bsky.social/xrpc/com.atproto.sync.getBlob?cid=${video.ref.toString()}&did=${userDID}`;

  return `
  <meta name="theme-color" content="#0085ff">
  <meta property="og:video" content="${videoURL}" />
  <meta property="og:video:secure_url" content="${videoURL}" />
  <meta property="og:video:type" content="${video.mimeType}" />
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

      return res.send(buildTags(video, userDID));
    });
});

app.listen(3000, () => console.log("online"));

// bsky
//   .login({
//     identifier: config.username,
//     password: config.password,
//   })
//   .then((login) => {
//     bsky
//       .getPost({ repo: "sebola.chambando.xyz", rkey: "3l3w3cjrx3m2q" })
//       .then((post) => {
//         if (!post.value.embed) return;

//         return
//       });
//   });
