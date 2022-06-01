import initMap from './MapTools/index.js'
import fetchTopex from './fetchTopex.js'
import myTable from './Spreadsheets/index.js';

initMap(myTable)

let fetchButton = document.getElementById("fetch-data");
fetchButton.addEventListener("click", async () => {
  $("#overlay-spinner").fadeIn();
  try {
    await fetchTopex();
  } catch (error) {
  } finally {
    $("#overlay-spinner").fadeOut();
  }
});
