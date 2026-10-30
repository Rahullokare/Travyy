import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearInstagramCache, fetchInstagramCaption, type Fetcher } from './instagram.ts';
import {
  captionFromEmbedHtml,
  captionFromEmbeddedJson,
  captionFromMeta,
  diagnoseEmbedPage,
  imageFromEmbedPage,
  instagramShortcode,
  locationFromEmbedPage,
  parseEmbedPage,
  videoFromEmbedPage,
  withLocationTag,
} from './instagramEmbed.ts';

// Fixtures mirror the shapes Instagram's embed page has used. They are hand-built
// (the build sandbox can't reach instagram.com), so watch `caption_lookup` logs in production.
const JSON_EMBED = `<html><body><script>window.__additionalDataLoaded('extra',{"shortcode_media":{"id":"1","edge_media_to_caption":{"edges":[{"node":{"text":"Lisbon in 3 spots \\ud83c\\uddf5\\ud83c\\uddf9\\n\\ud83d\\udccd Cervejaria Ramiro\\n\\ud83d\\udccd Time Out Market\\n#lisbon"}}]}}});</script></body></html>`;

const ESCAPED_JSON_EMBED = `<script>requireLazy(["TimeSliceImpl"],function(){ s.handle({"contextJSON":"{\\"context\\":{\\"media\\":{\\"caption\\":{\\"pk\\":\\"9\\",\\"text\\":\\"Kyoto hidden gems\\\\n1. Nishiki Market\\\\n2. Fushimi Inari \\\\\\"go early\\\\\\"\\"}}}}"}); });</script>`;

const HTML_EMBED = `<div class="Embed"><div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/lisbon.eats/" target="_blank">lisbon.eats</a><br /><br />Where locals eat &amp; drink<br /><br />📍 Cervejaria Ramiro, Lisbon<br />📍 Park Bar<br /><br /><a href="https://www.instagram.com/explore/tags/lisbon/" target="_blank">#lisbon</a><div class="CaptionComments"><a>View all 120 comments</a></div></div><div class="Footer">Instagram</div></div>`;

const META_EMBED = `<head><meta property="og:description" content="1,234 likes, 56 comments - lisbon.eats on May 1, 2026: &quot;📍 Cervejaria Ramiro, Lisbon&quot;. " /></head>`;

const LOGIN_WALL = `<html><head><meta property="og:description" content="1,234 likes, 56 comments" /><title>Login • Instagram</title></head></html>`;

const NO_CAPTION_EMBED = `<div class="Embed"><div class="EmbeddedMedia"><img src="x.jpg" /></div><div class="Footer">Instagram</div></div>`;

const EMPTY_SHELL = `<html><head><title>Instagram</title></head><body><div id="root"></div></body></html>`;

describe('instagramShortcode', () => {
  it('handles post, reel, reels, tv and user-prefixed URLs', () => {
    for (const [url, code] of [
      ['https://www.instagram.com/reel/C9xYz-Ab_1/?igsh=MWQ1', 'C9xYz-Ab_1'],
      ['https://www.instagram.com/p/C1abcDE/', 'C1abcDE'],
      ['https://instagram.com/reels/C2xyzAB/', 'C2xyzAB'],
      ['https://www.instagram.com/tv/C3tvABC', 'C3tvABC'],
      ['https://www.instagram.com/lisbon.eats/reel/C4userAB/', 'C4userAB'],
      ['https://instagr.am/p/C5shortA/', 'C5shortA'],
    ]) {
      assert.equal(instagramShortcode(url), code, url);
    }
  });

  it('rejects profiles, share links and junk', () => {
    assert.equal(instagramShortcode('https://www.instagram.com/lisbon.eats/'), undefined);
    assert.equal(instagramShortcode('https://www.instagram.com/share/reel/BAxyz123/'), undefined);
    assert.equal(instagramShortcode('not a url'), undefined);
  });
});

describe('caption parsing strategies', () => {
  it('reads GraphQL JSON with unicode escapes', () => {
    assert.equal(
      captionFromEmbeddedJson(JSON_EMBED),
      'Lisbon in 3 spots 🇵🇹\n📍 Cervejaria Ramiro\n📍 Time Out Market\n#lisbon',
    );
  });

  it('reads JSON nested inside a JSON string', () => {
    assert.equal(
      captionFromEmbeddedJson(ESCAPED_JSON_EMBED),
      'Kyoto hidden gems\n1. Nishiki Market\n2. Fushimi Inari "go early"',
    );
  });

  it('unescapes slashes in JSON nested inside a JSON string', () => {
    const html = `<script>s.handle({"contextJSON":"{\\"caption\\":{\\"text\\":\\"\\ud83d\\udccd Krabi: 9\\\\\\/10\\"}}"});</script>`;
    assert.equal(captionFromEmbeddedJson(html), '📍 Krabi: 9/10');
  });

  it('reads the rendered caption block without username or comments', () => {
    assert.equal(
      captionFromEmbedHtml(HTML_EMBED),
      'Where locals eat & drink\n\n📍 Cervejaria Ramiro, Lisbon\n📍 Park Bar\n\n#lisbon',
    );
  });

  it('reads the quoted caption from description meta', () => {
    assert.equal(captionFromMeta(META_EMBED), '📍 Cervejaria Ramiro, Lisbon');
  });

  it('finds nothing on a login wall', () => {
    assert.equal(parseEmbedPage(LOGIN_WALL), undefined);
  });

  it('says why a page has no caption', () => {
    assert.equal(diagnoseEmbedPage(LOGIN_WALL), 'login_wall');
    assert.equal(
      diagnoseEmbedPage('<html></html>', 'https://www.instagram.com/accounts/login/?next=x'),
      'login_wall',
    );
    assert.equal(diagnoseEmbedPage(EMPTY_SHELL), 'no_post_data');
    assert.equal(diagnoseEmbedPage(NO_CAPTION_EMBED), 'no_caption');
  });

  it('reports which strategy matched, best first', () => {
    assert.equal(parseEmbedPage(JSON_EMBED + HTML_EMBED)?.source, 'embed-json');
    assert.equal(parseEmbedPage(HTML_EMBED + META_EMBED)?.source, 'embed-html');
    assert.equal(parseEmbedPage(META_EMBED)?.source, 'embed-meta');
  });
});

// A reel with no caption: only the cover image and the creator's location tag.
const MEDIA_JSON_EMBED = `<script>window.__additionalDataLoaded('extra',{"shortcode_media":{"id":"2","display_url":"https:\\/\\/scontent-lis1-1.cdninstagram.com\\/v\\/cover.jpg?stp=dst\\u0026_nc_ht=x","is_video":true,"video_url":"https:\\/\\/scontent-lis1-1.cdninstagram.com\\/o1\\/v\\/reel.mp4?efg=x\\u0026_nc_ht=y","location":{"id":"123","has_public_page":true,"name":"Cervejaria Ramiro","slug":"cervejaria-ramiro"},"edge_media_to_caption":{"edges":[]}}});</script>`;

const MEDIA_HTML_EMBED = `<div class="Embed"><div class="EmbeddedMedia"><img class="EmbeddedMediaImage" alt="" src="https://scontent.cdninstagram.com/v/cover.jpg?a=1&amp;b=2" /></div></div>`;

describe('cover image and location tag', () => {
  it('reads the cover image from post JSON, the rendered image, then og:image', () => {
    assert.equal(
      imageFromEmbedPage(MEDIA_JSON_EMBED),
      'https://scontent-lis1-1.cdninstagram.com/v/cover.jpg?stp=dst&_nc_ht=x',
    );
    assert.equal(
      imageFromEmbedPage(MEDIA_HTML_EMBED),
      'https://scontent.cdninstagram.com/v/cover.jpg?a=1&b=2',
    );
    assert.equal(
      imageFromEmbedPage('<meta property="og:image" content="https://scontent.cdninstagram.com/og.jpg" />'),
      'https://scontent.cdninstagram.com/og.jpg',
    );
    assert.equal(imageFromEmbedPage(NO_CAPTION_EMBED), undefined);
  });

  it('reads the reel video from post JSON', () => {
    assert.equal(
      videoFromEmbedPage(MEDIA_JSON_EMBED),
      'https://scontent-lis1-1.cdninstagram.com/o1/v/reel.mp4?efg=x&_nc_ht=y',
    );
    assert.equal(videoFromEmbedPage(JSON_EMBED), undefined);
  });

  it('reads the location tag from post JSON', () => {
    assert.equal(locationFromEmbedPage(MEDIA_JSON_EMBED), 'Cervejaria Ramiro');
    assert.equal(locationFromEmbedPage(JSON_EMBED), undefined);
  });

  it('adds the location tag as a pin line unless the caption already names it', () => {
    assert.equal(
      withLocationTag('Best seafood ever', 'Cervejaria Ramiro'),
      'Best seafood ever\n\n📍 Cervejaria Ramiro',
    );
    assert.equal(withLocationTag(undefined, 'Cervejaria Ramiro'), '📍 Cervejaria Ramiro');
    assert.equal(withLocationTag('📍 cervejaria ramiro', 'Cervejaria Ramiro'), '📍 cervejaria ramiro');
    assert.equal(withLocationTag('caption', undefined), 'caption');
  });
});

describe('fetchInstagramCaption', () => {
  beforeEach(() => clearInstagramCache());

  function fakeFetcher(routes: Record<string, () => Response>) {
    const calls: string[] = [];
    const fetcher: Fetcher = async (url) => {
      calls.push(url);
      const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
      if (!route) throw new TypeError('network error');
      return routes[route]();
    };
    return { fetcher, calls };
  }

  it('fetches the embed page for the shortcode and caches the result', async () => {
    const { fetcher, calls } = fakeFetcher({
      'https://www.instagram.com/p/C9xYz/embed/captioned/': () => new Response(HTML_EMBED),
    });
    const first = await fetchInstagramCaption('https://www.instagram.com/reel/C9xYz/?igsh=abc', fetcher);
    const second = await fetchInstagramCaption('https://www.instagram.com/p/C9xYz/', fetcher);
    assert.equal(first.outcome, 'ok');
    assert.equal(first.caption?.source, 'embed-html');
    assert.match(first.caption!.text, /Cervejaria Ramiro/);
    assert.equal(first.status, 200);
    assert.deepEqual(second, { ...first, cached: true });
    assert.equal(calls.length, 1, 'second lookup served from cache');
  });

  it('negative-caches failures so a blocked post is not retried immediately', async () => {
    const { fetcher, calls } = fakeFetcher({
      'https://www.instagram.com/p/Cprivate1/embed/captioned/': () => new Response(LOGIN_WALL),
    });
    const first = await fetchInstagramCaption('https://www.instagram.com/p/Cprivate1/', fetcher);
    const second = await fetchInstagramCaption('https://www.instagram.com/p/Cprivate1/', fetcher);
    assert.equal(first.caption, undefined);
    assert.equal(first.outcome, 'login_wall');
    assert.equal(second.cached, true);
    assert.equal(calls.length, 1);
  });

  it('reports pages served without the post', async () => {
    const { fetcher } = fakeFetcher({
      'https://www.instagram.com/p/Cshell01/embed/captioned/': () => new Response(EMPTY_SHELL),
    });
    const result = await fetchInstagramCaption('https://www.instagram.com/p/Cshell01/', fetcher);
    assert.deepEqual(result, {
      caption: undefined,
      imageUrl: undefined,
      videoUrl: undefined,
      location: undefined,
      outcome: 'no_post_data',
      status: 200,
      bytes: EMPTY_SHELL.length,
    });
  });

  it('resolves /share/ links to the post before fetching', async () => {
    const { fetcher, calls } = fakeFetcher({
      'https://www.instagram.com/share/': () => {
        const res = new Response('');
        Object.defineProperty(res, 'url', { value: 'https://www.instagram.com/reel/CshareAB/?igsh=1' });
        return res;
      },
      'https://www.instagram.com/p/CshareAB/embed/captioned/': () => new Response(JSON_EMBED),
    });
    const result = await fetchInstagramCaption('https://www.instagram.com/share/reel/BAxyz123/', fetcher);
    assert.equal(result.caption?.source, 'embed-json');
    assert.deepEqual(calls, [
      'https://www.instagram.com/share/reel/BAxyz123/',
      'https://www.instagram.com/p/CshareAB/embed/captioned/',
    ]);
  });

  it('survives network errors and non-200 responses', async () => {
    const { fetcher } = fakeFetcher({
      'https://www.instagram.com/p/C429err/': () => new Response('rate limited', { status: 429 }),
    });
    assert.deepEqual(await fetchInstagramCaption('https://www.instagram.com/p/C429err/', fetcher), {
      outcome: 'http_429',
      status: 429,
    });
    assert.deepEqual(await fetchInstagramCaption('https://www.instagram.com/p/Cnetwork/', fetcher), {
      outcome: 'network_error',
    });
  });

  it('ignores non-Instagram URLs', async () => {
    const { fetcher, calls } = fakeFetcher({});
    assert.deepEqual(await fetchInstagramCaption('https://www.tiktok.com/@a/video/1', fetcher), {
      outcome: 'no_shortcode',
    });
    assert.equal(calls.length, 0);
  });
});
