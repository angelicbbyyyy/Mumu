'use strict';

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const url = String(body.url || '');
    const method = String(body.method || 'POST').toUpperCase();
    const headers = body.headers && typeof body.headers === 'object' ? body.headers : {};
    const payload = body.body;

    if (!/^https?:\/\//i.test(url)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'A valid upstream URL is required.' }),
      };
    }

    const upstream = await fetch(url, {
      method,
      headers,
      body: payload == null ? undefined : JSON.stringify(payload),
    });

    const text = await upstream.text();
    let contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

    return {
      statusCode: upstream.status,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      },
      body: text,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error && error.message ? error.message : 'Proxy request failed.',
      }),
    };
  }
};
