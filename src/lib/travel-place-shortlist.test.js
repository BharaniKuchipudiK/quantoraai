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
  assert.match(markdown, /Maps \/ photos/);
  assert.equal(
    travelPlacePreviewUrl({ website: 'https://gate-hotel.example', googleMapsUrl: 'https://maps.google.test/gate' }),
    'https://gate-hotel.example',
  );
});
