# More providers (Anivexa-API)

AniMallu already knows all 12 providers of
[Anivexa-API](https://github.com/walterwhite-69/Anivexa-API): MKissa, Reanime, AniKoto,
AnimeGG, AnimeNoSub, AniZone, AniWaves, Senshi, KickassAnime, AnimeDunya, AnimeOnsen and
Ani.pm. Each one is shown to viewers under an invented name (Aura, Bolt, Cove, ...), so
nothing about the real source leaks.

Which of them actually return streams depends on **where Anivexa-API runs**. The upstream
project says Vercel is not recommended: its shared IPs are blocked by most of these sites.
Run it on a normal server (VPS, Railway, Render, Fly) and point AniMallu at it.

## 1. Host Anivexa-API

```bash
git clone https://github.com/walterwhite-69/Anivexa-API
cd Anivexa-API && npm install && cp .env.example .env
node server.js          # listens on PORT (default 4000)
```

## 2. Point AniMallu at it

In the Vercel project settings add:

| Variable     | Value                                                     |
| ------------ | --------------------------------------------------------- |
| `STREAM_API` | `https://your-anivexa-host,https://another-instance`     |
| `SRC_SECRET` | any long random string                                    |

`STREAM_API` takes several URLs, separated by commas. Providers from every instance are
merged. If two instances return the same provider, the one with more episodes wins.
Redeploy after changing it.

## ReAnime / FlixCloud

Encrypted manifests (`playlist_key`) and image-wrapped segments are handled in
`api/stream.ts`, as described in the Anivexa-API docs, so ReAnime streams play through the
same private gateway as the others.
