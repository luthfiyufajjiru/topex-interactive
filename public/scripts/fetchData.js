let baseUri = "https://topex-downloader-api.herokuapp.com/api/v1/";

async function fetchData(mode, workonline) {
  let result;

  let endpoint = baseUri + `${mode}?`;
  endpoint += `north=${parseFloat(north.value)}&`;
  endpoint += `west=${parseFloat(west.value)}&`;
  endpoint += `east=${parseFloat(east.value)}&`;
  endpoint += `south=${parseFloat(south.value)}`;
  
  if(!workonline){
    endpoint += '&download=true';
  }

  try {
    if(workonline)
    {
      const response = await fetch(endpoint, { headers: { 'mode': 'no-cors' } })
      const jsonResponse = await response.json();
      if (response.ok) {
        result = jsonResponse;
      } else if (response.status === 400){
        throw new Error(jsonResponse.error)
      }
    }else if(!workonline){
      window.open(endpoint, "_blank")
    }
    
  } catch (error) {
    throw error
  }
  return result;
}

export default fetchData