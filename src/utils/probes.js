/*
    * input format:
    *  [
    *   0,           probe.pk,
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
   const trueFalse = d => (d === 1 ? true : false),
   zeroIsNull = d => (d === 0 ? null : d),
   emptyStringIsNull = d => (d === "" ? null : d);
 
 const ProbePropertiesMap = [
   ["id", d => d], //: 0,
   ["asn_v4", zeroIsNull], //: 1,
   ["asn_v6", zeroIsNull], //: 2,
   ["country_code", emptyStringIsNull], //: 3,
   ["is_anchor", trueFalse], //: 4,
   ["is_public", trueFalse], //: 5,
   ["geometry__coordinates__1", d => d], //: 6,
   ["geometry__coordinates__0", d => d], //: 7,
   ["prefix_v4", zeroIsNull], //: 8,
   ["prefix_v6", zeroIsNull], //: 9,
   ["address_v4", zeroIsNull], //: 10,
   ["address_v6", zeroIsNull], //: 11,
   ["status__id", d => d], //: 12,
   ["status__since", d => new Date(d * 1000)] //: 13
 ];
 
 export const probeStatusMap = id =>
   ["never connected", "connected", "disconnected", "abandoned"][id];
 
 export const mangleProbeProperties = probeObj => {
   if (!probeObj) {
     return Array(14);
   }
   return ProbePropertiesMap.reduce((props, prop) => {
     const keys = prop[0].split("__"),
       value = keys.reduce((map, k) => map[k], probeObj);
     return [...props, value];
   }, []);
 };
 
 export const unMangleProbeProperties = probePropsArray => {
   let newTree = {};
 
   // I think it's pretty nifty.
   // Normally you'd build this nested objects with
   // a reduceRight (start with the deepest nested object and wrap that on each reduce cycle
   // in a new object). But then you would not be able to merge with the
   // startTree structure: you wouldn't know where in that tree you are.
   //
   // So a normal reduce from the left it should be, so you can track both the tree you're building
   // and the tree you want to merge with. But reducing from the left isn't straightforward.
   // You have to recursively add the subtree to the final tree you're building in each reduce cycle.
   //
   // So that's what we do, we pass to each the cycle the complete tree `tree` that has a pointer to the subtree.
   // the subtree mutates itself by moving a pointer up the branches of itself.
   // thus the subtree ends up empty. The complete tree `tree` starts out with
   // the tree it wants to merge in (the 'startTree' var) and holds a pointer to the base of the subtree.
   const mergeTree = ({ subKeys, startTree, value }) =>
     subKeys.reduce(
       ([tree, subTree], sk, i) => {
         // if this is the first cycle make a pointer to the base of the subTree,
         // do nothing in the next cycles. The pointer will point to the base of the growing subtree structure.
         tree = (i === 0 && subTree) || tree;
 
         // if we're at the end of the subkeys insert the value (a leaf), otherwise
         // create a branch. If that branch is already in the startTree: use that one (that's the merge).
         subTree[sk] = i === subKeys.length - 1 ? value : subTree[sk] || {};
 
         // give the complete tree and a pointer to the new subtree to the next cycle.
         return [tree, subTree[sk]];
       },
       // start out with an empty tree of a startTree that we want to merge.
       [{}, startTree || {}]
     )[0];
 
   ProbePropertiesMap.map(([keyString, transform], i) => {
     const subKeys = keyString.split("__");
     newTree = mergeTree({
       subKeys,
       startTree: newTree,
       value: (probePropsArray && transform(probePropsArray[i])) || null
     });
   });
 
   return newTree;
 };
 
 export const timeStampToLocalDate = timestamp => new Date(timestamp * 1000);
 export const stringAsUTCToDate = dateString => new Date(`${dateString}Z`);
 export const within24HourWindow = date =>
   new Date(date).getTime() + 24 * 60 * 60 * 1000 >= Date.now();
 