import localforage from "localforage";
import { unMangleProbeProperties } from "../utils/probes";

const LOCAL_DB_NAME = "atlas",
  LOCAL_KEY_NAME = "currentProbes",
  CACHE_INVALIDATE_SECONDS = 86400 * 1000,
  CACHE_VERSION = 2;

const atlasMeasurementsBaseUrl = (apiServer, useES, options) => {
  console.log(__USE_ES__);
  console.log(`${(!useES && "not") || ""} using Elastic Search`);
  useES = useES || __USE_ES__;
  const infix = (useES && __ES_INFIX__) || __LEGACY_INFIX__;
  return `https://${apiServer}/api/v2/measurements${infix}${(options &&
    options.groups &&
    "/groups") ||
    ""}`;
};

const atlasProbesBaseUrl = apiServer => {
  return `https://${apiServer}/api/v2/probes`;
};

/*
 * ERROR HANDLING
 *
 * Either you can:
 * 1) pass the standard errHandler function listed below in the .catch() on a fetch OR
 * 2) define a custom error and throw that.
 *
 * custom error object definition:
 *
 * {
 *    status: <HTTPStatusCode::<Number> || "customErr"::<String>>
 *    detail: <String>
 * }
 *
 * `status` is the HTTP status code that you can pass on from a network error from fetch or the special
 * variant "customErr", in which case a special message stating an internal error will be displayed to
 * the user.
 *
 * `detail` is the message for the user that will be displayed below the generic error message.
 * please do not repeat the generic error message ("404. file not found") but try to be as specific
 * as possible.
 */

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

export const loadMsmDetailData = async ({
  msmId,
  apiServer,
  useES,
  onlyFields = null
}) => {
  let fetchUrl = `${atlasMeasurementsBaseUrl(apiServer, useES)}/${msmId}`;
  fetchUrl =
    (onlyFields &&
      `${fetchUrl}/?fields=${onlyFields && onlyFields.join(",")}`) ||
    fetchUrl;
  console.log(fetchUrl);

  let response = await fetch(fetchUrl, {
    credentials: "include"
  }).catch(err => {
    console.log(`${fetchUrl} does not exist.`);
    console.log(err);
    err.detail = err.message;
    throw err;
  });

  // HTTP status errors do NOT throw with the fetch API.
  // Still we do not want to continue with 500 etc.

  // Also Atlas can throw more detailed errors contained
  // in a 'errors' field in the JSON error msg.
  // We'll try to move the inner error.errors.detail to overwrite
  // the error.detail field

  // {
  //   "error": {
  //     "status": 400,
  //     "errors": [
  //       {
  //         "source": { "pointer": "" },
  //         "detail": "Measurement ID should be an integer between 1 and 2147483647"
  //       }
  //     ],
  //     "code": 102,
  //     "detail": "There was a problem with your request",
  //     "title": "Bad Request"
  //   }
  // }

  let msmData = await response.json().catch(err => {
    // We can't parse the body of the message as JSON
    console.log("could not unwrap json from HTTP response. Is this JSON?");
    const parseErr = {
      detail:
        "The server threw an error, additionally the server is talking gibberish to us.",
      status: response.status
    };
    throw parseErr;
  });

  if (!response.ok) {
    console.log("HTTP status code indicated error.");
    const error = msmData.error;

    // There is JSON, but we don't know its format!
    if (!error) {
      throw {
        detail:
          "The server threw an error, additionally the JSON from the response of the server could not be parsed.",
        status: response.status
      };
    }

    const detailText =
      (error.errors && error.errors.length > 0 && error.errors[0].detail) ||
      response.statusText;
    const statusErr = { status: response.status, detail: detailText };
    throw statusErr;
  }

  return msmData;
};

export const loadMsmPrivateData = async ({ msmId, apiServer }) => {
  const fetchUrl = `${atlasMeasurementsBaseUrl(apiServer)}/${msmId}/private`;

  let response = await fetch(fetchUrl, {
    credentials: "include"
  }).catch(err => {
    console.log(`${fetchUrl} cannot be loaded.`);
    err.detail = err.message;
    throw err;
  });

  // we could check for response.ok here and then `throw response`,
  // that would then be caught by the client's code second .then() argument.
  // not sure if it's worth it right now.

  let privateData = await response.json().catch(errHandler);

  return privateData;
};

export const stopMsm = async ({ msmId, apiServer, dummyMode }) => {
  if (dummyMode) {
    return { status: 204, message: "success", detail: "dummy success" };
  }

  const fetchUrl = `${atlasMeasurementsBaseUrl(apiServer)}/${msmId}`;

  let deleteConfirmation,
    response = await fetch(fetchUrl, {
      credentials: "include",
      method: "DELETE"
    }).catch(err => {
      // probably we can't reach the API server.
      // are we even online?
      console.log(`${fetchUrl} returned an error.`);
      console.log(err);
      if (!navigator.onLine) {
        return Promise.reject({
          ...err,
          status: "error",
          detail: "Your browser doesn't currently have an internet connection.",
          message: "Browser offline"
        });
      } else {
        return Promise.reject({
          ...err,
          status: "error",
          message: "unknown error",
          detail: "An error occured while trying to stop the measurement."
        });
      }
    });

  // this response:
  // match response {
  //  Some(responseObject) => code 204, ok() and statusText: "No Content",
  //  Err => code 400, !ok() and json error message
  // }
  console.log("stopping returned something.");
  if (
    response.ok &&
    response.status == 204 &&
    response.statusText === "No Content"
  ) {
    return Promise.resolve({
      status: response.status,
      message: "success",
      detail: "The request to stop the measurement was successful."
    });
  }

  deleteConfirmation = await response.json().catch(err => {
    return Promise.reject({
      ...err,
      status: response.status || "unknown",
      message: err.message || "unknown error",
      detail: err.detail || "unkown error"
    });
  });

  return (
    (deleteConfirmation &&
      Promise.reject({
        ...deleteConfirmation.error,
        message: "Stop failed"
      })) ||
    Promise.reject({
      status: "unknown",
      message: "unknown error",
      detail:
        "An unknown error occured while trying to send a stop request for the measurement."
    })
  );
};

export const markMsmPublic = async ({ msmId, apiServer }) => {
  const fetchUrl = `${atlasMeasurementsBaseUrl(apiServer)}/${msmId}`;

  let response = await fetch(fetchUrl, {
    method: "PATCH",
    credentials: "include",
    body: JSON.stringify({ is_public: true }),
    headers: {
      "Content-Type": "application/json"
    }
  }).catch(errHandler);

  let markSucceeded = await response.json().catch(errHandler);
  return markSucceeded;
};

export const changeMsmDescription = async ({
  msmId,
  apiServer,
  newDescription
}) => {
  const fetchUrl = `${atlasMeasurementsBaseUrl(apiServer)}/${msmId}`;

  let response = await fetch(fetchUrl, {
    method: "PATCH",
    credentials: "include",
    body: JSON.stringify({ description: newDescription }),
    headers: { "Content-Type": "application/json" }
  }).catch(errHandler);

  let descriptionSucceeded = await response.json().catch(errHandler);
  return descriptionSucceeded;
};

export const loadParticipationRequests = async (msmId, apiServer) => {
  // always use ES, legacy does NOT return participant_logs
  const fetchUrl = `${atlasMeasurementsBaseUrl(
    apiServer,
    true
  )}/${msmId}?optional_fields=participation_requests,participant_logs&fields=participation_requests,participant_logs`;

  let response = await fetch(fetchUrl, { credentials: "include" }).catch(
    errHandler
  );
  let prData = await response.json().catch(errHandler);
  return prData;
};

export const loadParticipatingProbesPropertiesForMeasurement = async ({
  msmId,
  apiServer,
  useES
}) => {
  const fetchUrl = `${atlasMeasurementsBaseUrl(
    apiServer,
    useES
  )}/${msmId}?fields=probes`;

  let response = await fetch(fetchUrl, {
    credentials: "include"
  }).catch(errHandler);
  let probesData = await response.json().catch(errHandler);
  return probesData.probes;
};

export const loadHistoricalProbesPropertiesOnDate = async ({
  apiServer,
  probesArray,
  dateTime
}) => {
  // The probes archive API (and files) don't go any further back that march 13, 2014.
  // However  : the `country_code` field (that we need) only appears on june 6, 2014.
  // However2 : at least until 2015-01-01 the number of probes seems to be woefully incomplete.
  // So let's use that date for probes information for older measurements.
  const cutOffProbesArchiveDate = new Date("2015-01-01"),
    useCutOffDate = cutOffProbesArchiveDate >= dateTime,
    archiveDate = (!useCutOffDate && dateTime) || cutOffProbesArchiveDate,
    date = archiveDate.toISOString().replace(/T.+/, "");

  const probesString =
      (probesArray.length < 500 &&
        probesArray.reduce(
          (probesString, pId) => `${probesString},${pId}`,
          ""
        )) ||
      null,
    fetchUrl = `${atlasProbesBaseUrl(
      apiServer
    )}/archive/?date=${date}${(probesString && `&probe=${probesString}`) ||
      ""}`;

  let response = await fetch(fetchUrl).catch(errHandler);
  let probesData = await response.json().catch(errHandler);

  return {
    probesProperties: probesData.results,
    archiveDate: archiveDate,
    annotations:
      useCutOffDate &&
      "No probes information for this date, using the oldest available"
  };
};

export const loadAllProbesWithOfflineStorage = async ({ apiServer }) => {
  /* django doesn't get any faster than this.
   * The super-secret undocumented /probes/all call.
   *
   * input format:
   *  [
   *   0           probe.pk,
   *   1           probe.asn_v4 if probe.asn_v4 else 0,
   *   2           probe.asn_v6 if probe.asn_v6 else 0,
   *   3           probe.prb_country_code.code,
   *   4           1 if probe.is_anchor else 0,
   *   5           1 if probe.prb_public else 0,
   *   6          lat,
   *   7          lng,
   *   8           probe.prefix_v4 if probe.prefix_v4 else 0,
   *   9           probe.prefix_v6 if probe.prefix_v6 else 0,
   *   10          probe.address_v4 if probe.prb_public and probe.address_v4 else 0,
   *   11           probe.address_v6 if probe.prb_public and probe.address_v6 else 0,
   *   12          probe.status,
   *   13         int(probe.status_since.strftime("%s")) if probe.status_since is not None else None
   *  ]
   */
  const fetchUrl = `${atlasProbesBaseUrl(apiServer)}/all`,
    cacheKey = `${LOCAL_KEY_NAME}_${CACHE_VERSION}`,
    invaliDateKey = `${LOCAL_KEY_NAME}_${CACHE_VERSION}_invalidate_timestamp`,
    createdKey = `${LOCAL_KEY_NAME}_${CACHE_VERSION}_created_timestamp`;

  localforage.config({
    driver: localforage.INDEXEDDB,
    name: LOCAL_DB_NAME,
    storeName: "probes",
    version: "0.1"
  });

  let probesPromise;

  let invaliDate = await localforage.getItem(invaliDateKey).catch(err => {
    console.log(err);
    err.detail = err.message;
    throw err;
  });

  if (!invaliDate || Date.now() > invaliDate) {
    console.log("probes cache is stale. clearing and loading data!");
    // first out clear out all of the cache, to
    // not have older versions lingering around.
    localforage.clear();

    // now load from the API.
    let response = await fetch(fetchUrl).catch(errHandler);
    let probesData = await response.json().catch(err => {
      console.log("error loading probes info");
      err.detail = err.message;
      throw err;
    });
    localforage.setItem(invaliDateKey, Date.now() + CACHE_INVALIDATE_SECONDS);
    localforage.setItem(createdKey, Date.now());
    probesPromise = localforage.setItem(cacheKey, probesData.probes);
  } else {
    console.log(`${(invaliDate - Date.now()) / 60 / 60 / 1000} hours left.`);
    console.log("probes cache is valid. using the cache.");
    probesPromise = localforage.getItem(cacheKey).catch(err => {
      console.log(err);
      err.detail = err.message;
      throw err;
    });
  }

  return probesPromise;
};

export const getCurrentProbesInfo = async (probesArray, apiServer) => {
  let mangledProbesData = await loadAllProbesWithOfflineStorage({ apiServer });

  return probesArray.map(p => {
    const fP =
      (mangledProbesData && mangledProbesData.find(ap => ap[0] === p)) || null;
    if (!fP) {
      console.log(`probe with id ${p} not found.`);
    }
    return (
      (fP && unMangleProbeProperties(fP)) || {
        id: parseInt(p),
        error: "not found"
      }
    );
  });
};

export const loadAPIMeta = async ({ apiServer }) => {
  const fetchUrl = `https://${apiServer}/docs/api/v2/reference/api-docs/api/v2/measurements`;

  let response = await fetch(fetchUrl).catch(err => {
    const metaErr = {
      status: "customErr",
      detail: "Could not load API Schema Information"
    };
    throw metaErr;
  });
  let mData = await response.json().catch(errHandler);
  return mData;
};

export const loadCostsForMeasurement = async ({
  optionProps,
  probesCount,
  is_oneoff,
  apiServer
}) => {
  const fetchRequest = new Request(atlasMeasurementsBaseUrl(apiServer));

  let optionsBody = {
    definitions: [
      optionProps.reduce((acc, n) => ({ ...acc, [n[0]]: n[1] }), {})
    ],
    probes: [
      {
        type: "area",
        value: "WW",
        requested: probesCount
      }
    ],
    is_oneoff: is_oneoff
  };

  let response = await fetch(fetchRequest, {
    method: "OPTIONS",
    credentials: "include",
    headers: new Headers([["Content-Type", "application/json"]]),
    body: JSON.stringify(optionsBody)
  }).catch(errHandler);

  let costs = response.json().catch(err => {
    console.log(`${fetchRequest} doesn't exist.`);
    console.log(err);
    err.detail = err.message;
    throw err;
  });
  return costs;
};

export const loadLastMsmForType = async ({ type, apiServer, useES }) => {
  const fetchUrl = `${atlasMeasurementsBaseUrl(
    apiServer,
    useES
  )}?type=${type}&sort=-id&fields=id&page_size=1`;

  let response = await fetch(fetchUrl).catch(errHandler);

  let msmIds = await response.json().catch(errHandler);
  return msmIds;
};

export const loadMsmGroupMembers = async ({ msmId, apiServer, useES }) => {
  const fetchUrl = `${atlasMeasurementsBaseUrl(apiServer, useES, {
    groups: true
  })}/${msmId}`;

  let response = await fetch(fetchUrl).catch(errHandler);

  let groupMembers = await response.json().catch(errHandler);
  return groupMembers.group_members;
};

export const loadProbesInfo = async ({ ...props }) => {
  /* django doesn't get any faster than this.
   * The super-secret undocumented /probes/all call.
   *
   * input format:
   *  [
   *   0           probe.pk,
   *   1           probe.asn_v4 if probe.asn_v4 else 0,
   *   2           probe.asn_v6 if probe.asn_v6 else 0,
   *   3           probe.prb_country_code.code,
   *   4           1 if probe.is_anchor else 0,
   *   5           1 if probe.prb_public else 0,
   *   6          lat,
   *   7          lng,
   *   8           probe.prefix_v4 if probe.prefix_v4 else 0,
   *   9           probe.prefix_v6 if probe.prefix_v6 else 0,
   *   10          probe.address_v4 if probe.prb_public and probe.address_v4 else 0,
   *   11           probe.address_v6 if probe.prb_public and probe.address_v6 else 0,
   *   12          probe.status,
   *   13         int(probe.status_since.strftime("%s")) if probe.status_since is not None else None
   *  ]
   *
   * Now, no matter what you try, d3 will want to use the first to elements in this array MUTABLY
   * for its x,y coordinates. So we're outputting the array from index 2, thereby reserving for 0,1
   * for d3 weirdness.
   *
   * output format:
   *  [
   *     d3X, d3Y, ...rest of the input array (so all the indexes + 2)
   *  ]
   */

  const fetchUrl = "https://atlas.ripe.net/api/v2/probes/all";

  let response = await fetch(fetchUrl).catch(err => {
    console.log(err);
    console.log(`${fetchUrl} does not exist.`);
  });
  let probesData = await response.json().catch(error => {
    console.log("error loading geographic information (topojson)");
    console.log(error);
    return null;
  });
  // yes, there are probes with location NULL, so kick those out.
  return probesData.probes
    .filter(p => p[6] && p[7])
    .map(p => [null, null, ...p]);
};

export const loadNewProbeInfo = async prb_id => {
  const fetchUrl = `https://atlas.ripe.net/api/v2/probes/${prb_id}`;
  let response = await fetch(fetchUrl).catch(err => {
    console.log(err);
    console.log(`${fetchUrl} does not exist.`);
  });
  let probeData = await response.json().catch(error => {
    console.log("error loading probe info from atlas");
    console.log(error);
    return null;
  });
  // return empty if there's no geolocation data
  return (probeData.geometry && probeData) || {};
};

export const loadRttForProbesData = async asn => {
  const fetchUrl = `https://sg-pub.ripe.net/emile/min-rtt/${asn}.json`;

  let response = await fetch(fetchUrl).catch(err => {
    console.log(err);
    console.log(`${fetchUrl} does not exist.`);
  });
  let rttData = await response.json().catch(error => {
    console.log("error loading probes rtt data");
    console.log(error);
    return null;
  });
  // yes, there are probes with location NULL, so kick those out.
  return rttData;
};
