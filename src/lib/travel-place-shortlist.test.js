import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTravelPlaceShortlist,
  resolveTravelToolInvocation,
  travelPlacePreviewUrl,
} from './travel-place-shortlist.js';

test('hotel ratings/link requests that hit map routing are rewritten to Places hotel search', () => {
  const rewritten = resolveTravelToolInvocation('get_places_routing', {
    query: 'hotels in Asakusa and Ueno Tokyo',
  });
  assert.equal(rewritten.name, 'search_hotels');
  assert.match(rewritten.args.location, /Asakusa|Tokyo/i);
});

test('a real commute route is not rewritten into a hotel search', () => {
  const keep = resolveTravelToolInvocation('get_places_routing', {
    origin: 'Narita Airport',
    destination: 'Asakusa',
    travelMode: 'TRANSIT',
  });
  assert.equal(keep.name, 'get_places_routing');
});

test('shortlist always includes rating and a property link when Places supplied them', () => {
  const markdown = formatTravelPlaceShortlist([
    {
      name: 'The Gate Hotel Asakusa Kaminarimon by Hulic',
      userRating: 4.6,
      userRatingCount: 2100,
      website: 'https://gate-hotel.example',
      googleMapsUrl: 'https://maps.google.test/gate',
      address: 'Asakusa',
    },
  ]);
  assert.match(markdown, /★ 4\.6\/5 \(2100\)/);
  assert.match(markdown, /https:\/\/gate-hotel\.example/);
  // The label is "Maps", not "Maps / photos": that link only ever went to
  // Maps, and a real photo is now rendered as an image when one resolved.
  assert.match(markdown, /\[Maps\]\(https:\/\/maps\.google\.test\/gate\)/);
  assert.ok(!markdown.includes('Maps / photos'), 'a Maps link must not be sold as photos');
  assert.equal(
    travelPlacePreviewUrl({ website: 'https://gate-hotel.example', googleMapsUrl: 'https://maps.google.test/gate' }),
    'https://gate-hotel.example',
  );
});

test('a resolved photo is rendered as an image, with its attribution', () => {
  const markdown = formatTravelPlaceShortlist([
    {
      name: 'Hotel Alpha',
      userRating: 4.2,
      googleMapsUrl: 'https://maps.google.test/alpha',
      photoUrl: 'https://lh3.googleusercontent.com/p/alpha',
      photoAttribution: 'A. Traveller',
    },
  ]);
  // Rendered here rather than left to the model: three separate paths tell the
  // model to paste this shortlist verbatim, so a photo this renderer ignored
  // would never reach the traveller and four billed lookups would be wasted.
  assert.match(markdown, /!\[Hotel Alpha\]\(https:\/\/lh3\.googleusercontent\.com\/p\/alpha\)/);
  // Attribution is a Maps Platform term, not a nicety.
  assert.match(markdown, /Photo: A\. Traveller/);
});

test('a place with no photo renders exactly as before', () => {
  const markdown = formatTravelPlaceShortlist([
    { name: 'Hotel Beta', userRating: 4.0, googleMapsUrl: 'https://maps.google.test/beta' },
  ]);
  assert.ok(!markdown.includes('!['), 'no image markup when no photo resolved');
  assert.ok(!markdown.includes('Photo:'), 'no empty attribution line');
  assert.match(markdown, /Hotel Beta/);
});
