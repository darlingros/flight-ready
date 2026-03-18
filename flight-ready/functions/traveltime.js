// Netlify Function — calculates drive time using Google Maps server-side
// No CORS issues, no browser SDK restrictions

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY;
  if (!GOOGLE_MAPS_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GOOGLE_MAPS_KEY not set in Netlify environment variables' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { placeId, destLat, destLng, destName } = body;
  if (!placeId || !destLat || !destLng) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  try {
    // Step 1: Geocode the placeId to lat/lng
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId)}&key=${GOOGLE_MAPS_KEY}`;
    const geoResp = await fetch(geoUrl);
    const geoData = await geoResp.json();

    if (geoData.status !== 'OK' || !geoData.results[0]) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: 'Geocoding failed: ' + geoData.status })
      };
    }

    const loc = geoData.results[0].geometry.location;

    // Step 2: Distance Matrix API (server-side — works perfectly here)
    const origin = `${loc.lat},${loc.lng}`;
    const dest = `${destLat},${destLng}`;
    const matrixUrl = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${encodeURIComponent(origin)}`
      + `&destinations=${encodeURIComponent(dest)}`
      + `&mode=driving`
      + `&departure_time=now`
      + `&traffic_model=best_guess`
      + `&key=${GOOGLE_MAPS_KEY}`;

    const matrixResp = await fetch(matrixUrl);
    const matrixData = await matrixResp.json();

    if (matrixData.status !== 'OK') {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: 'Distance Matrix failed: ' + matrixData.status })
      };
    }

    const element = matrixData.rows[0].elements[0];
    if (element.status !== 'OK') {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: 'No route found: ' + element.status })
      };
    }

    const duration = element.duration_in_traffic || element.duration;
    const durationMins = Math.ceil(duration.value / 60);
    const h = Math.floor(durationMins / 60);
    const m = durationMins % 60;
    const durationText = (h > 0 ? h + ' hr ' : '') + m + ' min';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMins, durationText })
    };

  } catch(err) {
    return {
      statusCode: 200,
      body: JSON.stringify({ error: err.message || 'Unknown error' })
    };
  }
};
