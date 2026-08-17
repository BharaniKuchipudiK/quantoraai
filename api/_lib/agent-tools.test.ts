import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeToolCall,
  isTransactionalTravelTool,
  shouldEnableTravelTools,
  travelFunctionDeclarations,
} from './agent-tools.js';

const declaredNames = travelFunctionDeclarations.map((tool: any) => tool?.name);

test('travel tools are scoped only to the travel domain', () => {
  assert.equal(shouldEnableTravelTools('travel'), true);
  assert.equal(shouldEnableTravelTools('research'), false);
  assert.equal(shouldEnableTravelTools('finance'), false);
  assert.equal(shouldEnableTravelTools(null), false);
  assert.equal(shouldEnableTravelTools(undefined), false);
});

test('transactional travel tools are not exposed to the model', () => {
  for (const name of ['create_price_alert', 'make_reservation', 'book_attraction']) {
    assert.equal(isTransactionalTravelTool(name), true);
    assert.equal(declaredNames.includes(name), false, `${name} must not be in Gemini function declarations`);
  }
});

test('transactional travel calls fail closed and never fabricate success', async () => {
  const booking = await executeToolCall('make_reservation', {
    bookingType: 'flight',
    itemId: 'off_test',
    dates: '2026-09-01',
    price: 100,
  }, { duffelClient: null });

  assert.equal(booking.status, 'unavailable');
  assert.equal(booking.executed, false);
  assert.equal(booking.reason, 'TRANSACTION_DISABLED');
  assert.doesNotMatch(booking.message, /successfully booked|confirmed|pnr generated/i);

  const alert = await executeToolCall('create_price_alert', {
    entityType: 'flight',
    destination: 'LHR',
    dates: '2026-09-01',
  }, { duffelClient: null });

  assert.equal(alert.status, 'unavailable');
  assert.equal(alert.executed, false);
  assert.doesNotMatch(alert.message, /monitor daily|alert created|successfully/i);
});

test('unconnected read-only travel providers return unavailable instead of mock data', async () => {
  const flight = await executeToolCall('search_flights', {
    origin: 'SIN',
    destination: 'LHR',
    departureDate: '2026-09-01',
  }, { duffelClient: null });
  assert.equal(flight.status, 'unavailable');
  assert.equal(flight.executed, false);
  assert.equal('flights' in flight, false, 'must not substitute mock flight results');

  const hotel = await executeToolCall('search_hotels', {
    location: 'London',
    checkInDate: '2026-09-01',
    checkOutDate: '2026-09-03',
  }, { duffelClient: null });
  assert.equal(hotel.status, 'unavailable');
  assert.equal('hotels' in hotel, false, 'must not substitute hard-coded hotels');

  const attraction = await executeToolCall('search_attractions', { location: 'London' }, { duffelClient: null });
  assert.equal(attraction.status, 'unavailable');
  assert.equal('attractions' in attraction, false, 'must not substitute hard-coded attractions');
});

test('clarification remains a non-transactional human-in-loop action', async () => {
  const result = await executeToolCall('ask_clarifying_question', { question: 'What is your travel budget?' }, { duffelClient: null });
  assert.equal(result.status, 'success');
  assert.equal(result.executed, false);
  assert.equal(result.action, 'PAUSE_AND_ASK');
  assert.equal(result.message, 'What is your travel budget?');
});
