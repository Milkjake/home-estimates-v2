const axios = require("axios");

const ADDRESS = "12 Whitu Street, Khandallah, Wellington";

(async function () {
  const res = await axios.get("https://gateway.homes.co.nz/address/search", {
    params: { Address: ADDRESS },
  });

  const { Results, Error } = res.data;

  if (Results && Results.length > 0) {
    const { Title, Lat, Long, StreetNumber, Street, Suburb, City } = Results[0];

    const res = await axios.get(
      "https://gateway.homes.co.nz/property/resolve",
      {
        params: {
          address: Title,
          lat: Lat,
          long: Long,
          street_number: StreetNumber,
          street: Street,
          suburb: Suburb,
          city: City,
        },
      }
    );

    const { property_id, error } = res.data;

    if (property_id) {
      const res = await axios.get("https://gateway.homes.co.nz/properties", {
        params: {
          property_ids: property_id,
        },
      });

      const { cards, error } = res.data;

      if (cards && cards.length > 0) {
        const {
          date,
          url,
          property_details: {
            address,
            display_estimated_value_short,
            display_estimated_lower_value_short,
            display_estimated_upper_value_short,
          },
        } = cards[0];

        //todo: add property info
      }
    }
  }
})();
