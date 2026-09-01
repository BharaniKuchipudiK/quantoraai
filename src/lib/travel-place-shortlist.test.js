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

test('a resolved photo is rendered with the credit Places policy requires', () => {
  const markdown = formatTravelPlaceShortlist([
    {
      name: 'Hotel Alpha',
      userRating: 4.2,
      googleMapsUrl: 'https://maps.google.test/alpha',
      photoUrl: 'https://lh3.googleusercontent.com/p/alpha',
      photoCredit: {
        displayName: 'A. Traveller',
        authorUri: 'https://maps.google.com/maps/contrib/1234',
        authorPhotoUri: 'https://lh3.googleusercontent.com/a/avatar',
        googleMapsUri: 'https://www.google.com/maps/place/?q=place_id:X',
      },
    },
  ]);
  // Rendered here rather than left to the model: three separate paths tell the
  // model to paste this shortlist verbatim, so a photo this renderer ignored
  // would never reach the traveller and four billed lookups would be wasted.
  assert.match(markdown, /!\[Hotel Alpha\]\(https:\/\/lh3\.googleusercontent\.com\/p\/alpha\)/);
  // Policy asks for the author credited via the resources available...
  assert.match(markdown, /\[A\. Traveller\]\(https:\/\/maps\.google\.com\/maps\/contrib\/1234\)/);
  // ...and for the reader to always reach the individual source photo on Maps.
  assert.match(markdown, /source on Google Maps/);
  // Places content shown outside a Google map says where it came from.
  assert.match(markdown, /Places data and photos from Google\./);
});

test('a photo with no usable credit is not rendered at all', () => {
  // Showing an uncredited Places photo is the policy breach; showing no photo
  // is merely a smaller answer.
  const markdown = formatTravelPlaceShortlist([
    {
      name: 'Hotel Gamma',
      userRating: 4.1,
      googleMapsUrl: 'https://maps.google.test/gamma',
      photoUrl: 'https://lh3.googleusercontent.com/p/gamma',
      photoCredit: null,
    },
  ]);
  assert.ok(!markdown.includes('!['), 'no credit means no image');
});

test('a place with no photo renders exactly as before', () => {
  const markdown = formatTravelPlaceShortlist([
    { name: 'Hotel Beta', userRating: 4.0, googleMapsUrl: 'https://maps.google.test/beta' },
  ]);
  assert.ok(!markdown.includes('!['), 'no image markup when no photo resolved');
  assert.ok(!markdown.includes('Photo:'), 'no empty attribution line');
  assert.match(markdown, /Hotel Beta/);
});
