import { initMap } from "./map.js";

let map = new L.Map("map", {
  center: new L.LatLng(0, 120),
  zoom: 4.4
})

function deletePolygonCallback(event){
}

initMap(map, deletePolygonCallback)
