let baseUri = "https://topex-downloader-api.herokuapp.com/api/v1/";

async function fetchData(mode) {
  let endpoint = baseUri + `${mode}?`;
  endpoint += `north=${parseFloat(north.value)}&`;
  endpoint += `west=${parseFloat(west.value)}&`;
  endpoint += `east=${parseFloat(east.value)}&`;
  endpoint += `south=${parseFloat(south.value)}`;

  let result;

  try {
    const response = await fetch(endpoint, { headers: { 'mode': 'no-cors' } });
    if (response.ok) {
      const jsonResponse = await response.json();
      result = jsonResponse;
    }
  } catch (error) {
    console.log(error);
  }
  return result;
}

export default fetchData