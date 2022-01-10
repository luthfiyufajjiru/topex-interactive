let L = window.L;

var gmap = L.tileLayer(
    "http://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}",
    {
      attribution: "google"
    }
  ),
  map = new L.Map("map", {
    center: new L.LatLng(0, 120),
    zoom: 4.4
  }),
  drawnItems = L.featureGroup().addTo(map);

L.control
  .layers(
    {
      google: gmap.addTo(map)
    },
    {
      drawlayer: drawnItems
    },
    {
      position: "topleft",
      collapsed: false
    }
  )
  .addTo(map);
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

let layerCount = 0;
map.on(L.Draw.Event.CREATED, function (event) {
  var layer = event.layer;
  if (layerCount < 1) {
    drawnItems.addLayer(layer);
    layerCount++;
  }
});
