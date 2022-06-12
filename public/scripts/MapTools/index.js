import {disableCoordinatesForm, assignFormFromBoundaries, updateStepBoundaries} from './reactivity.js'
import {north,south,west,east} from './formCoordinates.js'

let L = window.L;

let layerCount = 0;

let boundaries;

var tooltipTriggerList = [].slice.call(
  document.querySelectorAll('[data-bs-toggle="tooltip"]')
);

var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
  return new bootstrap.Tooltip(tooltipTriggerEl);
});

var map = new L.Map("map", {
  center: new L.LatLng(0, 120),
  zoom: 4.4
})

var gmap = L.tileLayer("http://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}", {attribution: "google"})

export default function initMap(myTable){

  var drawnItems = L.featureGroup().addTo(map)

  L.control.layers({google: gmap.addTo(map)},{drawlayer: drawnItems},{position: "topleft", collapsed: false}).addTo(map);

  map.addControl(
    new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        poly: {
          allowIntersection: false
        }
      },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true
        }
      }
    })
  );

  map.on(L.Draw.Event.CREATED, function (event) {
    var layer = event.layer;
    if (layerCount < 1) {
      drawnItems.addLayer(layer);
      layerCount++;
      boundaries = layer.getBounds();
      assignFormFromBoundaries(boundaries)
      updateStepBoundaries(north.value, south.value, east.value, west.value)
      disableCoordinatesForm(false)
      $("#fetch-data").prop("disabled", false);
    }
  });

  map.on(L.Draw.Event.EDITRESIZE, function (event) {
    var layer = event.layer;
    boundaries = layer.getBounds();
    assignFormFromBoundaries(boundaries)
    updateStepBoundaries(north.value, south.value, east.value, west.value)
  });

  map.on(L.Draw.Event.EDITMOVE, function (event) {
    var layer = event.layer;
    boundaries = layer.getBounds();
    assignFormFromBoundaries(boundaries)
    updateStepBoundaries(north.value, south.value, east.value, west.value)
  });

  map.on(L.Draw.Event.EDITED, function (event) {
    boundaries = event.layers.getLayers()[0].getBounds();
    assignFormFromBoundaries(boundaries)
    updateStepBoundaries(north.value, south.value, east.value, west.value)
  });

  map.on(L.Draw.Event.DELETED, function (event) {
    layerCount--;
    north.value = "";
    west.value = "";
    east.value = "";
    south.value = "";

    disableCoordinatesForm(true)
    if(myTable != null)
    {
      myTable.setData([]);
      $("#fetch-data").prop("disabled", true);
    }
  });

  north.addEventListener("change", () => {
    if (boundaries != null) {
      let val = parseFloat(north.value);
      boundaries._northEast.lat = val;
      drawnItems.getLayers()[0].setBounds(boundaries);
      updateStepBoundaries(north.value, south.value, east.value, west.value)
    }
  });
  
  south.addEventListener("change", () => {
    if (boundaries != null) {
      let val = parseFloat(south.value);
      boundaries._southWest.lat = val;
      drawnItems.getLayers()[0].setBounds(boundaries);
      updateStepBoundaries(north.value, south.value, east.value, west.value)
    }
  });
  
  west.addEventListener("change", () => {
    if (boundaries != null) {
      let val = parseFloat(west.value);
      boundaries._southWest.lng = val;
      drawnItems.getLayers()[0].setBounds(boundaries);
      updateStepBoundaries(north.value, south.value, east.value, west.value)
    }
  });
  
  east.addEventListener("change", () => {
    if (boundaries != null) {
      let val = parseFloat(east.value);
      boundaries._northEast.lng = val;
      drawnItems.getLayers()[0].setBounds(boundaries);
      updateStepBoundaries(north.value, south.value, east.value, west.value)
    }
  });

}