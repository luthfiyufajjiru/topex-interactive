import initMap from './MapTools/index.js'
import fetchTopex from './fetchTopex.js'
import { RenderTable } from './Spreadsheets/index.js';

let workonline = true

document.getElementById("data-switch-workonline").addEventListener("change", () => {
  if (workonline) {
    workonline = false;
    $("#spreadsheet").empty()
    $("#spreadsheet-wrapper").hide()
  } else {
    workonline = true;
    $("#spreadsheet-wrapper").show()
    myTable = RenderTable()
  }
});

let myTable = workonline ? RenderTable() : null
initMap(myTable)

let fetchButton = document.getElementById("fetch-data");
fetchButton.addEventListener("click", async () => {
  $("#overlay-spinner").fadeIn();
  try {
    await fetchTopex(myTable, workonline);
  } catch (error) {
  } finally {
    $("#overlay-spinner").fadeOut();
  }
});
