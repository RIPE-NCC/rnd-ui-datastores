const trendsBaseUrl = apiServer => {
  return `https://${apiServer}/api/v1/trends/`;
};

// Enrich the standard js error
// with a `detail` attribute.
// The API throws errors that includes this field
// So we don't have two write two separate handlers
// upstream.
const errHandler = err => {
  console.log(err);
  err.detail = err.message;
  throw err;
};

export const loadTrendsForMsmAndProbe = async ({
  msmId,
  prbId,
  apiServer = __TRENDS_API_SERVER__,
  fetch = window.fetch
}) => {
  const fetchUrl = `${trendsBaseUrl(apiServer)}/${msmId}/${prbId}/summary`;

  let response = await fetch(fetchUrl, {
    credentials: "omit"
  }).catch(err => {
    console.log(`${fetchUrl} cannot be loaded.`);
    err.detail = err.message;
    throw err;
  });

  // we could check for response.ok here and then `throw response`,
  // that would then be caught by the client's code second .then() argument.
  // not sure if it's worth it right now.
  let trendsData = await response.json().catch(errHandler);

  return trendsData;
};
