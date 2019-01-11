import * as topojson from "topojson-client";

export const loadCountryGeoInfo = async ({ ...props }) => {
  /*
   * arguments:
   *
   * detail              : [ 10m, 50m, 110m]
   * places              : [15, 150, null]
   * countryGeoInfoUrl   : custom place to load topojson from
   * showAntarctica      : true|false
   *
   * filename should be of format `world-geo<PLACES>_ne<DETAIL>.topo.json
   */
  const DEFAULT_GEO_OBJECTS_KEY = "openipmapCountries-ne50m";
  const SMALL_COUNTRIES_ONLY_OBJECTS_KEY = "countries_110m";
  const detail = props.detail || "50m",
    places = (typeof props.places === "undefined" && "150") || props.places;

  const fetchUrl =
    props.countryGeoInfoUrl ||
    `/geo/world${(places && "-geo") || ""}${(places && places) ||
      "" ||
      ""}_ne${detail}.topo.json`;
  const geoKey =
    (detail === "50m" && DEFAULT_GEO_OBJECTS_KEY) ||
    SMALL_COUNTRIES_ONLY_OBJECTS_KEY;
  let response = await fetch(fetchUrl).catch(err => {
    console.log(err);
    console.log(`${fetchUrl} does not exist.`);
  });
  let geoData = await response.json().catch(error => {
    console.log("error loading geographic information (topojson)");
    console.log(error);
    return null;
  });
  return topojson.feature(geoData, geoData.objects[geoKey]).features;
};
