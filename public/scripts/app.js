import *  as mp from "./map.js";
import wasm from "./vendor/wasm/load.js";

let map = new L.Map("map", {
  center: new L.LatLng(0, 120),
  zoom: 4.4
})

let gSwitch = document.getElementById("data-switch")
let fetchButton = document.getElementById("fetch-data")

function deletePolygonCallback(event){
  let data = `
    <tr class="align-middle text-center">
      <td class="long">-</td>
      <td class="lat">-</td>
      <td class="val">-</td>
      <td class="type">-</td>
    </tr>
    <tr class="align-middle text-center">
      <td class="long">-</td>
      <td class="lat">-</td>
      <td class="val">-</td>
      <td class="type">-</td>
    </tr>
  `
  $("#data-table").find("tbody").empty()
  $("#data-table").find("tbody").html(data)
  fetchButton.disabled = true
  $("#download-status").hide(800)
  HideSaveButton()
}

mp.initMap(map, deletePolygonCallback)

gSwitch.addEventListener("change", function (event) {
  withGravity = event.target.checked
})

fetchButton.addEventListener("click", function (event) {
  $("#data-table").find("tbody").empty()
  $("#download-status").show(800)
  console.log("downloading...")
  wasm.renderTable(parseFloat(mp.north.value),parseFloat(mp.south.value),parseFloat(mp.east.value),parseFloat(mp.west.value),Boolean(gSwitch.value))
})