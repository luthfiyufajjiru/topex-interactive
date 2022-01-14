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

let bindCoordinates = () => {
  for (var i in map._layers[32]._layers) {
    var _ = map._layers[32]._layers[i]._latlngs[0];
    return _.map((a) => {
      return { ...a };
    });
  }
};

let boundaries;

let north = document.getElementById("north");
let south = document.getElementById("south");
let west = document.getElementById("west");
let east = document.getElementById("east");

map.on(L.Draw.Event.CREATED, function (event) {
  var layer = event.layer;
  if (layerCount < 1) {
    drawnItems.addLayer(layer);
    layerCount++;
    boundaries = layer.getBounds();
    north.value = boundaries.getNorth();
    west.value = boundaries.getWest();
    east.value = boundaries.getEast();
    south.value = boundaries.getSouth();
  }
});

map.on(L.Draw.Event.EDITRESIZE, function (event) {
  var layer = event.layer;
  boundaries = layer.getBounds();
  north.value = boundaries.getNorth();
  west.value = boundaries.getWest();
  east.value = boundaries.getEast();
  south.value = boundaries.getSouth();
});

map.on(L.Draw.Event.EDITMOVE, function (event) {
  var layer = event.layer;
  boundaries = layer.getBounds();
  north.value = boundaries.getNorth();
  west.value = boundaries.getWest();
  east.value = boundaries.getEast();
  south.value = boundaries.getSouth();
});

map.on(L.Draw.Event.EDITED, function (event) {
  boundaries = event.layers.getLayers()[0].getBounds();
  north.value = boundaries.getNorth();
  west.value = boundaries.getWest();
  east.value = boundaries.getEast();
  south.value = boundaries.getSouth();
});

map.on(L.Draw.Event.DELETED, function (event) {
  layerCount--;
  north.value = "";
  west.value = "";
  east.value = "";
  south.value = "";
});

north.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(north.value);
    if (val > boundaries._northEast.lat) {
      boundaries._northEast.lat += parseFloat(north.step);
    } else if (val < boundaries._northEast.lat) {
      boundaries._northEast.lat -= parseFloat(north.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

south.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(south.value);
    if (val > boundaries._southWest.lat) {
      boundaries._southWest.lat += parseFloat(south.step);
    } else if (val < boundaries._southWest.lat) {
      boundaries._southWest.lat -= parseFloat(south.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

west.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(west.value);
    if (val > boundaries._southWest.lng) {
      boundaries._southWest.lng += parseFloat(west.step);
    } else if (val < boundaries._southWest.lng) {
      boundaries._southWest.lng -= parseFloat(west.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

east.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(east.value);
    if (val > boundaries._northEast.lng) {
      boundaries._northEast.lng += parseFloat(east.step);
    } else if (val < boundaries._northEast.lng) {
      boundaries._northEast.lng -= parseFloat(east.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

let withGravity = false;

document.getElementById("data-switch").addEventListener("change", () => {
  if (withGravity) {
    withGravity = false;
  } else {
    withGravity = true;
  }
});

let baseUri = "https://topex-downloader-api.herokuapp.com/api/v1/";

async function fetchElevation() {
  if (boundaries != null) {
    let endpoint = baseUri + "elevation?";
    endpoint += `north=${parseFloat(north.value)}&`;
    endpoint += `west=${parseFloat(west.value)}&`;
    endpoint += `east=${parseFloat(east.value)}&`;
    endpoint += `south=${parseFloat(south.value)}`;
    console.log(endpoint);
    try {
      let response = await fetch(endpoint, { mode: "no-cors" });
      if (response.ok) {
        const jsonResponse = await response.json();
      }
    } catch (error) {
      console.log(error);
    }
  }
}
